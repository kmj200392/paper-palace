import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import {
  authorSourceSchema,
  type AuthorSource,
} from "../src/lib/author-affiliations";
import { verifyAuthorDetails } from "../worker/author-affiliations";
import { seal } from "../worker/security";
import { saveAccountKey } from "../worker/ai-credentials";

const text =
  "Alice Kim* — Alpha University; Min Lee* — Beta Institute, Gamma Lab. Alice Kim* and Min Lee* contributed equally. Min Lee, Beta Institute: Corresponding author. Senior Zhang — Delta University.";
const source: AuthorSource = {
  arxivId: "2501.00001v2",
  authors: ["Alice Kim", "Min Lee", "Senior Zhang"],
  format: "html",
  text,
};
const extraction = () => ({
  papers: [
    {
      arxivId: source.arxivId,
      authors: [
        {
          index: 0,
          coFirstEvidence: text,
          correspondingEvidence: "",
          affiliations: [
            {
              name: "Alpha University",
              evidence: "Alice Kim* — Alpha University",
            },
          ],
        },
        {
          index: 1,
          coFirstEvidence: text,
          correspondingEvidence:
            "Min Lee, Beta Institute: Corresponding author.",
          affiliations: [
            {
              name: "Beta Institute",
              evidence: "Min Lee* — Beta Institute, Gamma Lab.",
            },
            {
              name: "Gamma Lab",
              evidence: "Min Lee* — Beta Institute, Gamma Lab.",
            },
          ],
        },
      ],
    },
  ],
});
test("first/co-first and corresponding authors retain multiple paper-time affiliations and source evidence", () => {
  const [r] = verifyAuthorDetails([source], extraction());
  assert.deepEqual(
    r.firstAuthors.map((p) => [p.name, p.role]),
    [
      ["Alice Kim", "co-first"],
      ["Min Lee", "co-first"],
    ],
  );
  assert.deepEqual(
    r.correspondingAuthors.map((p) => p.name),
    ["Min Lee"],
  );
  assert.deepEqual(
    r.correspondingAuthors[0].affiliations.map((a) => a.name),
    ["Beta Institute", "Gamma Lab"],
  );
  assert(
    ![...r.firstAuthors, ...r.correspondingAuthors].some(
      (p) => p.name === "Senior Zhang",
    ),
  );
});
test("unsupported institutions, roles, email domains and final-author position never fill missing facts", () => {
  const r = extraction();
  r.papers[0].authors[0].affiliations = [
    { name: "Invented University", evidence: text },
  ];
  r.papers[0].authors[0].coFirstEvidence = "Alice Kim* — Alpha University";
  r.papers[0].authors[0].correspondingEvidence =
    "Alice Kim, Corresponding author at Alpha University";
  r.papers[0].authors[1].coFirstEvidence =
    "Min Lee* — Beta Institute, Gamma Lab.";
  r.papers[0].authors[1].correspondingEvidence = "";
  r.papers[0].authors.push({
    index: 2,
    coFirstEvidence: "",
    correspondingEvidence: "Senior Zhang — Delta University.",
    affiliations: [],
  });
  const [result] = verifyAuthorDetails([source], r);
  assert.equal(result.firstAuthors.length, 1);
  assert.equal(result.firstAuthors[0].affiliations.length, 0);
  assert.equal(result.firstAuthors[0].role, "first");
  assert.deepEqual(result.correspondingAuthors, []);
  assert.deepEqual(
    verifyAuthorDetails([source], { papers: [] })[0].firstAuthors[0],
    { name: "Alice Kim", role: "first", evidence: "", affiliations: [] },
  );
});
test("quotes tolerate whitespace and Unicode typography, but a different person's partial name is not evidence", () => {
  const r = extraction();
  const [valid] = verifyAuthorDetails(
    [{ ...source, text: text.replaceAll(" ", "\n\u00a0") }],
    r,
  );
  assert.equal(valid.firstAuthors.length, 2);
  const [wrong] = verifyAuthorDetails(
    [
      {
        ...source,
        authors: ["Ann Lee"],
        text: "Joann Lee, Alpha University. Corresponding author.",
      },
    ],
    {
      papers: [
        {
          arxivId: source.arxivId,
          authors: [
            {
              index: 0,
              coFirstEvidence: "",
              correspondingEvidence:
                "Joann Lee, Alpha University. Corresponding author.",
              affiliations: [
                {
                  name: "Alpha University",
                  evidence: "Joann Lee, Alpha University.",
                },
              ],
            },
          ],
        },
      ],
    },
  );
  assert.equal(wrong.firstAuthors[0].affiliations.length, 0);
  assert.equal(wrong.correspondingAuthors.length, 0);
});
test("foreign papers, authors, duplicate mappings and unsupported source URLs are rejected", () => {
  for (const change of [
    (r: ReturnType<typeof extraction>) => {
      r.papers[0].arxivId = "2501.99999v1";
    },
    (r: ReturnType<typeof extraction>) => {
      r.papers[0].authors[0].index = 99;
    },
    (r: ReturnType<typeof extraction>) => {
      r.papers.push(r.papers[0]);
    },
    (r: ReturnType<typeof extraction>) => {
      r.papers[0].authors.push(r.papers[0].authors[0]);
    },
  ]) {
    const r = extraction();
    change(r);
    assert.throws(() => verifyAuthorDetails([source], r));
  }
  assert.equal(
    authorSourceSchema.safeParse({
      ...source,
      arxivId: "https://evil.example/x",
    }).success,
    false,
  );
  assert.equal(
    authorSourceSchema.safeParse({ ...source, text: "x".repeat(16001) })
      .success,
    false,
  );
});
const key = "sk-TEST-ONLY-AUTHOR-KEY";
const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test",
  GITHUB_CLIENT_SECRET: "test",
  GITHUB_APP_SLUG: "test",
  SESSION_SECRET: "test-secret-".repeat(5),
  ASSETS: { fetch: async () => new Response("asset") },
};
const body = () => ({
  provider: "openai",
  model: "gpt-6-luna",
  apiKey: key,
  papers: [source],
});
const request = (input: unknown, origin = env.APP_ORIGIN, cookie = "") =>
  new Request(env.APP_ORIGIN + "/api/author-affiliations", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
test("both providers extract authors in one bounded call with no key or library notes in model input", async (t) => {
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init: RequestInit) => {
      calls++;
      const b = JSON.parse(init.body as string),
        openai = String(url).includes("openai");
      const prompt = openai ? b.input : b.messages[0].content;
      assert(!prompt.includes(key));
      assert(!prompt.includes("PRIVATE-NOTE"));
      assert.equal(JSON.parse(prompt)[0].text, text);
      assert.equal(openai ? b.max_output_tokens : b.max_tokens, 10000);
      return Response.json(
        openai
          ? {
              status: "completed",
              output: [
                {
                  type: "message",
                  content: [
                    { type: "output_text", text: JSON.stringify(extraction()) },
                  ],
                },
              ],
            }
          : {
              stop_reason: "end_turn",
              content: [{ type: "text", text: JSON.stringify(extraction()) }],
            },
      );
    },
  );
  for (const provider of ["openai", "anthropic"]) {
    const r = await worker.fetch(
      request({ ...body(), provider, notes: "PRIVATE-NOTE" }),
      env,
    );
    assert.equal(r.status, 200);
    const data = (await r.json()) as any;
    assert.equal(data.papers[0].correspondingAuthors[0].name, "Min Lee");
    assert(!JSON.stringify(data).includes(key));
  }
  assert.equal(calls, 2);
});
test("author endpoint enforces origin, bounds and matching signed-in account before provider calls", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("no");
  });
  assert.equal(
    (await worker.fetch(request(body(), "https://evil.example"), env)).status,
    403,
  );
  assert.equal(
    (await worker.fetch(request({ ...body(), papers: [source, source] }), env))
      .status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        request({
          ...body(),
          papers: [{ ...source, text: "x".repeat(16001) }],
        }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (await worker.fetch(request({ ...body(), apiKey: "" }), env)).status,
    400,
  );
  assert.equal(
    (await worker.fetch(request({ ...body(), accountId: 42, apiKey: "" }), env))
      .status,
    401,
  );
  const cookie = `__Host-pp-session=${await seal({ id: 43, expires: Date.now() + 60000 }, env.SESSION_SECRET)}`;
  assert.equal(
    (
      await worker.fetch(
        request(
          { ...body(), accountId: 42, apiKey: "" },
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
test("same-account encrypted credentials support author extraction and malformed output is not retried", async (t) => {
  const cookie = `__Host-pp-session=${await seal({ id: 42, expires: Date.now() + 60000 }, env.SESSION_SECRET)}; ${(await saveAccountKey(env.SESSION_SECRET, 42, { provider: "openai", model: "gpt-6-luna", apiKey: key })).cookie.split(";")[0]}`;
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.equal((init.headers as any).Authorization, `Bearer ${key}`);
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(
                  calls++
                    ? { papers: [{ arxivId: "foreign", authors: [] }] }
                    : extraction(),
                ),
              },
            ],
          },
        ],
      });
    },
  );
  const input = { ...body(), accountId: 42, apiKey: "" };
  assert.equal(
    (await worker.fetch(request(input, env.APP_ORIGIN, cookie), env)).status,
    200,
  );
  assert.equal(
    (await worker.fetch(request(input, env.APP_ORIGIN, cookie), env)).status,
    502,
  );
  assert.equal(calls, 2);
});
