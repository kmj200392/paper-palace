import { z } from "zod";
import {
  baseId,
  parseArxivId,
  paperSchema,
  type Library,
  type Paper,
} from "./model";

export const discoveryContextSchema = z.object({
  papers: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: z.string().max(500),
        abstract: z.string().max(1200),
        positioning: z.string().max(800),
        tags: z.array(z.string().max(80)).max(8),
        status: z.enum(["unread", "reading", "read"]),
      }),
    )
    .max(60),
  edges: z
    .array(
      z.object({
        source: z.string().max(80),
        target: z.string().max(80),
        label: z.string().max(100),
        note: z.string().max(300),
        origin: z.enum(["manual", "suggested"]),
      }),
    )
    .max(180),
});
export const discoveryInputSchema = z.object({
  query: z.string().trim().min(2).max(500),
  context: discoveryContextSchema,
  excludedIds: z.array(z.string().max(80)).max(1000),
});
export const candidateSchema = paperSchema.pick({
  id: true,
  arxivId: true,
  title: true,
  authors: true,
  abstract: true,
  published: true,
  categories: true,
});
export type Candidate = z.infer<typeof candidateSchema>;
export const recommendationSchema = z.object({
  paper: candidateSchema,
  reason: z.string().min(1).max(1000),
  learning: z.string().min(1).max(1000),
  connections: z
    .array(
      z.object({
        paperId: z.string().min(1).max(80),
        label: z.string().min(1).max(100),
        note: z.string().min(1).max(1000),
      }),
    )
    .max(3),
});
export const discoveryResultSchema = z.object({
  focus: z.string().max(800),
  searchQuery: z.string().max(1200),
  searchedAt: z.string(),
  candidateCount: z.number().int().nonnegative(),
  contextCount: z.number().int().nonnegative(),
  recommendations: z.array(recommendationSchema).max(6),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
export function canonicalPaperId(id: string) {
  try {
    return baseId(parseArxivId(id));
  } catch {
    return id;
  }
}
export function discoveryInput(library: Library, query: string) {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const degrees = new Map<string, number>();
  for (const edge of library.edges)
    for (const id of [edge.source, edge.target])
      degrees.set(id, (degrees.get(id) || 0) + 1);
  const score = (p: Paper) => {
    const text =
      `${p.title} ${p.abstract} ${p.tags.join(" ")} ${p.analysis?.positioning || ""}`.toLowerCase();
    return (
      words.reduce((s, w) => s + (text.includes(w) ? 10 : 0), 0) +
      Math.min(degrees.get(p.id) || 0, 8) +
      (p.status === "read" ? 2 : 0)
    );
  };
  const papers = [...library.papers]
    .sort(
      (a, b) => score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 60);
  const ids = new Set(papers.map((p) => p.id));
  return {
    query: query.trim(),
    excludedIds: library.papers.map((p) => canonicalPaperId(p.arxivId)),
    context: {
      papers: papers.map((p) => ({
        id: p.id,
        title: p.title.slice(0, 500),
        abstract: p.abstract.slice(0, 1200),
        positioning: (p.analysis?.positioning || "").slice(0, 800),
        tags: p.tags.slice(0, 8),
        status: p.status,
      })),
      edges: library.edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .slice(0, 180)
        .map((e) => ({
          source: e.source,
          target: e.target,
          label: e.label,
          note: e.note.slice(0, 300),
          origin: e.origin,
        })),
    },
  };
}
export function addRecommendation(
  library: Library,
  recommendation: Recommendation,
  withConnections: boolean,
): Library {
  const { paper } = recommendationSchema.parse(recommendation);
  const id = canonicalPaperId(paper.arxivId);
  if (library.papers.some((p) => canonicalPaperId(p.arxivId) === id))
    return library;
  if (library.papers.length >= 1000)
    throw new Error("라이브러리에는 최대 1,000편까지 저장할 수 있어요.");
  const now = new Date().toISOString();
  const nextPaper = paperSchema.parse({
    ...paper,
    id,
    addedAt: now,
    updatedAt: now,
    status: "unread",
    tags: [],
    notes: "",
    analysis: null,
    analysisMeta: null,
  });
  const ids = new Set(library.papers.map((p) => p.id));
  const targets = new Set<string>();
  const edges = withConnections
    ? recommendation.connections
        .filter((c) => {
          if (!ids.has(c.paperId) || targets.has(c.paperId) || c.paperId === id)
            return false;
          targets.add(c.paperId);
          return true;
        })
        .map((c) => ({
          id: crypto.randomUUID(),
          source: id,
          target: c.paperId,
          label: c.label,
          note: c.note,
          origin: "suggested" as const,
          updatedAt: now,
        }))
    : [];
  if (library.edges.length + edges.length > 5000)
    throw new Error(
      "연결 한도를 초과해요. 추천 연결을 해제하고 논문만 추가해 주세요.",
    );
  const deleted = { ...library.deleted };
  delete deleted[id];
  return {
    ...library,
    papers: [nextPaper, ...library.papers],
    edges: [...library.edges, ...edges],
    deleted,
    updatedAt: now,
  };
}
