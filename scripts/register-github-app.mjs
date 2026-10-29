// Temporary localhost manifest handoff. Never serves or logs returned secrets.
import http from "node:http";
import { writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
const state = randomBytes(24).toString("hex");
const manifest = {
  name: "Paper Palace by Minjae",
  url: "https://paperpalace.minjaek.im",
  description:
    "Your personal research graph. Read arXiv papers, connect ideas, and save your research library in your own private repository.",
  redirect_url: "http://localhost:8788/callback",
  callback_urls: ["https://paperpalace.minjaek.im/api/auth/callback"],
  public: true,
  default_permissions: { contents: "write", metadata: "read" },
  default_events: [],
  hook_attributes: {
    url: "https://paperpalace.minjaek.im/api/webhook",
    active: false,
  },
};
const escaped = JSON.stringify(manifest)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;");
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8788");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method === "GET" && url.pathname === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Paper Palace GitHub App 설정</title><style>body{font:16px system-ui;background:#f7f5ef;color:#33452f;max-width:700px;margin:70px auto;line-height:1.8;padding:25px}button{background:#3e5142;color:white;border:0;padding:14px 22px;font:inherit;cursor:pointer}code{background:#e6eadc;padding:4px}</style><h1>Paper Palace GitHub App</h1><p>등록할 앱: <strong>Paper Palace by Minjae</strong></p><p>웹사이트: https://paperpalace.minjaek.im</p><p>콜백: <code>/api/auth/callback</code></p><ul><li>선택한 저장소의 Contents: 읽기·쓰기</li><li>선택한 저장소의 Metadata: 읽기</li><li>웹훅 비활성화 · 다른 계정도 설치 가능</li></ul><p>기존 저장소에 바로 접근하지 않습니다. 설치 시 사용자가 선택한 저장소만 연결됩니다.</p><form action="https://github.com/settings/apps/new?state=${state}" method="post"><input type="hidden" name="manifest" value="${escaped}"><button>GitHub에서 등록 검토하기</button></form></html>`,
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/callback") {
    const received = url.searchParams.get("state") || "";
    if (
      received.length !== state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(received))
    ) {
      res.writeHead(400);
      res.end("Invalid state");
      return;
    }
    const code = url.searchParams.get("code");
    if (!code || !/^[a-zA-Z0-9]+$/.test(code)) {
      res.writeHead(400);
      res.end("Invalid code");
      return;
    }
    try {
      const r = await fetch(
        `https://api.github.com/app-manifests/${code}/conversions`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Paper-Palace-Setup",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
      const app = await r.json();
      writeFileSync(
        ".dev.vars",
        `GITHUB_CLIENT_SECRET=${app.client_secret}\nSESSION_SECRET=${randomBytes(48).toString("base64url")}\n`,
        { mode: 0o600 },
      );
      writeFileSync(
        ".planning/github-app.json",
        JSON.stringify({
          id: app.id,
          slug: app.slug,
          client_id: app.client_id,
          html_url: app.html_url,
        }),
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<h1>Paper Palace GitHub App 등록 완료</h1><p>비밀값은 보호된 로컬 설정에 저장했습니다. 이 페이지에는 표시하지 않습니다.</p>",
      );
      console.log(
        "GitHub App registration completed; non-secret metadata saved in .planning/github-app.json.",
      );
    } catch (e) {
      res.writeHead(502);
      res.end(
        "App registration exchange failed. See non-sensitive terminal status.",
      );
      console.error(e.message);
    }
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});
server.listen(8788, "127.0.0.1", () =>
  console.log("GitHub App setup review: http://localhost:8788/"),
);
