# Paper Palace

**Read. Connect. Remember.** A personal research graph for the papers you read.

[Open Paper Palace](https://paperpalace.minjaek.im) · [Research workspace](https://paperpalace.minjaek.im/app/)

Paper Palace pairs an arXiv reader with five-part, evidence-linked AI summaries, private research notes, and a knowledge graph. The interface is in Korean. Made with Next.js, deployed as static assets plus a small Cloudflare Worker.

## Features

- arXiv metadata and version-aware HTML/PDF reading; original PDF alongside extracted text.
- Motivation, core concept, method, experimental setup and results, generated with your OpenAI or Anthropic API key.
- Verified short source quotations link back to the original text. Unsupported citations are removed; generated claims still require human review.
- Local folder autosave plus IndexedDB cache, tags, reading status, notes, JSON import/export, draggable graph and directed relationships. AI can propose connections between analyzed papers; proposals stay dashed until you review and adopt them.
- GitHub App OAuth (PKCE/state, encrypted HttpOnly sessions) and user-selected private repository synchronization. No central user database.
- A portable [Paper Palace agent skill](skills/paper-palace/SKILL.md).

## Local development

Requires Node.js 22+.

```sh
npm ci
npm run build
npm run preview -- --var APP_ORIGIN:http://localhost:8787
```

Open http://localhost:8787. The frontend-only hot reload server is `npm run dev`; use the full Worker preview for API features. After frontend edits, rebuild the static assets for Worker preview.

## Deploy to your Cloudflare account

Set `APP_ORIGIN`, `GITHUB_CLIENT_ID`, and `GITHUB_APP_SLUG` in `wrangler.jsonc`. Register a public GitHub App with **Contents: read and write** and **Metadata: read**; no webhook is needed. Set its OAuth callback to `https://YOUR_DOMAIN/api/auth/callback`. Users install it only on their selected private data repository.

```sh
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npm run deploy
```

Use a cryptographically random session secret of at least 32 characters. Keep secrets out of Git. For local integration, use an ignored `.dev.vars` file and a dedicated local GitHub App callback.

A Worker custom domain route connects the domain; configure your own domain in `wrangler.jsonc`. This project uses no paid database, object storage, or operator model key. Cloudflare/GitHub free quotas still apply; unlimited availability is not promised. Never automatically enable a paid plan.

## Data and privacy

API keys live only in the current browser tab's memory. Requests pass through the stateless Worker to the chosen model provider. No keys are stored in GitHub or application logs. OpenAI requests use `store: false`; provider retention rules still apply.

Private repositories store `paper-palace/library.json`. Full paper sources stay in the browser cache. Sync merges items by modification timestamp and honors deletion tombstones. Git history retains prior revisions. Export/import validates the schema before merging. Browser caches are separated by GitHub account; explicitly starting GitHub login carries the current tab’s library and folder connection through sign-in.

Current limits: 3MB library sync, 1000 papers per library, 120 PDF pages, 220000 extracted text characters per AI analysis, up to 40 paper summaries per AI relationship request, 25MB PDFs when upstream supplies length. Figure pixels are not analyzed; complex tables and math may lose layout during extraction. PDF-only citations link to extracted blocks and expose page numbers. Scanned PDFs need OCR and are not supported. Users choose a model supporting structured outputs and pay their provider directly.

## Verification

The deployed site has been checked with real GitHub sign-in, a selected private repository, library write/read synchronization, arXiv HTML and PDF viewing, and mobile layouts. AI request formatting and citation validation are tested with mocked provider responses; a real paid model request is not part of the automated suite.

```sh
npm run typecheck
npm test
npm run build
npm audit
```

## License

MIT. Paper text and linked publications remain subject to their original licenses. The generated Paper Palace logo is included with this project.

## Connect a local folder, GitHub, or both

In **연결 및 설정**, connect either destination at any time. Neither requires the other:

- **Local folder only:** choose a directory; the app reads/writes `paper-palace/library.json` beneath it. Changes autosave while the page is open. The browser remembers the directory handle and may ask you to reconnect on a later visit.
- **GitHub only:** sign in, select your private repository, and press **GitHub과 동기화** to fetch and send changes. Browser storage remains a working cache.
- **Both:** the same library is saved to the folder and synced with GitHub. GitHub synchronization reads the connected folder first and saves the result back to it. GitHub sync is manual, not a background service.

Starting with GitHub and adding a folder merges the current library with any existing file in that folder. Starting locally and using the app's GitHub login button carries this tab's library and folder connection through sign-in; existing account/repository data is merged, not discarded. A normal account switch does not automatically import other accounts' data. Disconnecting either destination keeps the current library and existing files.

File System Access requires a supporting browser (for example desktop Chrome or Edge), HTTPS/localhost, and explicit folder permission. The UI detects support and offers GitHub and JSON import/export elsewhere. The app checks external folder edits when it regains focus, periodically while visible, and before writing. An agent can use the same folder (including a clone of the data repository) with the published skill; the web app does not run native Git commands or store keys in the folder.

Sync tracks a common baseline per connection. Independent item changes merge automatically; conflicting edits/deletions require choosing a version before saving. Invalid JSON, oversized files, revoked permissions, and detected concurrent file changes pause folder saving and leave the existing file intact. File System Access cannot atomically coordinate with arbitrary native editors: avoid editing the same file at the exact same instant, and retry a detected race. Deleted items require `deleted` tombstones; simply removing an array entry is not a synchronized deletion. Keep source PDFs outside the library JSON.
