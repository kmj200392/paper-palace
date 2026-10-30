import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import { ArxivSearch } from "../worker/arxiv-search";
import {
  arxivSearchQuery,
  parseArxivFeed,
  searchPlanSchema,
  verifiedRecommendations,
} from "../worker/discovery";
import {
  addRecommendation,
  discoveryInput,
  type Candidate,
  type Recommendation,
} from "../src/lib/recommendations";
import { emptyLibrary, librarySchema, type Paper } from "../src/lib/model";
import { seal } from "../worker/security";
import { saveAccountKey } from "../worker/ai-credentials";

const paper = (id: string): Paper => ({
  id,
  arxivId: id + "v1",
  title: "Agent memory " + id,
  authors: ["Researcher"],
  abstract: "Compress long-term memory for agents",
  published: "2026-01-01",
  categories: ["cs.AI"],
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  status: "read",
  tags: ["memory"],
  notes: "PRIVATE-NOTE",
  analysis: null,
  analysisMeta: null,
});
const library = () => ({
  ...emptyLibrary(),
  papers: [paper("2501.00001"), paper("2501.00002")],
  edges: [
    {
      id: "e",
      source: "2501.00001",
      target: "2501.00002",
      label: "compares",
      note: "Conceptual contrast",
      origin: "manual" as const,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
});
const candidate: Candidate = {
  id: "2601.00003",
  arxivId: "2601.00003v2",
  title: "Actual Candidate",
  authors: ["Actual Author"],
  abstract: "Memory compression comparison",
  published: "2026-01-01",
  categories: ["cs.AI"],
};
const rec: Recommendation = {
  paper: candidate,
  reason: "기존 기억 압축 방법과 비교할 수 있어요.",
  learning: "다른 저장 정책을 살펴볼 수 있어요.",
  connections: [
    {
      paperId: "2501.00001",
      label: "compares with",
      note: "초록에 근거한 비교 제안입니다.",
    },
  ],
};
const plan = {
  groups: [["agent", "memory"]],
  sort: "relevance",
  focus: "기억 압축의 다른 접근을 찾아요.",
};
const rank = {
  recommendations: [
    {
      id: candidate.id,
      reason: rec.reason,
      learning: rec.learning,
      connections: rec.connections,
    },
  ],
};
const feed = (id = "2601.00003v2") =>
  `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/${id}</id><title>Memory &amp; Agents</title><summary>Compress &#x3b1; memory.</summary><published>2026-01-01T00:00:00Z</published><author><name>A &amp; B</name></author><category term="cs.AI" /></entry></feed>`;
const testKey = "sk-TEST-ONLY-DISCOVERY-KEY";
const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test",
  GITHUB_CLIENT_SECRET: "test",
  GITHUB_APP_SLUG: "test",
  SESSION_SECRET: "test-only-secret-".repeat(4),
  ASSETS: { fetch: async () => new Response("asset") },
  ARXIV_SEARCH: {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async () =>
        Response.json({
          papers: [
            candidate,
            { ...candidate, id: "2501.00001", arxivId: "2501.00001v5" },
          ],
        }),
    }),
  },
};
const input = () => ({
  ...discoveryInput(library(), "기억 압축 연구"),
  provider: "openai",
  model: "gpt-6-luna",
  apiKey: testKey,
});
const request = (data: unknown, origin = env.APP_ORIGIN, cookie = "") =>
  new Request(env.APP_ORIGIN + "/api/recommend", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
const modelResponse = (value: unknown, openai = true) =>
  Response.json(
    openai
      ? {
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(value) }],
            },
          ],
        }
      : {
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(value) }],
        },
  );

