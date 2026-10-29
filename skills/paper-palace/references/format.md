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
