import {
  emptyLibrary,
  librarySchema,
  type Library,
  type Paper,
  type Edge,
} from "./model";

type Item = Paper | Edge;
type Entry = { item?: Item; deleted?: string };
export type Conflict = {
  id: string;
  title: string;
  local: Entry;
  remote: Entry;
};
export type MergeResult = { library: Library; conflicts: Conflict[] };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const libraryContent = (library: Library) =>
  stable({
    papers: library.papers,
    edges: library.edges,
    deleted: library.deleted,
  });
function entries(library: Library | null) {
  const map = new Map<string, Entry>();
  if (!library) return map;
  for (const item of [...library.papers, ...library.edges])
    map.set(item.id, { item });
  for (const [id, deleted] of Object.entries(library.deleted)) {
    const item = map.get(id)?.item;
    if (!item || deleted >= item.updatedAt) map.set(id, { deleted });
  }
  return map;
}
function equal(a?: Entry, b?: Entry) {
  if (!a || !b) return a === b;
  if (a.deleted || b.deleted) return !!a.deleted === !!b.deleted;
  const omitTime = (item: Item) => {
    const { updatedAt: _time, ...rest } = item;
    return rest;
  };
  return stable(omitTime(a.item!)) === stable(omitTime(b.item!));
}
function put(library: Library, id: string, value: Entry) {
  if (value.deleted) library.deleted[id] = value.deleted;
  else if (value.item && "arxivId" in value.item)
    library.papers.push(value.item);
  else if (value.item) library.edges.push(value.item as Edge);
}
function finish(library: Library): Library {
  const ids = new Set(library.papers.map((p) => p.id));
  library.edges = library.edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target),
  );
  return librarySchema.parse(library);
}

// Missing entries alone are not deletions: agents must preserve explicit tombstones.
// The shared baseline distinguishes one-sided edits from concurrent changes.
export function reconcileLibraries(
  base: Library | null,
  local: Library,
  remote: Library,
): MergeResult {
  const a = entries(local),
    b = entries(remote),
    previous = entries(base);
  const library = emptyLibrary(),
    conflicts: Conflict[] = [];
  library.deleted = { ...local.deleted };
  for (const [id, time] of Object.entries(remote.deleted))
    if (!library.deleted[id] || time > library.deleted[id])
      library.deleted[id] = time;
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id),
      y = b.get(id),
      old = previous.get(id);
    let value: Entry;
    if (!x) value = y!;
    else if (!y) value = x;
    else if (equal(x, y)) {
      const time = (e: Entry) => e.deleted || e.item!.updatedAt;
      value = time(x) >= time(y) ? x : y;
    } else if (base && equal(x, old)) value = y;
    else if (base && equal(y, old)) value = x;
    else {
      const item = x.item || y.item;
      conflicts.push({
        id,
        title:
          item && "title" in item
            ? item.title
            : item && "label" in item
              ? item.label
              : id,
        local: x,
        remote: y,
      });
      value = x;
    }
    // A deliberately restored record supersedes an older deletion marker.
    if (value.item) delete library.deleted[id];
    put(library, id, value);
  }
  // Keep edge candidates until conflict choices have been applied.
  return { library, conflicts };
}

export function resolveMerge(
  result: MergeResult,
  choices: Record<string, "local" | "remote"> = {},
): Library {
  const library: Library = structuredClone(result.library);
  for (const conflict of result.conflicts) {
    if (!choices[conflict.id])
      throw new Error("충돌한 항목의 버전을 모두 선택해 주세요.");
    const selected = conflict[choices[conflict.id]];
    const times = [conflict.local, conflict.remote].map((e) =>
      Date.parse(e.deleted || e.item!.updatedAt),
    );
    const now = new Date(Math.max(Date.now(), ...times) + 1).toISOString();
    library.papers = library.papers.filter((p) => p.id !== conflict.id);
    library.edges = library.edges.filter((e) => e.id !== conflict.id);
    delete library.deleted[conflict.id];
    put(
      library,
      conflict.id,
      selected.deleted
        ? { deleted: now }
        : { item: { ...selected.item!, updatedAt: now } },
    );
  }
  return finish(library);
}
