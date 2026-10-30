import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import { seal } from "../worker/security";

const base = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "test-secret",
  GITHUB_APP_SLUG: "test-app",
  SESSION_SECRET: "session-test-only-secret-".repeat(3),
  ASSETS: { fetch: async () => new Response("asset") },
};
const request = (path: string, cookies = "", method = "GET") =>
  new Request(base.APP_ORIGIN + path, {
    method,
    headers: { Cookie: cookies, Origin: base.APP_ORIGIN },
  });

test("login requests offline access so expiring GitHub tokens can be renewed", async () => {
  const r = await worker.fetch(request("/api/auth/login"), base);
  assert.equal(
    new URL(r.headers.get("location")!).searchParams.get("scope"),
    "offline_access",
  );
});

test("GitHub temporary failure must not be reported as logout", async (t) => {
  const auth =
    "__Host-pp-session=" +
    (await seal(
      {
        id: 42,
        login: "test",
        name: "Test",
        token: "fake-token",
        expires: Date.now() + 60000,
      },
      base.SESSION_SECRET,
    ));
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("Unavailable", { status: 503 }),
  );
  const r = await worker.fetch(request("/api/repos", auth), base);
  assert.equal(r.status, 503);
});

import {
  GithubSession,
  createSession,
  SESSION_AGE,
  type SessionNamespace,
} from "../worker/session";
import { saveAccountKey } from "../worker/ai-credentials";
import type { DurableObjectState } from "@cloudflare/workers-types";
import { api, ApiError, isAuthenticationError } from "../src/lib/api";
class MemoryStorage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.data.set(key, value);
  }
  async deleteAll() {
    this.data.clear();
  }
  async deleteAlarm() {
    this.alarm = null;
  }
  async setAlarm(value: number) {
    this.alarm = value;
  }
}
function environment() {
  const stores = new Map<string, MemoryStorage>();
  const objects = new Map<string, GithubSession>();
  const env = {
    ...base,
    GITHUB_SESSIONS: undefined as SessionNamespace | undefined,
  };
  env.GITHUB_SESSIONS = {
    idFromName: (name) => name,
    get: (id) => {
      const key = String(id);
      if (!stores.has(key)) stores.set(key, new MemoryStorage());
      if (!objects.has(key))
        objects.set(
          key,
          new GithubSession(
            {
              storage: stores.get(
                key,
              )! as unknown as DurableObjectState["storage"],
            },
            env,
          ),
        );
      return objects.get(key)!;
    },
  };
  return { env, stores, objects };
}
const user = { id: 42, name: "Test", login: "test" };
const tokens = {
  access_token: "fake-access-one",
  expires_in: 28800,
  refresh_token: "fake-refresh-one",
  refresh_token_expires_in: 15897600,
};
const nextTokens = {
  ...tokens,
  access_token: "fake-access-two",
  refresh_token: "fake-refresh-two",
};
const pair = (header: string) => header.split(";")[0];

test("OAuth callback persists long-lived encrypted credentials with a token-free browser ticket", async (t) => {
  const { env, stores } = environment();
  const pending = await seal(
    {
      state: "test-state",
      verifier: "test-verifier",
      expires: Date.now() + 60000,
    },
    env.SESSION_SECRET,
  );
  t.mock.method(globalThis, "fetch", async (url: unknown) =>
    Response.json(String(url).includes("/access_token") ? tokens : user),
  );
  const r = await worker.fetch(
    request(
      "/api/auth/callback?state=test-state&code=test-code",
      "__Host-pp-oauth=" + pending,
    ),
    env,
  );
  assert.equal(r.status, 302);
  const header = r.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Host-pp-session="))!;
  assert(header);
  const age = Number(header.match(/Max-Age=(\d+)/)![1]);
  assert(age > SESSION_AGE - 10 && age <= SESSION_AGE);
  assert.match(header, /HttpOnly; Secure; SameSite=Lax/);
  assert(!header.includes("fake-"));
  assert(!header.includes("Domain="));
  const stored = [...stores.values()][0];
  assert(!String(stored.data.get("credentials")).includes("fake-"));
  assert(stored.alarm! > Date.now() + 179 * 86400000);
  const me = await worker.fetch(request("/api/me", pair(header)), env);
  const body = await me.text();
  assert.deepEqual(JSON.parse(body).user, user);
  assert.equal(JSON.parse(body).renewable, true);
  assert(!body.includes("token"));
  assert.equal(me.headers.get("cache-control"), "no-store");
});

