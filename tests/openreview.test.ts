import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePaperReference,
  documentId,
  paperReference,
  paperUrl,
  paperPdfUrl,
  sourceUrl,
} from "../src/lib/paper-reference";
import {
  emptyLibrary,
  librarySchema,
  paperSchema,
  type Paper,
} from "../src/lib/model";
import { importOpenReview } from "../worker/openreview";
import { reconcileLibraries, resolveMerge } from "../src/lib/reconcile";
import { discoveryInput, addRecommendation } from "../src/lib/recommendations";
import { GitHubLibrarySession } from "../src/lib/github-library";
import worker from "../worker/index";
const id = "HPuSIXJaa9",
  now = "2026-11-02T00:00:00.000Z";
const content = {
  title: "Public paper",
  abstract: "Evidence from a public PDF",
  authors: ["Author One", "Author Two"],
  keywords: ["alignment"],
  pdf: "/pdf/opaque.pdf",
  venue: "NeurIPS 2023",
};
const note = (v2 = true) => ({
  id,
  forum: id,
  readers: ["everyone"],
  cdate: 1690000000000,
  pdate: 1700000000000,
  content: v2
    ? Object.fromEntries(
        Object.entries(content).map(([k, v]) => [k, { value: v }]),
      )
    : content,
});
const paper: Paper = {
  id: `openreview:${id}`,
  openreviewId: id,
  title: "Public paper",
  authors: [],
  abstract: "abstract",
  published: "2023",
  categories: [],
  tags: [],
  notes: "keep notes",
  addedAt: now,
  updatedAt: now,
  status: "unread",
  analysis: null,
  analysisMeta: null,
};
const arxiv: Paper = {
  ...paper,
  id: "1706.03762",
  openreviewId: undefined,
  arxivId: "1706.03762v7",
};
const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test",
  GITHUB_CLIENT_SECRET: "test",
  GITHUB_APP_SLUG: "test",
  SESSION_SECRET: "test-openreview-secret-".repeat(3),
  ASSETS: { fetch: async () => new Response("asset") },
};
const request = (url: string) =>
  worker.fetch(new Request(env.APP_ORIGIN + url), env);
