import worker from "../worker/index";
import { seal } from "../worker/security";
// A real encrypted, short-lived login cookie, using only synthetic test data.
// Empty or invalid Cookie headers remain unauthenticated for rejection tests.
export default {
  async fetch(req: Request, env: Parameters<typeof worker.fetch>[1]) {
    if (req.headers.get("Cookie") === "test-session") {
      const headers = new Headers(req.headers);
      headers.set(
        "Cookie",
        "__Host-pp-session=" +
          (await seal(
            {
              id: 42,
              login: "fixture",
              name: "Fixture",
              token: "fake-github-token",
              expires: Date.now() + 60000,
            },
            env.SESSION_SECRET,
          )),
      );
      req = new Request(req, { headers });
    }
    return worker.fetch(req, env);
  },
};
