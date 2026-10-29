# Paper Palace

**Read. Connect. Remember.** A personal research graph for the papers you read.

Paper Palace pairs an arXiv reader with five-part, evidence-linked AI summaries, private research notes, and a knowledge graph. The interface is in Korean. Made with Next.js, deployed as static assets plus a small Cloudflare Worker.

## Features

- arXiv metadata and version-aware HTML/PDF reading; original PDF alongside extracted text.
- Motivation, core concept, method, experimental setup and results, generated with your OpenAI or Anthropic API key.
- Verified short source quotations link back to the original text. Unsupported citations are removed; generated claims still require human review.
- Local IndexedDB storage, tags, reading status, notes, JSON import/export, draggable graph and directed relationships.
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

Private repositories store `paper-palace/library.json`. Full paper sources stay in the browser cache. Sync merges items by modification timestamp and honors deletion tombstones. Git history retains prior revisions. Export/import validates the schema before merging. Local data is separated by GitHub account; importing pre-login local data is explicit.

Current limits: 3MB library sync, 1000 papers per library, 120 PDF pages, 220000 extracted text characters per AI analysis, 25MB PDFs when upstream supplies length. Figure pixels are not analyzed; complex tables and math may lose layout during extraction. PDF-only citations link to extracted blocks and expose page numbers. Scanned PDFs need OCR and are not supported. Users choose a model supporting structured outputs and pay their provider directly.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm audit
```

## License

MIT. Paper text and linked publications remain subject to their original licenses. The generated Paper Palace logo is included with this project.