test("forum/PDF variants share a case-sensitive OpenReview identity; old arXiv links/IDs still resolve", () => {
  for (const link of [
    `https://openreview.net/forum?id=${id}`,
    `openreview.net/forum?id=${id}`,
    `https://openreview.net/pdf?id=${id}`,
    `https://www.openreview.net/forum/?id=${id}&noteId=comment#discussion`,
    `openreview:${id}`,
  ]) {
    const ref = parsePaperReference(link);
    assert.deepEqual(ref, { provider: "openreview", id });
    assert.equal(documentId(ref), `openreview:${id}`);
    assert.equal(paperUrl(ref), `https://openreview.net/forum?id=${id}`);
    assert.equal(paperPdfUrl(ref), `https://openreview.net/pdf?id=${id}`);
    assert.equal(
      sourceUrl(ref, "pdf"),
      `/api/source?id=openreview%3A${id}&format=pdf`,
    );
  }
  assert.deepEqual(
    parsePaperReference("https://arxiv.org/pdf/1706.03762v7.pdf"),
    { provider: "arxiv", id: "1706.03762v7" },
  );
  assert.deepEqual(parsePaperReference("hep-th/9901001"), {
    provider: "arxiv",
    id: "hep-th/9901001",
  });
});
test("rejects untrusted hosts, credentials, paths, missing/ambiguous IDs, and query injection before fetching", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("unexpected network");
  });
  for (const link of [
    "https://openreview.net.evil.org/forum?id=x",
    "https://user:pw@openreview.net/forum?id=x",
    "https://openreview.net:8443/forum?id=x",
    "https://openreview.net/group?id=x",
    "https://openreview.net/pdf/opaque.pdf",
    "https://openreview.net/forum",
    "https://openreview.net/forum?id=x&id=y",
    "https://openreview.net/forum?id=x%26other=secret",
    "openreview:../private",
    "https://127.0.0.1/private",
  ]) {
    assert.throws(() => parsePaperReference(link), link);
    const res = await request(`/api/paper?id=${encodeURIComponent(link)}`);
    assert.equal(res.status, 400, link);
  }
  assert.equal(calls, 0);
});
test("API2 wrapped metadata uses public publication date and preserves provider identity without inventing an arXiv ID", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    assert.equal(String(url), `https://api2.openreview.net/notes?id=${id}`);
    return Response.json({ notes: [note()] });
  });
  const p = await importOpenReview(id);
  assert.equal(p.id, `openreview:${id}`);
  assert.equal(p.arxivId, undefined);
  assert.equal(p.openreviewId, id);
  assert.equal(p.published, "2023-11-14");
  assert.deepEqual(p.authors, content.authors);
  assert.equal(p.venue, content.venue);
});
test("legacy API1 fallback occurs only when API2 has no matching note", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    calls.push(String(url));
    return Response.json({
      notes: String(url).includes("api2.") ? [] : [note(false)],
    });
  });
  const p = await importOpenReview(id);
  assert.equal(p.title, content.title);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /api\.openreview\.net/);
});
test("a reply link resolves the public forum before import and does not become a fake paper", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: unknown) =>
    Response.json({
      notes: [
        String(url).endsWith("comment")
          ? {
              ...note(),
              id: "comment",
              forum: id,
              replyto: id,
              content: { title: { value: "Review" } },
            }
          : note(),
      ],
    }),
  );
  const p = await importOpenReview("comment");
  assert.equal(p.openreviewId, id);
  assert.equal(p.title, content.title);
});
test("challenge and rate limit errors never fall back, retry, or fabricate metadata", async (t) => {
  let status = 403,
    calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ name: "ChallengeRequiredError" }, { status });
  });
  await assert.rejects(importOpenReview(id), /접근 인증/);
  assert.equal(calls, 1);
  status = 429;
  await assert.rejects(importOpenReview(id), /요청이 많/);
  assert.equal(calls, 2);
});
test("redirects are handled manually for Cloudflare and never followed to other hosts", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    calls++;
    assert.equal(init?.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { location: "https://another.example/private" },
    });
  });
  const res = await request(`/api/paper?id=openreview%3A${id}`);
  assert.equal(res.status, 502);
  assert.equal(calls, 1);
});
test("private/deleted notes and missing or restricted PDFs are rejected; undisclosed authors stay undisclosed", async (t) => {
  let n: unknown = note();
  t.mock.method(globalThis, "fetch", async () => Response.json({ notes: [n] }));
  for (const replacement of [
    { readers: ["private/group"] },
    { ddate: 1700000000000 },
    { content: { ...note().content, pdf: undefined } },
    {
      content: {
        ...note().content,
        pdf: { value: "/pdf/private.pdf", readers: ["Authors"] },
      },
    },
  ]) {
    n = { ...note(), ...replacement };
    await assert.rejects(importOpenReview(id));
  }
  n = {
    ...note(),
    content: {
      ...note().content,
      authors: { value: ["Hidden author"], readers: ["Authors"] },
    },
  };
  assert.deepEqual((await importOpenReview(id)).authors, []);
});
test("source proxy uses fixed API host, ignores arbitrary PDF URLs, and checks MIME and size", async (t) => {
  let mime = "application/pdf",
    size = "12";
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    calls.push(String(url));
    if (String(url).includes("/notes?"))
      return Response.json({
        notes: [
          {
            ...note(),
            content: {
              ...note().content,
              pdf: { value: "https://evil.example/private" },
            },
          },
        ],
      });
    assert.equal(String(url), `https://api2.openreview.net/pdf?id=${id}`);
    return new Response("%PDF-1.7\nQA", {
      headers: { "Content-Type": mime, "Content-Length": size },
    });
  });
  const path = `/api/source?id=openreview%3A${id}&format=pdf`;
  const good = await request(path);
  assert.equal(good.status, 200);
  assert.match(await good.text(), /^%PDF/);
  mime = "text/html";
  assert.equal((await request(path)).status, 502);
  mime = "application/pdf";
  size = "25000001";
  assert.equal((await request(path)).status, 413);
  assert(calls.every((url) => url.startsWith("https://api2.openreview.net/")));
  const before = calls.length;
  assert.equal(
    (await request(`/api/source?id=openreview%3A${id}&format=html`)).status,
    404,
  );
  assert.equal(calls.length, before);
});
test("mixed libraries preserve notes/edges/provider IDs through schema, reconciliation and GitHub save/reload", async () => {
  const initial = librarySchema.parse({
    ...emptyLibrary(),
    papers: [arxiv, paper],
    edges: [
      {
        id: "e",
        source: arxiv.id,
        target: paper.id,
        label: "related",
        note: "keep edge",
        origin: "manual",
        updatedAt: now,
      },
    ],
  });
  let remote = structuredClone(initial);
  const session = new GitHubLibrarySession(
    {
      read: async () => ({ library: remote, sha: "sha" }),
      write: async (next) => {
        remote = structuredClone(next);
      },
    },
    async (base, local, incoming) =>
      resolveMerge(reconcileLibraries(base, local, incoming)),
    "qa/library",
    0,
  );
  await session.open();
  session.update((l) => ({
    ...l,
    papers: l.papers.map((p) =>
      p.openreviewId ? { ...p, notes: "new OpenReview note" } : p,
    ),
  }));
  await session.flush();
  session.close();
  const restored = librarySchema.parse(JSON.parse(JSON.stringify(remote)));
  assert.equal(
    restored.papers.find((p) => p.openreviewId)!.notes,
    "new OpenReview note",
  );
  assert.deepEqual(restored.edges, initial.edges);
  assert.equal(paperReference(restored.papers[1]).provider, "openreview");
  assert.equal(
    paperSchema.safeParse({ ...paper, arxivId: "1706.03762" }).success,
    false,
  );
  assert.equal(paperSchema.safeParse({ ...paper, id: "wrong" }).success, false);
});
test("OpenReview papers inform discovery context and connection targets while arXiv recommendations still add correctly", () => {
  const library = { ...emptyLibrary(), papers: [paper] };
  const input = discoveryInput(library, "public paper");
  assert.equal(input.context.papers[0].id, paper.id);
  assert.equal(input.excludedIds[0], paper.id);
  const added = addRecommendation(
    library,
    {
      paper: {
        id: arxiv.id,
        arxivId: arxiv.arxivId!,
        title: arxiv.title,
        abstract: arxiv.abstract,
        authors: arxiv.authors,
        published: arxiv.published,
        categories: arxiv.categories,
      },
      reason: "comparison",
      learning: "learn",
      connections: [{ paperId: paper.id, label: "compares", note: "source" }],
    },
    true,
  );
  assert.equal(added.papers.length, 2);
  assert.equal(added.edges[0].target, paper.id);
  assert.equal(added.papers[1].notes, "keep notes");
});
