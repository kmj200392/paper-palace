import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import { seal, unseal } from "../worker/security";
import {
  saveAccountKey,
  readAccountKey,
  aiCookieName,
  AI_COOKIE_AGE,
} from "../worker/ai-credentials";
import {
  accountAISettings,
  hasAIConnection,
  type AccountAIKey,
} from "../src/lib/ai-settings";

const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "test-secret",
  GITHUB_APP_SLUG: "test-app",
  SESSION_SECRET: "account-ai-test-only-secret-".repeat(3),
  ASSETS: { fetch: async () => new Response("asset") },
};
const testKey = "sk-TEST-ONLY-ACCOUNT-AI-NOT-A-REAL-KEY";
const settings = {
  provider: "openai" as const,
  model: "test-model",
  apiKey: testKey,
};
const cookiePair = (setCookie: string) => setCookie.split(";")[0];
const session = async (id = 42, expires = Date.now() + 60000) =>
  `__Host-pp-session=${await seal({ id, name: "Test", login: "test-user", token: "fake-github-token", expires }, env.SESSION_SECRET)}`;
function request(
  path: string,
  cookies = "",
  method = "GET",
  payload?: unknown,
  origin = env.APP_ORIGIN,
) {
  return new Request(env.APP_ORIGIN + path, {
    method,
    headers: {
      Cookie: cookies,
      Origin: origin,
      "Content-Type": "application/json",
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
const keyCookie = async (id = 42) =>
  cookiePair((await saveAccountKey(env.SESSION_SECRET, id, settings)).cookie);
const analyze = {
  provider: "openai",
  model: "test-model",
  accountId: 42,
  title: "Test paper",
  blocks: [
    {
      id: "b1",
      kind: "paragraph",
      text: "Test source text for credential integration.",
    },
  ],
};
const relation = {
  provider: "openai",
  model: "test-model",
  accountId: 42,
  papers: ["a", "b"].map((id) => ({
    id,
    title: id,
    tags: [],
    positioning: "Test",
    method: "Test",
  })),
};
const labels = {
  provider: "openai",
  model: "test-model",
  accountId: 42,
  papers: [
    { id: "a", title: "Attention Is All You Need", abstract: "Self-attention" },
  ],
};

test("account key is encrypted in a bounded host-only HttpOnly cookie and never returned to JavaScript", async () => {
  const auth = await session();
  const r = await worker.fetch(
    request("/api/ai-keys", auth, "PUT", { ...settings, accountId: 42 }),
    env,
  );
  assert.equal(r.status, 200);
  const setCookie = r.headers.get("set-cookie")!;
  assert.match(setCookie, /^__Host-pp-ai-openai=/);
  assert.match(setCookie, /Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.match(setCookie, new RegExp(`Max-Age=${AI_COOKIE_AGE}$`));
  assert(!setCookie.includes("Domain="));
  assert(!setCookie.includes(testKey));
  assert(!setCookie.includes("fake-github-token"));
  assert(setCookie.length < 4096);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert(!(await r.text()).includes(testKey));
  const metadata = await worker.fetch(
    request("/api/ai-keys", auth + "; " + cookiePair(setCookie)),
    env,
  );
  const data = await metadata.text();
  assert(!data.includes(testKey));
  assert(!data.includes("apiKey"));
  assert.equal(JSON.parse(data).keys[0].model, "test-model");
  const largest = await saveAccountKey(env.SESSION_SECRET, 42, {
    ...settings,
    apiKey: "a".repeat(500),
    model: "b".repeat(100),
  });
  assert(largest.cookie.length < 4096);
});

test("key routes require authentication, exact origin and the account shown in the requesting tab", async () => {
  const auth = await session();
  for (const method of ["GET", "PUT", "DELETE"]) {
    const body = method === "GET" ? undefined : { ...settings, accountId: 42 };
    assert.equal(
      (await worker.fetch(request("/api/ai-keys", "", method, body), env))
        .status,
      401,
    );
    if (method !== "GET")
      assert.equal(
        (
          await worker.fetch(
            request("/api/ai-keys", auth, method, body, "https://evil.example"),
            env,
          )
        ).status,
        403,
      );
  }
  assert.equal(
    (
      await worker.fetch(
        request("/api/ai-keys", auth, "PUT", { ...settings, accountId: 99 }),
        env,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await worker.fetch(
        request("/api/ai-keys", auth, "DELETE", {
          provider: "openai",
          accountId: 99,
        }),
        env,
      )
    ).status,
    409,
  );
});

test("keys cannot cross accounts, providers, authentication purposes or encryption secrets", async () => {
  const key = await keyCookie();
  const req = request("/api/ai-keys", key);
  assert.equal(
    (await readAccountKey(req, env.SESSION_SECRET, 42, "openai"))?.apiKey,
    testKey,
  );
  assert.equal(
    await readAccountKey(req, env.SESSION_SECRET, 99, "openai"),
    null,
  );
  assert.equal(
    await readAccountKey(
      request(
        "/api/ai-keys",
        key.replace(aiCookieName("openai"), aiCookieName("anthropic")),
      ),
      env.SESSION_SECRET,
      42,
      "anthropic",
    ),
    null,
  );
  assert.equal(
    await readAccountKey(req, "different-secret".repeat(4), 42, "openai"),
    null,
  );
  const sealed = key.slice(key.indexOf("=") + 1);
  assert.equal(await unseal(sealed, env.SESSION_SECRET), null);
  assert.equal(
    (
      await worker.fetch(
        request("/api/ai-keys", `__Host-pp-session=${sealed}`),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    await readAccountKey(
      request("/api/ai-keys", key + "tampered"),
      env.SESSION_SECRET,
      42,
      "openai",
    ),
    null,
  );
});

test("expired credentials and oversized cookie envelopes are rejected", async (t) => {
  const now = t.mock.method(Date, "now", () => 1000);
  const key = await keyCookie();
  now.mock.restore();
  assert.equal(
    await readAccountKey(
      request("/api/ai-keys", key),
      env.SESSION_SECRET,
      42,
      "openai",
    ),
    null,
  );
  assert.equal(
    await readAccountKey(
      request("/api/ai-keys", `${aiCookieName("openai")}=${"a".repeat(5000)}`),
      env.SESSION_SECRET,
      42,
      "openai",
    ),
    null,
  );
});

test("saved-key analysis and graph calls fail closed after logout, expiry or account switch", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Must not reach provider");
  });
  const key = await keyCookie();
  const unauthenticated = [
    key,
    `${await session(42, 1)}; ${key}`,
    `${await session(99)}; ${key}`,
    `${await session()}; ${await keyCookie(99)}`,
  ];
  for (const cookies of unauthenticated) {
    for (const [path, payload] of [
      ["/api/analyze", analyze],
      ["/api/relate", relation],
      ["/api/paper-labels", labels],
    ] as const) {
      const r = await worker.fetch(
        request(path, cookies, "POST", { ...payload, apiKey: testKey }),
        env,
      );
      assert([401, 409].includes(r.status));
    }
  }
  assert.equal(calls, 0);
});

test("legacy saved keys restore Luna for analysis and graph without exposing plaintext keys", async (t) => {
  const auth = await session();
  const legacy = await saveAccountKey(env.SESSION_SECRET, 42, {
    ...settings,
    model: "gpt-5-mini",
  });
  const cookies = `${auth}; ${cookiePair(legacy.cookie)}`;
  const metadata = await worker.fetch(request("/api/ai-keys", cookies), env);
  assert.equal(metadata.status, 200);
  const data = (await metadata.json()) as { keys: AccountAIKey[] };
  assert(!JSON.stringify(data).includes(testKey));
  const restored = accountAISettings(data.keys[0], 42);
  assert.equal(restored.apiKey, "");
  assert.equal(restored.model, "gpt-6-luna");
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init: RequestInit) => {
      calls++;
      assert.equal(
        (init.headers as Record<string, string>).Authorization,
        `Bearer ${testKey}`,
      );
      const body = JSON.parse(init.body as string);
      assert.equal(body.model, "gpt-6-luna");
      const result =
        body.text.format.name === "paper_analysis"
          ? {
              positioning: "Test",
              tags: [],
              limitations: [],
              sections: {
                motivation: [
                  { heading: "Test", text: "Test explanation", citations: [] },
                ],
                coreConcept: [
                  { heading: "Test", text: "Test explanation", citations: [] },
                ],
                method: [
                  { heading: "Test", text: "Test explanation", citations: [] },
                ],
                experimentalSetup: [
                  { heading: "Test", text: "Test explanation", citations: [] },
                ],
                results: [
                  { heading: "Test", text: "Test explanation", citations: [] },
                ],
              },
            }
          : body.text.format.name === "paper_labels"
            ? { labels: [{ id: "a", label: "Attention" }] }
            : { relations: [] };
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(result) }],
          },
        ],
      });
    },
  );
  for (const [path, payload] of [
    ["/api/analyze", analyze],
    ["/api/relate", relation],
    ["/api/paper-labels", labels],
  ] as const) {
    const r = await worker.fetch(
      request(path, cookies, "POST", { ...payload, ...restored }),
      env,
    );
    assert.equal(r.status, 200);
    assert(!(await r.text()).includes(testKey));
  }
  assert.equal(calls, 3);
  assert(
    hasAIConnection({
      provider: "openai",
      model: "test",
      apiKey: "",
      accountId: 42,
    }),
  );
});

