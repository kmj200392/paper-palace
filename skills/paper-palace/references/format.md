# Library format v1

The web app imports and exports this JSON object:

```json
{
  "version": 1,
  "papers": [],
  "edges": [],
  "deleted": {},
  "updatedAt": "2026-10-29T00:00:00.000Z"
}
```

Each paper has these required fields:
- `id`: arXiv ID without a version, e.g. `1706.03762`.
- `arxivId`: exact version, e.g. `1706.03762v7`.
- `title`, `abstract`, `published` (source date string); `authors`, `categories`: arrays of strings.
- `addedAt`, `updatedAt`: UTC ISO datetimes.
- `status`: `unread`, `reading`, or `read`.
- `tags`: up to 30 short strings. `notes`: user notes, up to 30000 characters.
- `analysis`: null, or an object with `positioning`, `tags`, `limitations` and `sections`.
- `analysisMeta`: null for agent-generated imported notes. For web-generated notes: `{provider, model, createdAt, sourceHash, coverage}`.

`analysis.sections` contains all five arrays: `motivation`, `coreConcept`, `method`, `experimentalSetup`, `results`. Each has at most 6 points in the shape `{ "text": "...", "citations": [] }`. Point text is at most 2400 characters. Only if the web reader's actual source blocks are supplied, each citation is `{ "blockId": "b12", "quote": "exact contiguous original passage" }`. Quotes must match that block after Unicode/whitespace normalization. Never synthesize matching text.

An edge is `{id, source, target, label, note, origin, updatedAt}`. Use a UUID as id. Endpoints must be paper ids in this library. `origin` is `manual` for user-reviewed connections or `suggested` for proposals. `label` names a directed relationship, e.g. `builds on`; `note` explains it. Web display shows suggested edges dashed.

`deleted` maps deleted item IDs to UTC deletion times. Preserve these tombstones when merging. Merge per item ID by `updatedAt`; a newer tombstone wins over older content. Never reuse a deleted ID with an older timestamp.

No credentials, authentication tokens, source HTML or PDF bytes belong in this file. Keep the file under 3MB for web/GitHub sync. Canonical full validation is `librarySchema` in the app repository.

## Connected local folder

The web app uses `<chosen-folder>/paper-palace/library.json`, the same relative path as the GitHub data repository. If authorized to update this source, read it immediately before editing, preserve other records and tombstones, and update each changed item's `updatedAt`. Write a validated complete JSON document (prefer an atomic file replacement). To delete a paper or edge, add its ID and current UTC time to `deleted`; removing an array entry alone is not a synchronized deletion. Never modify `.git`, credentials, or unrelated files as part of library editing.

The open web app checks the folder on focus and periodically; users can also press “폴더 다시 동기화”. Its connection baseline detects concurrent edits and asks the user which version to keep. GitHub sync remains an explicit user action. Browser permission or a closed tab can pause local sync; do not claim the web UI or remote repository updated merely because a local file write succeeded.