test("expired access tokens refresh once across concurrent tabs and survive object restart", async (t) => {
  const { env, stores, objects } = environment();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const auth = pair(await createSession(env, user, tokens));
  now += 9 * 3600000;
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      calls++;
      const input = JSON.parse(init.body as string);
      assert.equal(input.grant_type, "refresh_token");
      assert.equal(input.refresh_token, tokens.refresh_token);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json(nextTokens);
    },
  );
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      worker.fetch(request("/api/me", auth), env),
    ),
  );
  assert.equal(calls, 1);
  for (const r of results) {
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { user: typeof user }).user.id, 42);
  }
  const encrypted = [...stores.values()][0].data.get("credentials");
  assert(!String(encrypted).includes(nextTokens.refresh_token));
  objects.clear(); // Same stored session, new Worker/DO isolate, same original browser cookie.
  const r = await worker.fetch(request("/api/me", auth), env);
  assert.equal(((await r.json()) as { user: typeof user }).user.id, 42);
  assert.equal(calls, 1);
  assert(
    Number(r.headers.get("set-cookie")!.match(/Max-Age=(\d+)/)![1]) >
      SESSION_AGE - 10,
  );
});

test("refresh outage, invalid JSON and rate limits retain credentials and recover without re-login", async (t) => {
  const { env, stores } = environment();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const auth = pair(await createSession(env, user, tokens));
  now += 9 * 3600000;
  let mode = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (mode === 0) throw new TypeError("network offline");
    if (mode === 1)
      return new Response("temporarily unavailable", { status: 503 });
    if (mode === 2) return new Response("<html>bad gateway</html>");
    if (mode === 3)
      return Response.json({ error: "bad_refresh_token" }, { status: 429 });
    return Response.json(nextTokens);
  });
  for (mode = 0; mode < 4; mode++) {
    const r = await worker.fetch(request("/api/me", auth), env);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("set-cookie"), null);
    assert.equal([...stores.values()][0].data.size, 1);
    assert(!(await r.text()).includes("fake-"));
  }
  const r = await worker.fetch(request("/api/me", auth), env);
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { user: typeof user }).user.id, 42);
});

test("revoked refresh token deletes the session; account AI stays inaccessible", async (t) => {
  const { env, stores } = environment();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const auth = pair(await createSession(env, user, tokens));
  const key = pair(
    (
      await saveAccountKey(env.SESSION_SECRET, 42, {
        provider: "openai",
        model: "gpt-6-luna",
        apiKey: "sk-TEST-ONLY-NOT-REAL",
      })
    ).cookie,
  );
  now += 9 * 3600000;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "bad_refresh_token" }),
  );
  const r = await worker.fetch(request("/api/me", auth), env);
  assert.deepEqual(await r.json(), { user: null });
  assert.equal([...stores.values()][0].data.size, 0);
  assert.equal(
    (await worker.fetch(request("/api/ai-keys", auth + "; " + key), env))
      .status,
    401,
  );
});

test("logout queued during token refresh prevents a delayed response from reviving the session", async (t) => {
  const { env } = environment();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const auth = pair(await createSession(env, user, tokens));
  now += 9 * 3600000;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const paused = new Promise<void>((r) => {
    release = r;
  });
  t.mock.method(globalThis, "fetch", async () => {
    entered();
    await paused;
    return Response.json(nextTokens);
  });
  const inFlight = worker.fetch(request("/api/me", auth), env);
  await started;
  const logout = worker.fetch(request("/api/auth/logout", auth, "POST"), env);
  release();
  const [fresh, ended] = await Promise.all([inFlight, logout]);
  assert.equal(ended.status, 200);
  assert.match(ended.headers.get("set-cookie")!, /Max-Age=0/);
  const lateCookie = pair(fresh.headers.get("set-cookie")!);
  assert.deepEqual(
    await (await worker.fetch(request("/api/me", lateCookie), env)).json(),
    { user: null },
  );
  assert.equal(
    (await worker.fetch(request("/api/ai-keys", auth), env)).status,
    401,
  );
});

