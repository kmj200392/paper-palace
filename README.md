# Paper Palace

**Read. Connect. Remember.** A personal research graph for the papers you read.

[Open Paper Palace](https://paperpalace.minjaek.im) · [Research workspace](https://paperpalace.minjaek.im/app/)

Paper Palace pairs an arXiv/OpenReview reader with five-part, evidence-linked AI summaries, private research notes, and a knowledge graph. The interface is in Korean. Made with Next.js, deployed as static assets plus a small Cloudflare Worker.

## Features

- Paper-link import for arXiv and public OpenReview submissions (`forum?id=…` or `pdf?id=…`), opening in the original PDF by default. arXiv keeps exact version IDs; OpenReview uses a namespaced forum ID and its current public PDF. API2 and legacy API1 metadata are supported, without inferring hidden author identities. OpenReview access challenges, private notes and rate limits show explicit errors; a blocked import never creates a placeholder paper. The PDF.js viewer preserves figures/equations, offers page navigation, zoom/fit, text search, and selectable text. Selected text can be appended to existing notes with its page number (up to 2,000 characters per selection on one page). Extracted text remains available as a fallback.
- The sidebar holds navigation, paper import, AI connection and GitHub sync. Collapse it to an icon rail without losing access to actions; this browser remembers the preference across refreshes. On small screens, expanded navigation overlays the reading area.
- **논문 찾기** searches arXiv for a requested field using up to 60 existing papers and 180 directed graph relationships. It uses the connected AI account for at most three calls (search planning, candidate ranking, and one batch author/affiliation extraction), excludes every saved paper across versions, and recommends up to six verified arXiv results with Korean reasons, new perspectives and proposed links to existing papers. Personal paper notes and full texts are omitted. Adding a paper is explicit; graph links are optional and remain dashed suggestions. Results are held only in the current page, not stored on the server. An empty graph can still search by topic. Recommendations are based on metadata/abstracts, not verified full-text comparisons or citation relationships. Cards list deduplicated publication-time affiliations of first/co-first and corresponding authors, without displaying author names or roles. Each card includes a visible, version-independent arXiv abstract-page link. Affiliations are extracted from the recommended papers’ HTML frontmatter or first two PDF pages. Each mapping/role requires a matching source excerpt; missing or ambiguous information stays unknown, and last authors/email domains do not establish correspondence. Source failures never discard recommendations. The source check uses no stored library notes, reads at most two documents concurrently, and does not archive PDFs.
- Motivation, core concept, method, experimental setup and results, generated with your OpenAI or Anthropic API key.
- Detailed explanations use titled paragraphs to explain mechanisms, experimental conditions, comparisons and limitations with verified source links. Older summaries stay readable and can be replaced explicitly with **상세 해설로 다시 정리**; notes remain intact. New analysis requests allow up to 24,000 output tokens on OpenAI or 16,000 on Anthropic, with one provider call and no automatic paid retry.
- OpenAI defaults to `gpt-6-luna` for paper analysis and graph suggestions. Saved connections using the former `gpt-5-mini` default restore with Luna; other saved model IDs are preserved.
- Verified short source quotations are found and highlighted in the PDF, tolerating line breaks, hyphenation and typographic ligatures. If the full phrase cannot be matched, the reader explicitly offers the verified extracted-text block instead. Original extraction IDs/hashes and existing summaries are preserved. Unsupported citations are removed; generated claims still require human review.
- GitHub-backed research storage with automatic saving, tags, reading status, notes, JSON import/export, draggable graph and directed relationships. AI can propose connections between analyzed papers; proposals stay dashed until you review and adopt them.
- Compact graph nodes show a saved 1–2 word name (for example MemRefine, Attention or A-Mem). When AI is connected and Settings is closed, missing names for new and existing papers are generated automatically from titles and abstracts (each abstract is limited to 4,000 characters), in batches of at most 20. This uses the selected provider/model and the user's API credits; names are cached in `graphLabel` and travel with GitHub/JSON data. Names already saved are preserved. Without AI, a title-derived placeholder appears; failed generation pauses until **이름 다시 만들기** or a new AI connection. Hover a node to see its full title, or use its accessible name with a screen reader; clicking opens the paper.
- GitHub App OAuth (PKCE/state, encrypted HttpOnly sessions) and user-selected private repository synchronization. Research libraries stay in user-controlled storage.
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

The `ARXIV_SEARCH` binding uses one SQLite Durable Object to keep arXiv API requests serial and at least 3.1 seconds apart across the service. It persists only the last upstream request time and keeps a bounded, one-hour in-memory cache of public metadata. The included migration creates the class on deployment. SQLite Durable Objects work on the Workers Free plan; this setup does not require enabling a paid plan. Free quota exhaustion returns an error. A busy search may need an explicit retry; provider calls are never automatically retried.

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

API keys default to the current tab's memory. Signed-in users can select **Keep using while signed in** in Settings → AI connection. The Worker encrypts the provider key, model and GitHub user ID in a host-only `HttpOnly; Secure; SameSite=Lax` cookie with a maximum 180-day lifetime. AI keys are not copied into the session store. Refresh restores connection metadata automatically; saved keys are never returned to frontend JavaScript. Every saved-key analysis/graph request requires a valid session, a matching cookie owner/provider and the account ID shown in the requesting tab. Logout removes the login session, immediately preventing new saved-key calls. The encrypted key cookie remains so the same account can reconnect after signing in again. Other browsers need their own one-time registration. Disconnect removes that provider's cookie; connecting a different account replaces that provider's previous cookie in this browser.

Account-key cookies use a separate encryption domain derived from the Worker session secret, so they cannot be replayed as authentication cookies. Expiry, schema, size, account and provider are checked on read. Key management mutations require the exact application Origin; responses are `no-store`. A successful save is verified by reading metadata back. Rotating `SESSION_SECRET` invalidates both sessions and saved account keys. No keys or cookies are written to application logs, GitHub or library exports. This is server-managed encryption, not end-to-end encryption against the service operator. An attacker able to execute same-origin JavaScript can still invoke AI while signed in, even though the saved key cannot be read by that JavaScript.

An optional **password vault** is still available. Research features require GitHub sign-in and a selected repository. Users can unlock a previously saved key once and click **Keep using while signed in** to migrate it; the old vault is retained until explicitly deleted. The password vault requires its passphrase again after a refresh or logout. Lock clears the current tab's manual key; delete removes the provider's saved ciphertext. Removing either kind of saved key does not revoke it at the provider or wipe manual keys already held by another tab.

The vault uses browser-native AES-256-GCM with a fresh 96-bit IV and 128-bit salt for every save, and PBKDF2-HMAC-SHA256 (600,000 iterations). A 12–256 character passphrase derives a non-extractable key; neither the passphrase nor the derived key is persisted. Version and provider are authenticated with additional data. Strict envelope validation bounds ciphertext size and fixes KDF parameters before decryption. Only ciphertext and public encryption parameters are written to IndexedDB (`ai-vault:v1:<provider>`); the last selected provider is a separate non-secret preference. The vault belongs to this browser profile and site, independently of GitHub login. It is excluded from library exports and GitHub sync. Forgotten passphrases cannot be recovered; re-register the API key. Clearing site data also deletes the vault.

Encryption protects stored key material at rest, not a compromised browser or code running in an unlocked page. JavaScript strings cannot be reliably erased from memory; reload/lock removes application references, not a guaranteed memory wipe. Requests pass through the Worker to the chosen model provider. No keys are stored in GitHub or application logs. OpenAI requests use `store: false`; provider retention rules still apply.

Private repositories store `paper-palace/library.json` and are the only durable research library. After sign-in and repository selection, each visit loads GitHub directly. Edits save automatically after a short pause; an in-memory common baseline merges independent changes and concurrent edits require review. Git history retains prior revisions. Full paper sources are held in a bounded tab-memory cache, not IndexedDB. Browser storage retains connection preferences and the optional encrypted API-key vault, but no ongoing library, source or sync baseline. Old browser libraries are left intact and can only be explicitly exported from Settings for recovery.

Failed loads never open an empty editable library. Failed saves retain edits in tab memory, show an error with retry/JSON backup, and pause automatic retries. Unsaved changes trigger a browser leave warning; in-app sign-out or repository changes first attempt to save and require an explicit discard if saving fails. A browser crash or forced close can still lose unsaved changes.

OpenReview metadata and PDFs must be accessible to the service through its official API. OpenReview can require authentication even for public material; this integration does not bypass that requirement or borrow a browser session. Cross-provider copies of the same paper are not automatically merged. Recommendation search still uses arXiv, while existing OpenReview papers and their graph relationships can inform the recommendations.

Current limits: 3MB library sync, 1000 papers per library, 120 PDF pages, 220000 extracted text characters per AI analysis, up to 40 paper summaries per AI relationship request, 25MB PDFs when upstream supplies length. Figure pixels are displayed but are not analyzed by AI; complex tables and math may lose layout in the extracted text used for analysis. Citation matching requires the whole normalized phrase and cannot match every HTML formula to PDF glyphs. Scanned PDFs can be viewed, but text selection/search and AI analysis require extractable text (no OCR). Users choose a model supporting structured outputs and pay their provider directly.

## Verification

Earlier releases were checked with real GitHub sign-in, private-repository writes/reads, and arXiv HTML/PDF viewing. The GitHub-only lifecycle is verified with isolated browser fixtures and controller/Worker tests covering autosave, refresh, load/save failure, conflict review, repository/account isolation and untouched legacy data. Production deployment checks verify public endpoints and emitted assets; they do not write to a real research library. AI request formatting and citation validation use mocked provider responses; no paid model call is part of the automated suite.

```sh
npm run typecheck
npm test
npm run build
npm audit
```

## License

MIT. Paper text and linked publications remain subject to their original licenses. The generated Paper Palace logo is included with this project.

## Connect GitHub

In **연결 및 설정**, sign in with GitHub and select your private repository. GitHub is the only research storage. Selection loads that repository; edits save automatically after a 1.5-second pause. **지금 동기화** / **GitHub 동기화** and refresh fetch changes from other devices. There is no background polling. JSON import/export remains available for backups and portability after a library loads.

Sign-in never replays old browser libraries or pending login transfers. Settings → **이전 버전 자료 백업** can export the old account or guest library without changing it. Importing that JSON into a connected library is a separate explicit action. Changing repositories first saves pending edits, then loads the new repository without copying the old library. Disconnecting or logging out leaves repository files untouched.

Sync keeps its common baseline only in the open tab. Independent item changes merge automatically; conflicting edits/deletions require choosing a version before saving. Commits are serialized and spaced at least 1.5 seconds apart, with a fresh remote read and SHA check before every write. Deleted items require `deleted` tombstones; simply removing an array entry is not a synchronized deletion. Keep source PDFs and credentials outside the library JSON.

Local folder connections are no longer supported. The app does not restore old directory handles, request filesystem permission, or read/write previously connected folders. Existing files remain intact. To recover data from an old folder, import its `paper-palace/library.json` in Settings after connecting GitHub. An agent can still work on an authorized clone of the data repository; changes reach the web app after pushing to GitHub and refreshing or syncing there.

## Persistent GitHub login

New logins request `offline_access` and use an encrypted, host-only HttpOnly session ticket lasting up to 180 days. The `GITHUB_SESSIONS` SQLite Durable Object binding stores only encrypted GitHub access/refresh tokens and basic user identity, one object per browser login. It automatically rotates tokens before expiry and extends the session lifetime up to the new refresh-token expiry (capped at 180 days). All authenticated requests resolve the server session; foreground checks every 30 minutes and on return renew the browser cookie. Multiple tabs serialize rotation, so they cannot consume a one-use refresh token twice. No paid plan is required; free-tier outages return a retryable error.

Logout deletes the server record as well as the browser cookie. Expiry alarms clean up unused records. Transient network/upstream errors keep the session, library and known AI connection intact; an initial authentication failure pauses loading and retries instead of silently opening/saving a guest library. Revoked/expired refresh tokens require login again. An interrupted upstream refresh after GitHub consumed the token can still require reauthorization; the service cannot recover a token it never received. Existing eight-hour cookies remain valid but require one new login to obtain a refresh token. AI keys remain only in their existing encrypted browser cookies, and research libraries are never written to the session store.
