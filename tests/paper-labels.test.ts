import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import { emptyLibrary, librarySchema, type Paper } from "../src/lib/model";
import {
  applyPaperLabels,
  graphPaperLabel,
  labelInput,
  paperLabelsSchema,
} from "../src/lib/paper-labels";
import { reconcileLibraries } from "../src/lib/reconcile";

const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test",
  GITHUB_CLIENT_SECRET: "test",
  GITHUB_APP_SLUG: "test",
  SESSION_SECRET: "test-only-secret-".repeat(4),
  ASSETS: { fetch: async () => new Response("asset") },
};
const fakeKey = "sk-TEST-ONLY-PAPER-LABEL-KEY";
const paper = (id: string, title: string): Paper => ({
  id,
  arxivId: id + "v1",
  title,
  authors: ["Author"],
  abstract: "Paper abstract",
  published: "2026",
  categories: [],
  tags: ["memory"],
  notes: "Keep my notes",
  status: "reading",
  analysis: null,
  analysisMeta: null,
  addedAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
});
const request = (
  papers: unknown[],
  provider = "openai",
  origin = env.APP_ORIGIN,
) =>
  new Request(env.APP_ORIGIN + "/api/paper-labels", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      model: provider === "openai" ? "gpt-6-luna" : "claude-sonnet-4-5",
      apiKey: fakeKey,
      papers,
    }),
  });

test("short names preserve notes and newer edits, survive export and reconciliation, and keep old libraries valid", () => {
  const base = emptyLibrary();
  base.papers = [
    paper("a", "MemRefine: Iterative Memory Refinement"),
    paper("b", "A-Mem: Agentic Memory"),
  ];
  const requested = base.papers.map(labelInput);
  const local = structuredClone(base);
  local.papers[0].notes = "Newer notes entered while AI runs";
  local.papers[0].status = "read";
  local.papers[1].graphLabel = "My Memory";
  const named = applyPaperLabels(local, requested, [
    { id: "a", label: "MemRefine" },
    { id: "b", label: "A-Mem" },
  ]);
  assert.equal(named.papers[0].notes, local.papers[0].notes);
  assert.equal(named.papers[0].status, "read");
  assert.equal(named.papers[1].graphLabel, "My Memory");
  const parsed = librarySchema.parse(JSON.parse(JSON.stringify(named)));
  assert.equal(parsed.papers[0].graphLabel, "MemRefine");
  assert.equal(librarySchema.parse(base).papers[0].graphLabel, undefined);
  const merged = reconcileLibraries(base, parsed, base);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.library.papers[0].graphLabel, "MemRefine");
});

test("late labels cannot resurrect deleted papers, overwrite names, or name changed content", () => {
  const library = emptyLibrary();
  const a = paper("a", "Attention Is All You Need"),
    b = paper("b", "Old title");
  library.papers = [{ ...b, title: "Changed title" }];
  const result = applyPaperLabels(
    library,
    [a, b],
    [
      { id: "a", label: "Attention" },
      { id: "b", label: "Old" },
    ],
  );
  assert.equal(result, library);
  assert.equal(result.papers.length, 1);
});

test("offline placeholders stay compact; AI names are bounded to one or two words", () => {
  assert.equal(
    graphPaperLabel({ title: "Attention Is All You Need" }),
    "Attention",
  );
  assert.equal(
    graphPaperLabel({ title: "A-Mem: Agentic Memory for LLM Agents" }),
    "A-Mem",
  );
  assert.equal(
    graphPaperLabel({ title: "A paper", graphLabel: "MemRefine" }),
    "MemRefine",
  );
  for (const label of [
    "",
    "One Two Three",
    "Trailing ",
    "New\nLine",
    "a".repeat(33),
  ])
    assert.equal(
      paperLabelsSchema.safeParse({ labels: [{ id: "a", label }] }).success,
      false,
    );
});

test("both providers name only supplied papers with bounded output and no credentials or private notes in prompts", async (t) => {
  const input = labelInput(paper("a", "MemRefine: Memory Refinement"));
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string);
      const openai = !!body.input;
      const prompt = openai ? body.input : body.messages[0].content;
      assert.deepEqual(JSON.parse(prompt), [input]);
      assert(!prompt.includes(fakeKey));
      assert(!prompt.includes("Keep my notes"));
      assert.equal(
        openai ? body.max_output_tokens : body.max_tokens,
        openai ? 4000 : 2000,
      );
      if (openai) {
        assert.equal(body.store, false);
        assert.equal(body.model, "gpt-6-luna");
      }
      const text = JSON.stringify({
        labels: [{ id: "a", label: "MemRefine" }],
      });
      return Response.json(
        openai
          ? {
              status: "completed",
              output: [
                { type: "message", content: [{ type: "output_text", text }] },
              ],
            }
          : { stop_reason: "end_turn", content: [{ type: "text", text }] },
      );
    },
  );
  for (const provider of ["openai", "anthropic"]) {
    const r = await worker.fetch(request([input], provider), env);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), {
      labels: [{ id: "a", label: "MemRefine" }],
    });
  }
  assert.equal(calls, 2);
});

test("invalid, missing, duplicate or foreign AI names fail instead of being attached to another paper", async (t) => {
  const input = [
    labelInput(paper("a", "First")),
    labelInput(paper("b", "Second")),
  ];
  for (const labels of [
    [{ id: "a", label: "Valid" }],
    [
      { id: "a", label: "Valid" },
      { id: "a", label: "Duplicate" },
    ],
    [
      { id: "a", label: "Valid" },
      { id: "other", label: "Foreign" },
    ],
    [
      { id: "a", label: "Too Many Words" },
      { id: "b", label: "Valid" },
    ],
  ]) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify({ labels }) },
            ],
          },
        ],
      }),
    );
    assert.equal((await worker.fetch(request(input), env)).status, 502);
  }
});

test("naming rejects cross-origin, duplicate or oversized batches before contacting a provider", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not call provider");
  });
  const input = labelInput(paper("a", "Paper"));
  assert.equal(
    (
      await worker.fetch(
        request([input], "openai", "https://evil.example"),
        env,
      )
    ).status,
    403,
  );
  assert.equal((await worker.fetch(request([input, input]), env)).status, 400);
  assert.equal(
    (
      await worker.fetch(
        request(
          Array.from({ length: 21 }, (_, i) => ({ ...input, id: String(i) })),
        ),
        env,
      )
    ).status,
    400,
  );
});
