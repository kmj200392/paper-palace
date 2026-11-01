import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import { seal } from "../worker/security";
import { emptyLibrary } from "../src/lib/model";
const env = {
  APP_ORIGIN: "https://paperpalace.minjaek.im",
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "test-secret",
  GITHUB_APP_SLUG: "test-app",
  SESSION_SECRET: "library-api-test-secret-".repeat(3),
  ASSETS: { fetch: async () => new Response("asset") },
};
async function auth() {
  return (
    "__Host-pp-session=" +
    (await seal(
      {
        id: 42,
        login: "qa",
        name: "QA",
        token: "fake",
        expires: Date.now() + 60000,
      },
      env.SESSION_SECRET,
    ))
  );
}
test("stale-account tabs cannot read or write a new account's library", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("must not reach GitHub");
  });
  const cookie = await auth();
  for (const method of ["GET", "PUT"]) {
    const request = new Request(
      env.APP_ORIGIN + "/api/library?repo=qa/library&accountId=99",
      {
        method,
        headers: { Cookie: cookie, Origin: env.APP_ORIGIN },
        ...(method === "PUT"
          ? {
              body: JSON.stringify({
                accountId: 99,
                repo: "qa/library",
                sha: "old",
                library: emptyLibrary(),
              }),
            }
          : {}),
      },
    );
    const r = await worker.fetch(request, env);
    assert.equal(r.status, 409);
    assert.match(await r.text(), /계정이 바뀌/);
  }
  assert.equal(calls, 0);
});
test("GitHub SHA conflict is surfaced without an unconditional write retry", async (t) => {
  let writes = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      if (init?.method === "PUT") {
        writes++;
        assert.equal(JSON.parse(init.body as string).sha, "old-sha");
        return new Response("conflict", { status: 409 });
      }
      return Response.json({ private: true, permissions: { push: true } });
    },
  );
  const r = await worker.fetch(
    new Request(env.APP_ORIGIN + "/api/library", {
      method: "PUT",
      headers: { Cookie: await auth(), Origin: env.APP_ORIGIN },
      body: JSON.stringify({
        accountId: 42,
        repo: "qa/library",
        sha: "old-sha",
        library: emptyLibrary(),
      }),
    }),
    env,
  );
  assert.equal(r.status, 409);
  assert.equal(writes, 1);
});
