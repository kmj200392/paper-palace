# Paper Palace

**Read. Connect. Remember.** A personal research graph for the papers you read.

[Open Paper Palace](https://paperpalace.minjaek.im) · [Research workspace](https://paperpalace.minjaek.im/app/)

Paper Palace pairs an arXiv reader with five-part, evidence-linked AI summaries, private research notes, and a knowledge graph. The interface is in Korean. Made with Next.js, deployed as static assets plus a small Cloudflare Worker.

## Features

- arXiv metadata and version-aware reading, opening in the original PDF by default. The PDF.js viewer preserves figures/equations, offers page navigation, zoom/fit, text search, and selectable text. Selected text can be appended to existing notes with its page number (up to 2,000 characters per selection on one page). Extracted text remains available as a fallback.
- The sidebar holds navigation, paper import, AI connection and GitHub sync. Collapse it to an icon rail without losing access to actions; this browser remembers the preference across refreshes. On small screens, expanded navigation overlays the reading area.
- Motivation, core concept, method, experimental setup and results, generated with your OpenAI or Anthropic API key.
- Detailed explanations use titled paragraphs to explain mechanisms, experimental conditions, comparisons and limitations with verified source links. Older summaries stay readable and can be replaced explicitly with **상세 해설로 다시 정리**; notes remain intact. New analysis requests allow up to 24,000 output tokens on OpenAI or 16,000 on Anthropic, with one provider call and no automatic paid retry.
- OpenAI defaults to `gpt-6-luna` for paper analysis and graph suggestions. Saved connections using the former `gpt-5-mini` default restore with Luna; other saved model IDs are preserved.
- Verified short source quotations are found and highlighted in the PDF, tolerating line breaks, hyphenation and typographic ligatures. If the full phrase cannot be matched, the reader explicitly offers the verified extracted-text block instead. Original extraction IDs/hashes and existing summaries are preserved. Unsupported citations are removed; generated claims still require human review.
- Local folder autosave plus IndexedDB cache, tags, reading status, notes, JSON import/export, draggable graph and directed relationships. AI can propose connections between analyzed papers; proposals stay dashed until you review and adopt them.
- Compact graph nodes show a saved 1–2 word name (for example MemRefine, Attention or A-Mem). When AI is connected and Settings is closed, missing names for new and existing papers are generated automatically from titles and abstracts (each abstract is limited to 4,000 characters), in batches of at most 20. This uses the selected provider/model and the user's API credits; names are cached in `graphLabel` and travel with folder/GitHub/JSON data. Names already saved are preserved. Without AI, a title-derived placeholder appears; failed generation pauses until **이름 다시 만들기** or a new AI connection. Hover a node to see its full title, or use its accessible name with a screen reader; clicking opens the paper.
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

API keys default to the current tab's memory. Signed-in users can select **Keep using while signed in** in Settings → AI connection. The Worker encrypts the provider key, model and GitHub user ID in a host-only `HttpOnly; Secure; SameSite=Lax` cookie with a maximum 180-day lifetime. No database is needed. Refresh restores connection metadata automatically; saved keys are never returned to frontend JavaScript. Every saved-key analysis/graph request requires a valid session, a matching cookie owner/provider and the account ID shown in the requesting tab. Logout removes the login session, immediately preventing new saved-key calls. The encrypted key cookie remains so the same account can reconnect after signing in again. Other browsers need their own one-time registration. Disconnect removes that provider's cookie; connecting a different account replaces that provider's previous cookie in this browser.

Account-key cookies use a separate encryption domain derived from the Worker session secret, so they cannot be replayed as authentication cookies. Expiry, schema, size, account and provider are checked on read. Key management mutations require the exact application Origin; responses are `no-store`. A successful save is verified by reading metadata back. Rotating `SESSION_SECRET` invalidates both sessions and saved account keys. No keys or cookies are written to application logs, GitHub, folders, library exports or login handoffs. This is server-managed encryption, not end-to-end encryption against the service operator. An attacker able to execute same-origin JavaScript can still invoke AI while signed in, even though the saved key cannot be read by that JavaScript.

An optional **password vault** is still available, including for guests. Users can unlock a previously saved key once and click **Keep using while signed in** to migrate it; the old vault is retained until explicitly deleted. The password vault requires its passphrase again after a refresh or logout. Lock clears the current tab's manual key; delete removes the provider's saved ciphertext. Removing either kind of saved key does not revoke it at the provider or wipe manual keys already held by another tab.

The vault uses browser-native AES-256-GCM with a fresh 96-bit IV and 128-bit salt for every save, and PBKDF2-HMAC-SHA256 (600,000 iterations). A 12–256 character passphrase derives a non-extractable key; neither the passphrase nor the derived key is persisted. Version and provider are authenticated with additional data. Strict envelope validation bounds ciphertext size and fixes KDF parameters before decryption. Only ciphertext and public encryption parameters are written to IndexedDB (`ai-vault:v1:<provider>`); the last selected provider is a separate non-secret preference. The vault belongs to this browser profile and site, independently of GitHub login. It is excluded from library exports, folders, GitHub sync, and login handoffs. Forgotten passphrases cannot be recovered; re-register the API key. Clearing site data also deletes the vault.

Encryption protects stored key material at rest, not a compromised browser or code running in an unlocked page. JavaScript strings cannot be reliably erased from memory; reload/lock removes application references, not a guaranteed memory wipe. Requests pass through the stateless Worker to the chosen model provider. No keys are stored in GitHub or application logs. OpenAI requests use `store: false`; provider retention rules still apply.

Private repositories store `paper-palace/library.json`. Full paper sources stay in the browser cache. Sync merges items by modification timestamp and honors deletion tombstones. Git history retains prior revisions. Export/import validates the schema before merging. Browser caches are separated by GitHub account; explicitly starting GitHub login carries the current tab’s library and folder connection through sign-in.

Current limits: 3MB library sync, 1000 papers per library, 120 PDF pages, 220000 extracted text characters per AI analysis, up to 40 paper summaries per AI relationship request, 25MB PDFs when upstream supplies length. Figure pixels are displayed but are not analyzed by AI; complex tables and math may lose layout in the extracted text used for analysis. Citation matching requires the whole normalized phrase and cannot match every HTML formula to PDF glyphs. Scanned PDFs can be viewed, but text selection/search and AI analysis require extractable text (no OCR). Users choose a model supporting structured outputs and pay their provider directly.

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
