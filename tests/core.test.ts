import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArxivId,
  citationMatches,
  mergeLibraries,
  emptyLibrary,
  librarySchema,
  type Paper,
} from "../src/lib/model";
import {
  seal,
  unseal,
  challenge,
  sameOrigin,
  boundedText,
} from "../worker/security";
import worker from "../worker/index";
const sample = (id: string, time = "2026-10-29T00:00:00.000Z"): Paper => ({
  id,
  arxivId: id + "v1",
  title: "Paper",
  authors: [],
  abstract: "Abstract",
  published: "2026",
  categories: [],
  addedAt: time,
  updatedAt: time,
  status: "unread",
  tags: [],
  notes: "",
  analysis: null,
  analysisMeta: null,
});
test("accept arXiv formats and reject arbitrary hosts or traversal", () => {
  assert.equal(
    parseArxivId("https://arxiv.org/pdf/1706.03762v7.pdf"),
    "1706.03762v7",
  );
  assert.equal(parseArxivId("hep-th/9901001"), "hep-th/9901001");
  for (const input of [
    "https://evil.example/abs/1706.03762",
    "https://arxiv.org.evil.example/abs/1706.03762",
    "../../secret",
    "1706.03762?url=http://127.0.0.1",
    "https://arxiv.org/abs/../robots.txt",
  ])
    assert.throws(() => parseArxivId(input));
});
test("citation requires exact block and substantial matching text", () => {
  const blocks = [
    {
      id: "b1",
      kind: "paragraph" as const,
      text: "The model uses self-attention   to encode each input.",
    },
  ];
  assert.equal(
    citationMatches(
      { blockId: "b1", quote: "uses self-attention to encode" },
      blocks,
    ),
    true,
  );
  assert.equal(
    citationMatches(
      { blockId: "b2", quote: "uses self-attention to encode" },
      blocks,
    ),
    false,
  );
  assert.equal(
    citationMatches(
      { blockId: "b1", quote: "improves accuracy by 20%" },
      blocks,
    ),
    false,
  );
  assert.equal(citationMatches({ blockId: "b1", quote: "The" }, blocks), false);
});
test("sync retains independent edits and respects deletion tombstones", () => {
  const a = emptyLibrary(),
    b = emptyLibrary();
  a.papers = [sample("1"), sample("2")];
  b.papers = [
    { ...sample("1", "2026-10-29T01:00:00.000Z"), notes: "changed" },
    sample("3"),
  ];
  a.deleted = { "2": "2026-10-29T02:00:00.000Z" };
  b.papers.push(sample("2"));
  b.edges = [
    {
      id: "e",
      source: "1",
      target: "2",
      label: "builds on",
      note: "",
      origin: "manual",
      updatedAt: "2026-10-29T00:00:00.000Z",
    },
  ];
  const merged = mergeLibraries(a, b);
  assert.deepEqual(merged.papers.map((p) => p.id).sort(), ["1", "3"]);
  assert.equal(merged.papers.find((p) => p.id === "1")?.notes, "changed");
  assert.equal(merged.edges.length, 0);
  assert.equal(librarySchema.safeParse(merged).success, true);
});
test("session is encrypted, rejects tampering, expiry and wrong secret", async () => {
  const secret = "a".repeat(48),
    value = await seal(
      { token: "sensitive", expires: Date.now() + 60000 },
      secret,
    );
  assert(!value.includes("sensitive"));
  assert.equal(
    (await unseal<{ token: string; expires: number }>(value, secret))?.token,
    "sensitive",
  );
  assert.equal(await unseal(value, "b".repeat(48)), null);
  assert.equal(await unseal(value + "tamper", secret), null);
  assert.equal(await unseal(await seal({ expires: 1 }, secret), secret), null);
});
test("PKCE matches RFC7636 example", async () => {
  assert.equal(
    await challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});
test("CSRF requires exact origin and request bodies are bounded", async () => {
  assert(
    sameOrigin(
      new Request("https://example.com", {
        headers: { origin: "https://example.com" },
      }),
      "https://example.com",
    ),
  );
  assert(
    !sameOrigin(
      new Request("https://example.com", {
        headers: { origin: "https://example.com.evil" },
      }),
      "https://example.com",
    ),
  );
  await assert.rejects(() => boundedText(new Response("oversized"), 4));
});
const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "client",
  GITHUB_CLIENT_SECRET: "secret",
  GITHUB_APP_SLUG: "paper-palace",
  SESSION_SECRET: "a".repeat(48),
  ASSETS: { fetch: async () => new Response("asset") },
};
test("API rejects cross-origin mutations and unauthenticated sync", async () => {
  let r = await worker.fetch(
    new Request(env.APP_ORIGIN + "/api/analyze", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    env,
  );
  assert.equal(r.status, 403);
  r = await worker.fetch(
    new Request(env.APP_ORIGIN + "/api/library?repo=a/b"),
    env,
  );
  assert.equal(r.status, 401);
});
test("OAuth callback rejects missing/mismatched state before token exchange", async () => {
  const r = await worker.fetch(
    new Request(env.APP_ORIGIN + "/api/auth/callback?code=attack&state=attack"),
    env,
  );
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("Location"), "/app/?error=auth_state");
});
test("OAuth login uses PKCE and secure HTTP-only cookie, never client secret in URL", async () => {
  const r = await worker.fetch(
    new Request(env.APP_ORIGIN + "/api/auth/login"),
    env,
  );
  assert.equal(r.status, 302);
  const url = new URL(r.headers.get("Location")!);
  assert.equal(url.hostname, "github.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.match(r.headers.get("Set-Cookie")!, /HttpOnly; Secure; SameSite=Lax/);
});

test("OpenAI adapter validates evidence and does not return keys to the browser", async () => {
  const originalFetch = globalThis.fetch;
  const fakeKey = "sk-test-not-a-real-credential";
  const point = {
    text: "Test result",
    citations: [
      { blockId: "b1", quote: "Attention connects distant tokens" },
      { blockId: "b1", quote: "Invented claim that does not occur" },
    ],
  };
  const analysis = {
    positioning: "Fixture for adapter testing",
    tags: ["test"],
    limitations: [],
    sections: {
      motivation: [point],
      coreConcept: [],
      method: [],
      experimentalSetup: [],
      results: [],
    },
  };
  let called = false;
  globalThis.fetch = async (input, init) => {
    called = true;
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Bearer ${fakeKey}`,
    );
    const sent = JSON.parse(init!.body as string);
    assert.equal(sent.model, "gpt-6-luna");
    assert.equal(sent.store, false);
    assert.equal(sent.text.format.strict, true);
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(analysis) }],
          },
        ],
        usage: { input_tokens: 30, output_tokens: 20 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const r = await worker.fetch(
      new Request(env.APP_ORIGIN + "/api/analyze", {
        method: "POST",
        headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: "gpt-6-luna",
          apiKey: fakeKey,
          title: "Test paper",
          blocks: [
            {
              id: "b1",
              kind: "paragraph",
              text: "Attention connects distant tokens without recurrence.",
            },
          ],
        }),
      }),
      env,
    );
    assert.equal(r.status, 200);
    assert(called);
    const text = await r.text();
    assert(!text.includes(fakeKey));
    const data = JSON.parse(text);
    assert.equal(data.analysis.sections.motivation[0].citations.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI graph proposals cannot reference unknown papers or self edges", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  relations: [
                    {
                      source: "a",
                      target: "b",
                      label: "related to",
                      note: "Possible shared idea",
                    },
                    {
                      source: "a",
                      target: "invented",
                      label: "related to",
                      note: "invalid",
                    },
                    {
                      source: "a",
                      target: "a",
                      label: "related to",
                      note: "invalid",
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    );
  try {
    const r = await worker.fetch(
      new Request(env.APP_ORIGIN + "/api/relate", {
        method: "POST",
        headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: "gpt-6-luna",
          apiKey: "sk-fake-test-credential",
          papers: ["a", "b"].map((id) => ({
            id,
            title: "Test",
            positioning: "Test summary",
            tags: [],
            method: "A method",
          })),
        }),
      }),
      env,
    );
    assert.equal(r.status, 200);
    const data = (await r.json()) as { relations: unknown[] };
    assert.equal(data.relations.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