test("session expiration alarms delete encrypted credentials, while stale alarms preserve renewed sessions", async (t) => {
  const { env, stores, objects } = environment();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const auth = pair(await createSession(env, user, tokens));
  const object = [...objects.values()][0];
  await object.alarm();
  assert.equal([...stores.values()][0].data.size, 1);
  now += (SESSION_AGE + 1) * 1000;
  await object.alarm();
  assert.equal([...stores.values()][0].data.size, 0);
  assert.equal([...stores.values()][0].alarm, null);
  assert.deepEqual(
    await (await worker.fetch(request("/api/me", auth), env)).json(),
    { user: null },
  );
});

test("server sessions preserve saved AI account isolation and reject tampered tickets", async () => {
  const { env } = environment();
  const auth = pair(await createSession(env, user, tokens));
  const other = pair(await createSession(env, { ...user, id: 99 }, tokens));
  const key = pair(
    (
      await saveAccountKey(env.SESSION_SECRET, 42, {
        provider: "openai",
        model: "gpt-6-luna",
        apiKey: "sk-TEST-ONLY-NOT-REAL",
      })
    ).cookie,
  );
  const owner = await worker.fetch(
    request("/api/ai-keys", auth + "; " + key),
    env,
  );
  assert.equal(((await owner.json()) as { keys: unknown[] }).keys.length, 1);
  const wrong = await worker.fetch(
    request("/api/ai-keys", other + "; " + key),
    env,
  );
  assert.equal(((await wrong.json()) as { keys: unknown[] }).keys.length, 0);
  const tampered = auth.slice(0, -10) + "abcINVALID";
  assert.equal(
    (await worker.fetch(request("/api/ai-keys", tampered), env)).status,
    401,
  );
  assert.equal(
    (
      await worker.fetch(request("/api/ai-keys", auth), {
        ...env,
        SESSION_SECRET: "different-secret-".repeat(4),
      })
    ).status,
    401,
  );
});

test("missing session storage is a retryable outage, never anonymous authentication", async () => {
  const { env } = environment();
  const auth = pair(await createSession(env, user, tokens));
  const r = await worker.fetch(request("/api/me", auth), {
    ...env,
    GITHUB_SESSIONS: undefined,
  });
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("set-cookie"), null);
});

test("API failures distinguish transient outages from authentication, including malformed success responses", async (t) => {
  let response = new Response("<html>gateway</html>");
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(
    api("/me"),
    (error) =>
      error instanceof ApiError &&
      error.status === 502 &&
      !isAuthenticationError(error),
  );
  response = Response.json({ error: "offline" }, { status: 503 });
  await assert.rejects(api("/me"), (error) => !isAuthenticationError(error));
  response = Response.json({ error: "expired" }, { status: 401 });
  await assert.rejects(api("/me"), (error) => isAuthenticationError(error));
});

test("older sessions stay usable but explicitly advertise that one re-login is needed", async () => {
  const auth =
    "__Host-pp-session=" +
    (await seal(
      { ...user, token: "fake-token", expires: Date.now() + 60000 },
      base.SESSION_SECRET,
    ));
  const r = await worker.fetch(request("/api/me", auth), base);
  const data = (await r.json()) as { user: typeof user; renewable: boolean };
  assert.equal(data.user.id, 42);
  assert.equal(data.renewable, false);
  assert.equal(r.headers.get("set-cookie"), null);
  const { env } = environment();
  const limited = pair(
    await createSession(env, user, {
      access_token: "fake-access",
      expires_in: 28800,
    }),
  );
  const fallback = await worker.fetch(request("/api/me", limited), env);
  assert.equal(
    ((await fallback.json()) as { renewable: boolean }).renewable,
    false,
  );
});
