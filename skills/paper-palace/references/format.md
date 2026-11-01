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

## Connected GitHub repository

The web app syncs `paper-palace/library.json` in the selected private GitHub repository. If authorized to update this source (or its local clone), read the latest revision immediately before editing, preserve other records and tombstones, and update each changed item's `updatedAt`. Write a validated complete JSON document. To delete a paper or edge, add its ID and current UTC time to `deleted`; removing an array entry alone is not a synchronized deletion. Never modify `.git`, credentials, or unrelated files as part of library editing.

GitHub sync remains an explicit user action. The web app keeps a common baseline and asks the user which version to keep when both sides edited the same item. Local clones are not connected directly to the web app: a local file edit must be pushed to the authorized repository before the user syncs in Paper Palace. Do not claim the web UI or remote repository updated merely because a local file write succeeded. JSON import remains available for files from earlier folder connections.