test("logout blocks the saved key, and a new same-account session can reuse it", async () => {
  const key = await keyCookie();
  const logout = await worker.fetch(
    request("/api/auth/logout", `${await session()}; ${key}`, "POST", {}),
    env,
  );
  assert.match(
    logout.headers.get("set-cookie")!,
    /__Host-pp-session=.*Max-Age=0/,
  );
  assert(!logout.headers.get("set-cookie")!.includes("pp-ai-"));
  assert.equal(
    (await worker.fetch(request("/api/ai-keys", key), env)).status,
    401,
  );
  const relogin = await worker.fetch(
    request("/api/ai-keys", `${await session()}; ${key}`),
    env,
  );
  assert.equal(((await relogin.json()) as { keys: unknown[] }).keys.length, 1);
  const switched = await worker.fetch(
    request("/api/ai-keys", `${await session(99)}; ${key}`),
    env,
  );
  assert.deepEqual(((await switched.json()) as { keys: unknown[] }).keys, []);
});

test("model updates reuse the hidden key; deleting one provider preserves the other", async () => {
  const auth = await session();
  const key = await keyCookie();
  const claude = cookiePair(
    (
      await saveAccountKey(env.SESSION_SECRET, 42, {
        provider: "anthropic",
        model: "test-claude",
        apiKey: "sk-ant-TEST-ONLY-FAKE-KEY",
      })
    ).cookie,
  );
  const updated = await worker.fetch(
    request("/api/ai-keys", `${auth}; ${key}`, "PUT", {
      accountId: 42,
      provider: "openai",
      model: "new-model",
    }),
    env,
  );
  assert.equal(updated.status, 200);
  const updatedKey = cookiePair(updated.headers.get("set-cookie")!);
  assert.equal(
    (
      await readAccountKey(
        request("/", updatedKey),
        env.SESSION_SECRET,
        42,
        "openai",
      )
    )?.apiKey,
    testKey,
  );
  const deleted = await worker.fetch(
    request("/api/ai-keys", `${auth}; ${updatedKey}; ${claude}`, "DELETE", {
      accountId: 42,
      provider: "openai",
    }),
    env,
  );
  assert.equal(deleted.status, 200);
  assert.match(
    deleted.headers.get("set-cookie")!,
    /^__Host-pp-ai-openai=;.*Max-Age=0$/,
  );
  const remaining = await worker.fetch(
    request("/api/ai-keys", `${auth}; ${claude}`),
    env,
  );
  assert.deepEqual(
    ((await remaining.json()) as { keys: { provider: string }[] }).keys.map(
      (k) => k.provider,
    ),
    ["anthropic"],
  );
});
