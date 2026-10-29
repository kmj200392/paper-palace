import { z } from "zod";

export const sectionKeys = [
  "motivation",
  "coreConcept",
  "method",
  "experimentalSetup",
  "results",
] as const;
export const sectionLabels: Record<
  (typeof sectionKeys)[number],
  [string, string]
> = {
  motivation: ["Motivation", "왜 이 연구를 했을까"],
  coreConcept: ["Core concept", "핵심 아이디어"],
  method: ["Method", "어떻게 풀었을까"],
  experimentalSetup: ["Experimental setup", "어떻게 검증했을까"],
  results: ["Results", "무엇을 발견했을까"],
};
export const citationSchema = z.object({
  blockId: z.string().max(100),
  quote: z.string().max(400),
});
const pointSchema = z.object({
  text: z.string().max(2400),
  citations: z.array(citationSchema).max(5),
});
export const analysisSchema = z.object({
  positioning: z.string().max(1600),
  tags: z.array(z.string().max(60)).max(8),
  sections: z.object({
    motivation: z.array(pointSchema).max(6),
    coreConcept: z.array(pointSchema).max(6),
    method: z.array(pointSchema).max(6),
    experimentalSetup: z.array(pointSchema).max(6),
    results: z.array(pointSchema).max(6),
  }),
  limitations: z.array(z.string().max(1200)).max(8),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type Citation = z.infer<typeof citationSchema>;
export const blockSchema = z.object({
  id: z.string().max(100),
  kind: z.enum(["heading", "paragraph", "table"]),
  text: z.string().max(30000),
  page: z.number().int().min(1).optional(),
});
export type Block = z.infer<typeof blockSchema>;
export const paperSchema = z.object({
  id: z.string().max(80),
  arxivId: z.string().max(80),
  title: z.string().min(1).max(1500),
  authors: z.array(z.string().max(200)).max(200),
  abstract: z.string().max(15000),
  published: z.string().max(40),
  categories: z.array(z.string().max(80)).max(40),
  addedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(["unread", "reading", "read"]),
  tags: z.array(z.string().max(80)).max(30),
  notes: z.string().max(30000),
  analysis: analysisSchema.nullable(),
  analysisMeta: z
    .object({
      provider: z.enum(["openai", "anthropic"]),
      model: z.string().max(100),
      createdAt: z.string().datetime(),
      sourceHash: z.string().max(100),
      coverage: z.string().max(300),
    })
    .nullable(),
});
export type Paper = z.infer<typeof paperSchema>;
export const edgeSchema = z.object({
  id: z.string().max(100),
  source: z.string().max(80),
  target: z.string().max(80),
  label: z.string().min(1).max(100),
  note: z.string().max(2000),
  origin: z.enum(["manual", "suggested"]),
  updatedAt: z.string().datetime(),
});
export type Edge = z.infer<typeof edgeSchema>;
export const librarySchema = z.object({
  version: z.literal(1),
  papers: z.array(paperSchema).max(1000),
  edges: z.array(edgeSchema).max(5000),
  deleted: z.record(z.string(), z.string().datetime()),
  updatedAt: z.string().datetime(),
});
export type Library = z.infer<typeof librarySchema>;
export type Source = {
  arxivId: string;
  blocks: Block[];
  format: "html" | "pdf";
  hash: string;
};
export const emptyLibrary = (): Library => ({
  version: 1,
  papers: [],
  edges: [],
  deleted: {},
  updatedAt: new Date().toISOString(),
});
export function parseArxivId(input: string) {
  let id = input.trim();
  if (/^https?:\/\//i.test(id)) {
    const url = new URL(id);
    if (
      !["arxiv.org", "www.arxiv.org", "export.arxiv.org"].includes(url.hostname)
    )
      throw new Error("arXiv 링크를 입력해 주세요.");
    id = url.pathname.replace(/^\/(abs|pdf|html)\//, "").replace(/\.pdf$/, "");
  }
  id = id.replace(/^arxiv:/i, "");
  if (!/^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v[1-9]\d*)?$/.test(id))
    throw new Error("올바른 arXiv 링크 또는 ID를 입력해 주세요.");
  return id;
}
export const baseId = (id: string) => id.replace(/v\d+$/, "");
export const normalizeQuote = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim();
export function citationMatches(c: Citation, blocks: Block[]) {
  const block = blocks.find((b) => b.id === c.blockId);
  return (
    !!block &&
    normalizeQuote(c.quote).length >= 12 &&
    normalizeQuote(block.text).includes(normalizeQuote(c.quote))
  );
}
export function verifyAnalysis(a: Analysis, blocks: Block[]): Analysis {
  return {
    ...a,
    sections: Object.fromEntries(
      sectionKeys.map((key) => [
        key,
        a.sections[key].map((p) => ({
          ...p,
          citations: p.citations.filter((c) => citationMatches(c, blocks)),
        })),
      ]),
    ) as Analysis["sections"],
  };
}
// Last writer per item; tombstones prevent another device resurrecting deletions.
export function mergeLibraries(a: Library, b: Library): Library {
  const deleted = { ...a.deleted };
  for (const [id, time] of Object.entries(b.deleted))
    if (!deleted[id] || time > deleted[id]) deleted[id] = time;
  const merge = <T extends { id: string; updatedAt: string }>(
    xs: T[],
    ys: T[],
  ) => {
    const map = new Map(xs.map((x) => [x.id, x]));
    for (const y of ys)
      if (!map.has(y.id) || y.updatedAt > map.get(y.id)!.updatedAt)
        map.set(y.id, y);
    return [...map.values()].filter(
      (x) => !deleted[x.id] || x.updatedAt > deleted[x.id],
    );
  };
  const papers = merge(a.papers, b.papers),
    ids = new Set(papers.map((p) => p.id));
  return {
    version: 1,
    papers,
    edges: merge(a.edges, b.edges).filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    ),
    deleted,
    updatedAt: new Date().toISOString(),
  };
}