test("discovery context includes graph directions and status, excludes notes and bounds large libraries", () => {
  const l = library();
  l.papers.push(
    ...Array.from({ length: 70 }, (_, i) =>
      paper(`2502.${String(i).padStart(5, "0")}`),
    ),
  );
  const d = discoveryInput(l, "agent memory");
  assert.equal(d.context.papers.length, 60);
  assert.equal(d.excludedIds.length, 72);
  assert.deepEqual(d.context.edges[0], {
    source: "2501.00001",
    target: "2501.00002",
    label: "compares",
    note: "Conceptual contrast",
    origin: "manual",
  });
  assert(!JSON.stringify(d).includes("PRIVATE-NOTE"));
});
test("Atom parsing preserves actual metadata, decodes entities, deduplicates versions and refuses malformed feeds", () => {
  const p = parseArxivFeed(feed());
  assert.equal(p[0].id, candidate.id);
  assert.equal(p[0].title, "Memory & Agents");
  assert.equal(p[0].abstract, "Compress α memory.");
  assert.deepEqual(p[0].authors, ["A & B"]);
  assert.equal(
    parseArxivFeed(
      feed().replace(
        "</feed>",
        feed("2601.00003v3").match(/<entry>[\s\S]*<\/entry>/)![0] + "</feed>",
      ),
    ).length,
    1,
  );
  assert.throws(() => parseArxivFeed("<html>unavailable</html>"));
  assert.throws(() =>
    parseArxivFeed(
      '<!DOCTYPE feed [<!ENTITY a SYSTEM "file:///tmp/a">]>' + feed(),
    ),
  );
  assert.throws(() => parseArxivFeed(feed("invalid")));
  assert.deepEqual(parseArxivFeed("<feed></feed>"), []);
  assert.equal(
    arxivSearchQuery(searchPlanSchema.parse(plan)),
    '(all:"agent" AND all:"memory")',
  );
  assert.equal(
    searchPlanSchema.safeParse({ ...plan, groups: [['x" OR all:*']] }).success,
    false,
  );
});
test("ranking rejects invented papers, foreign graph IDs, duplicate recommendations and already saved versions", () => {
  const d = discoveryInput(library(), "memory");
  assert.equal(
    verifiedRecommendations(d, [candidate], rank)[0].paper.title,
    "Actual Candidate",
  );
  for (const r of [
    { recommendations: [{ ...rank.recommendations[0], id: "invented" }] },
    {
      recommendations: [
        {
          ...rank.recommendations[0],
          connections: [{ ...rec.connections[0], paperId: "outside" }],
        },
      ],
    },
    { recommendations: [...rank.recommendations, ...rank.recommendations] },
  ])
    assert.throws(() => verifiedRecommendations(d, [candidate], r));
  assert.throws(() =>
    verifiedRecommendations(
      { ...d, excludedIds: [candidate.id + "v1"] },
      [candidate],
      rank,
    ),
  );
});
test("explicit adoption preserves current notes, skips removed connection targets, avoids duplicate versions and survives export", () => {
  const l = library();
  l.papers[0].notes = "New notes written during search";
  const plain = addRecommendation(l, rec, false);
  assert.equal(plain.edges.length, 1);
  assert.equal(plain.papers[0].status, "unread");
  assert.equal(plain.papers[1].notes, l.papers[0].notes);
  const linked = addRecommendation(l, rec, true);
  assert.equal(linked.edges[1].source, candidate.id);
  assert.equal(linked.edges[1].target, "2501.00001");
  assert.equal(linked.edges[1].origin, "suggested");
  assert.equal(addRecommendation(linked, rec, true), linked);
  assert.equal(
    librarySchema.parse(JSON.parse(JSON.stringify(linked))).papers.length,
    3,
  );
  const changed = { ...l, papers: l.papers.slice(1), edges: [] };
  assert.equal(addRecommendation(changed, rec, true).edges.length, 0);
});
test("both providers perform only plan and rank, pass graph context, exclude owned versions and never send keys or notes in prompts", async (t) => {
  for (const provider of ["openai", "anthropic"]) {
    let calls = 0;
    const mock = t.mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, init: RequestInit) => {
        const b = JSON.parse(init.body as string),
          openai = !!b.input,
          prompt = JSON.parse(openai ? b.input : b.messages[0].content);
        assert(!JSON.stringify(prompt).includes(testKey));
        assert(!JSON.stringify(prompt).includes("PRIVATE-NOTE"));
        assert.deepEqual(prompt.context.edges, input().context.edges);
        if (calls++ === 0) {
          assert.equal(openai ? b.max_output_tokens : b.max_tokens, 3000);
          return modelResponse(plan, openai);
        }
        assert.equal(prompt.candidates.length, 1);
        assert.equal(prompt.candidates[0].id, candidate.id);
        return modelResponse(rank, openai);
      },
    );
    const r = await worker.fetch(request({ ...input(), provider }), env);
    assert.equal(r.status, 200);
    const result = (await r.json()) as any;
    assert.equal(result.recommendations[0].paper.title, "Actual Candidate");
    assert.equal(calls, 2);
    mock.mock.restore();
  }
});
test("empty search and upstream failures stop before ranking, without hidden retries", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return modelResponse(plan);
  });
  const empty = {
    ...env,
    ARXIV_SEARCH: {
      ...env.ARXIV_SEARCH,
      get: () => ({ fetch: async () => Response.json({ papers: [] }) }),
    },
  };
  const r = await worker.fetch(request(input()), empty);
  assert.equal(r.status, 200);
  assert.deepEqual(((await r.json()) as any).recommendations, []);
  assert.equal(calls, 1);
  const failed = {
    ...env,
    ARXIV_SEARCH: {
      ...env.ARXIV_SEARCH,
      get: () => ({
        fetch: async () =>
          Response.json({ error: "search busy" }, { status: 429 }),
      }),
    },
  };
  assert.equal((await worker.fetch(request(input()), failed)).status, 429);
  assert.equal(calls, 2);
});
test("discovery rejects cross-origin, invalid graph, missing credentials and stale account before provider calls", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw Error("must not fetch");
  });
  assert.equal(
    (await worker.fetch(request(input(), "https://evil.example"), env)).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        request({
          ...input(),
          context: {
            ...input().context,
            edges: [{ ...input().context.edges[0], target: "foreign" }],
          },
        }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (await worker.fetch(request({ ...input(), apiKey: "" }), env)).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        request({ ...input(), apiKey: "", accountId: 42 }),
        env,
      )
    ).status,
    401,
  );
  const cookie = `__Host-pp-session=${await seal({ id: 43, expires: Date.now() + 60000 }, env.SESSION_SECRET)}`;
  assert.equal(
    (
      await worker.fetch(
        request(
          { ...input(), apiKey: "", accountId: 42 },
          env.APP_ORIGIN,
          cookie,
        ),
        env,
      )
    ).status,
    409,
  );
  assert.equal(calls, 0);
});
test("same-account encrypted keys power discovery without exposing the key", async (t) => {
  const cookie = `__Host-pp-session=${await seal({ id: 42, expires: Date.now() + 60000 }, env.SESSION_SECRET)}; ${(await saveAccountKey(env.SESSION_SECRET, 42, { provider: "openai", model: "gpt-6-luna", apiKey: testKey })).cookie.split(";")[0]}`;
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.equal((init.headers as any).Authorization, `Bearer ${testKey}`);
      return modelResponse(calls++ ? rank : plan);
    },
  );
  const r = await worker.fetch(
    request({ ...input(), apiKey: "", accountId: 42 }, env.APP_ORIGIN, cookie),
    env,
  );
  assert.equal(r.status, 200);
  assert(!(await r.text()).includes(testKey));
  assert.equal(calls, 2);
});
test("global arXiv search permits only one upstream request and caches public metadata", async (t) => {
  const stored = new Map<string, unknown>();
  const state = {
    storage: {
      get: async (k: string) => stored.get(k),
      put: async (k: string, v: unknown) => {
        stored.set(k, v);
      },
    },
  } as any;
  let finish!: (r: Response) => void,
    calls = 0;
  t.mock.method(globalThis, "fetch", () => {
    calls++;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const search = new ArxivSearch(state),
    req = () =>
      new Request("https://internal/", {
        method: "POST",
        body: JSON.stringify(plan),
      });
  const pending = search.fetch(req());
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await search.fetch(req())).status, 429);
  finish(new Response(feed()));
  assert.equal((await pending).status, 200);
  assert.equal((await search.fetch(req())).status, 200);
  assert.equal(calls, 1);
  assert.deepEqual([...stored.keys()], ["last-request"]);
});
test("arXiv request spacing survives a new object instance", async (t) => {
  const stored = new Map<string, unknown>();
  const state = {
    storage: {
      get: async (k: string) => stored.get(k),
      put: async (k: string, v: unknown) => {
        stored.set(k, v);
      },
    },
  } as any;
  const times: number[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    times.push(Date.now());
    return new Response(feed());
  });
  const request = () =>
    new Request("https://internal/", {
      method: "POST",
      body: JSON.stringify(plan),
    });
  assert.equal((await new ArxivSearch(state).fetch(request())).status, 200);
  assert.equal((await new ArxivSearch(state).fetch(request())).status, 200);
  assert.equal(times.length, 2);
  assert(times[1] - times[0] >= 3000);
});
