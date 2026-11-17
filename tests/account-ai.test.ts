import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker-fixture";
import { hostedAISettings, aiRequest } from "../src/lib/ai-settings";

const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test",
  GITHUB_CLIENT_SECRET: "test",
  GITHUB_APP_SLUG: "test",
  SESSION_SECRET: "test-hosted-ai-secret-".repeat(4),
  OPENAI_API_KEY: "sk-TEST-ONLY-OPERATOR-KEY",
  AI_RATE_LIMIT: {
    limit: async (_input: { key: string }) => ({ success: true }),
  },
  ASSETS: { fetch: async () => new Response("asset") },
  ARXIV_SEARCH: {
    idFromName: (s: string) => s,
    get: () => ({ fetch: async () => Response.json({ papers: [] }) }),
  },
};
const blocks = [
  { id: "b1", kind: "paragraph", text: "A sentence from the paper." },
];
const inputs: Record<string, object> = {
  analyze: { title: "Paper", blocks },
  chat: {
    title: "Paper",
    blocks,
    contextComplete: true,
    messages: [{ role: "user", content: "Explain" }],
  },
  "paper-labels": {
    papers: [{ id: "1706.03762", title: "Paper", abstract: "Summary" }],
  },
  relate: {
    papers: ["a", "b"].map((id) => ({
      id,
      title: "Paper",
      positioning: "",
      tags: [],
      method: "",
    })),
  },
  "author-affiliations": {
    papers: [
      {
        arxivId: "1706.03762",
        authors: ["Author"],
        format: "html",
        text: "Author from Example University.",
      },
    ],
  },
  recommend: {
    query: "memory",
    context: { papers: [], edges: [] },
    excludedIds: [],
  },
};
const req = (
  route: string,
  data: object,
  cookie = "test-session",
  origin = env.APP_ORIGIN,
) =>
  new Request(`${env.APP_ORIGIN}/api/${route}`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

test("all six paid routes require login and matching account before any provider call", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Unexpected provider call");
  });
  for (const [route, data] of Object.entries(inputs)) {
    assert.equal(
      (await worker.fetch(req(route, data, ""), env)).status,
      401,
      route,
    );
    assert.equal(
      (await worker.fetch(req(route, data, "invalid"), env)).status,
      401,
      route,
    );
    assert.equal(
      (await worker.fetch(req(route, { ...data, accountId: 43 }), env)).status,
      409,
      route,
    );
    assert.equal(
      (
        await worker.fetch(
          req(route, data, "test-session", "https://evil.example"),
          env,
        )
      ).status,
      403,
      route,
    );
  }
  assert.equal(calls, 0);
});

test("missing server secret or limiter fails closed; rate limiting uses verified user ID across all routes", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Unexpected provider call");
  });
  const keys: string[] = [];
  for (const [route, data] of Object.entries(inputs)) {
    assert.equal(
      (await worker.fetch(req(route, data), { ...env, OPENAI_API_KEY: "" }))
        .status,
      503,
    );
    assert.equal(
      (
        await worker.fetch(req(route, data), {
          ...env,
          AI_RATE_LIMIT: undefined,
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await worker.fetch(req(route, data), {
          ...env,
          AI_RATE_LIMIT: {
            limit: async ({ key }) => {
              keys.push(key);
              return { success: false };
            },
          },
        })
      ).status,
      429,
    );
  }
  assert.deepEqual([...new Set(keys)], ["paper-palace:ai:user:42"]);
  assert.equal(calls, 0);
});

test("browser credentials, provider and expensive model cannot override server OpenAI configuration", async (t) => {
  const browserKey = "sk-UNTRUSTED-USER-KEY";
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init?: RequestInit) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${env.OPENAI_API_KEY}`,
      );
      const b = JSON.parse(String(init?.body));
      assert.equal(b.model, "gpt-6-luna");
      assert.equal(b.store, false);
      assert(!String(init?.body).includes(browserKey));
      assert(!String(init?.body).includes(env.OPENAI_API_KEY));
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  answer: "Grounded answer",
                  citations: [],
                }),
              },
            ],
          },
        ],
      });
    },
  );
  const response = await worker.fetch(
    req("chat", {
      ...inputs.chat,
      provider: "anthropic",
      model: "untrusted-expensive-model",
      apiKey: browserKey,
      accountId: 42,
    }),
    env,
  );
  assert.equal(response.status, 200);
  const text = await response.text();
  assert(!text.includes(env.OPENAI_API_KEY));
  assert(!text.includes(browserKey));
  assert.deepEqual(aiRequest(hostedAISettings(42)), { accountId: 42 });
});

test("public config exposes readiness only and retired key API cannot save keys", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected provider call");
  });
  const config = await worker.fetch(
    new Request(env.APP_ORIGIN + "/api/config"),
    env,
  );
  const text = await config.text();
  assert.equal(JSON.parse(text).aiConfigured, true);
  assert(!text.includes(env.OPENAI_API_KEY));
  for (const method of ["GET", "PUT", "DELETE"]) {
    const response = await worker.fetch(
      new Request(env.APP_ORIGIN + "/api/ai-keys", {
        method,
        headers: { Origin: env.APP_ORIGIN },
      }),
      env,
    );
    assert.equal(response.status, 410);
    assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
  }
});
