import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GitHubLibrarySession,
  type LibraryMerge,
  type RemoteLibrary,
} from "../src/lib/github-library";
import { emptyLibrary, type Library, type Paper } from "../src/lib/model";
import { reconcileLibraries, resolveMerge } from "../src/lib/reconcile";
import { loadSource, saveSource } from "../src/lib/storage";
const time = "2026-11-01T00:00:00.000Z";
const paper = (id: string, notes = ""): Paper => ({
  id,
  arxivId: id + "v1",
  title: id,
  authors: [],
  abstract: "",
  published: "2026",
  categories: [],
  tags: [],
  notes,
  status: "unread",
  addedAt: time,
  updatedAt: time,
  analysis: null,
  analysisMeta: null,
});
const library = (...papers: Paper[]): Library => ({
  ...emptyLibrary(),
  papers,
});
const merge: LibraryMerge = async (base, local, remote) =>
  resolveMerge(reconcileLibraries(base, local, remote));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function fixture(
  initial = library(paper("a", "from GitHub")),
  resolver = merge,
) {
  let remote = structuredClone(initial),
    version = 1,
    writes = 0,
    fail = false;
  const session = new GitHubLibrarySession(
    {
      read: async () => ({
        library: structuredClone(remote),
        sha: String(version),
      }),
      write: async (next, sha) => {
        if (fail) throw new Error("GitHub unavailable");
        if (sha !== String(version)) throw new Error("stale SHA");
        remote = structuredClone(next);
        version++;
        writes++;
      },
    },
    resolver,
    "qa/library",
    0,
  );
  return {
    session,
    get remote() {
      return remote;
    },
    get writes() {
      return writes;
    },
    change(next: Library) {
      remote = structuredClone(next);
      version++;
    },
    fail(value: boolean) {
      fail = value;
    },
  };
}
test("opens GitHub directly; no edits or writes before successful load", async () => {
  const f = fixture();
  f.session.update(library(paper("ghost")));
  assert.equal(f.session.getSnapshot().library, null);
  await f.session.open();
  assert.equal(f.session.getSnapshot().library!.papers[0].notes, "from GitHub");
  assert.equal(f.session.getSnapshot().dirty, false);
  await f.session.sync();
  assert.equal(f.writes, 0);
});
test("load failure or malformed data never becomes an empty writable library", async () => {
  let writes = 0;
  for (const read of [
    async () => {
      throw new Error("offline");
    },
    async () =>
      ({ library: { version: 9 }, sha: "x" }) as unknown as RemoteLibrary,
  ]) {
    const session = new GitHubLibrarySession(
      {
        read,
        write: async () => {
          writes++;
        },
      },
      merge,
      "repo",
      0,
    );
    await session.open();
    assert.equal(session.getSnapshot().status, "error");
    assert.equal(session.getSnapshot().library, null);
    session.update(library(paper("bad")));
    await assert.rejects(session.sync());
  }
  assert.equal(writes, 0);
});
test("independent remote and current edits merge before saving; clean repeat does not commit", async () => {
  const f = fixture(library(paper("a"), paper("b")));
  await f.session.open();
  f.session.update((l) => ({
    ...l,
    papers: l.papers.map((p) =>
      p.id === "a" ? { ...p, notes: "tab edit" } : p,
    ),
  }));
  const next = structuredClone(f.remote);
  next.papers[1].notes = "other device";
  f.change(next);
  await f.session.flush();
  assert.deepEqual(
    f.remote.papers.map((p) => p.notes),
    ["tab edit", "other device"],
  );
  assert.equal(f.session.getSnapshot().dirty, false);
  await f.session.sync();
  assert.equal(f.writes, 1);
});
test("a note edit during PUT stays unsaved and is persisted by the next serialized save", async () => {
  let remote = library(paper("a")),
    writes = 0;
  const entered = deferred<void>(),
    finish = deferred<void>();
  const session = new GitHubLibrarySession(
    {
      read: async () => ({
        library: structuredClone(remote),
        sha: String(writes),
      }),
      write: async (next) => {
        if (writes === 0) {
          entered.resolve();
          await finish.promise;
        }
        remote = structuredClone(next);
        writes++;
      },
    },
    merge,
    "repo",
    0,
  );
  await session.open();
  session.update(library(paper("a", "first")));
  const saving = session.sync();
  await entered.promise;
  session.update(library(paper("a", "second")));
  finish.resolve();
  await saving;
  assert.equal(remote.papers[0].notes, "first");
  assert.equal(session.getSnapshot().dirty, true);
  await session.flush();
  assert.equal(remote.papers[0].notes, "second");
  assert.equal(writes, 2);
});
test("failed saves retain the draft, block leaving, and recover without browser persistence", async () => {
  const f = fixture();
  await f.session.open();
  f.session.update(library(paper("a", "unsaved")));
  f.fail(true);
  await assert.rejects(f.session.flush(), /unavailable/);
  assert.equal(f.session.getSnapshot().status, "error");
  assert.equal(f.session.getSnapshot().dirty, true);
  assert.equal(f.remote.papers[0].notes, "from GitHub");
  f.session.update(library(paper("a", "newer draft")));
  assert.equal(f.session.getSnapshot().status, "error");
  f.fail(false);
  await f.session.flush();
  assert.equal(f.remote.papers[0].notes, "newer draft");
  assert.equal(f.session.getSnapshot().dirty, false);
});
test("concurrent edits require review and cancellation leaves GitHub untouched", async () => {
  const f = fixture();
  await f.session.open();
  f.session.update(library(paper("a", "tab")));
  f.change(library(paper("a", "GitHub")));
  await assert.rejects(f.session.sync(), /선택/);
  assert.equal(f.writes, 0);
  assert.equal(f.session.getSnapshot().library!.papers[0].notes, "tab");
  assert.equal(f.session.getSnapshot().dirty, true);
  const g = fixture(library(paper("a")), async (base, local, remote) =>
    resolveMerge(reconcileLibraries(base, local, remote), { a: "remote" }),
  );
  await g.session.open();
  g.session.update(library(paper("a", "tab")));
  g.change(library(paper("a", "GitHub")));
  await g.session.sync();
  assert.equal(g.session.getSnapshot().library!.papers[0].notes, "GitHub");
  assert.equal(g.session.getSnapshot().dirty, false);
});
test("closed repository sessions reject late load results and AI updates", async () => {
  const waiting = deferred<RemoteLibrary>();
  let writes = 0;
  const old = new GitHubLibrarySession(
    {
      read: () => waiting.promise,
      write: async () => {
        writes++;
      },
    },
    merge,
    "old",
    0,
  );
  const loading = old.open();
  old.close();
  waiting.resolve({ library: library(paper("old")), sha: "old" });
  await loading;
  assert.equal(old.getSnapshot().library, null);
  old.update(library(paper("late AI")));
  assert.equal(writes, 0);
  const next = fixture(library(paper("new")));
  await next.session.open();
  assert.equal(next.session.getSnapshot().library!.papers[0].id, "new");
  next.session.close();
  next.session.update(library(paper("late result")));
  assert.equal(next.session.getSnapshot().library!.papers[0].id, "new");
});
test("edits during conflict review survive before writing the reviewed result", async () => {
  const entered = deferred<void>(),
    finish = deferred<void>();
  let count = 0;
  const f = fixture(
    library(paper("a"), paper("b")),
    async (base, local, remote) => {
      count++;
      if (count === 1) {
        entered.resolve();
        await finish.promise;
      }
      return resolveMerge(reconcileLibraries(base, local, remote), {
        a: "local",
      });
    },
  );
  await f.session.open();
  f.session.update(library(paper("a", "tab"), paper("b")));
  f.change(library(paper("a", "remote"), paper("b")));
  const saving = f.session.sync();
  await entered.promise;
  f.session.update(library(paper("a", "tab"), paper("b", "during review")));
  finish.resolve();
  await saving;
  assert.deepEqual(
    f.remote.papers.map((p) => p.notes),
    ["tab", "during review"],
  );
});
test("paper sources use a bounded memory cache without touching IndexedDB", async () => {
  for (let i = 0; i < 4; i++)
    await saveSource({
      arxivId: `qa-${i}`,
      hash: "x",
      format: "html",
      blocks: [],
    });
  assert.equal(await loadSource("qa-0"), undefined);
  assert.equal((await loadSource("qa-3"))!.arxivId, "qa-3");
});
test("a changed SHA after read preserves both writers on explicit retry", async () => {
  let remote = library(paper("a"), paper("b")),
    version = 1,
    attempts = 0;
  const session = new GitHubLibrarySession(
    {
      read: async () => ({
        library: structuredClone(remote),
        sha: String(version),
      }),
      write: async (next, sha) => {
        attempts++;
        if (attempts === 1) {
          remote.papers[1].notes = "other writer";
          version++;
        }
        if (sha !== String(version)) throw new Error("stale SHA");
        remote = structuredClone(next);
        version++;
      },
    },
    merge,
    "repo",
    0,
  );
  await session.open();
  session.update(library(paper("a", "tab draft"), paper("b")));
  await assert.rejects(session.sync(), /stale SHA/);
  assert.equal(session.getSnapshot().dirty, true);
  await session.flush();
  assert.deepEqual(
    remote.papers.map((p) => p.notes),
    ["tab draft", "other writer"],
  );
  session.close();
  const reopened = new GitHubLibrarySession(
    {
      read: async () => ({ library: remote, sha: String(version) }),
      write: async () => {
        throw new Error("reload should not write");
      },
    },
    merge,
    "repo",
    0,
  );
  await reopened.open();
  assert.deepEqual(
    reopened.getSnapshot().library!.papers.map((p) => p.notes),
    ["tab draft", "other writer"],
  );
  assert.equal(reopened.getSnapshot().dirty, false);
});
test("a new repository stays unwritten until its first edit, then creates the library with a null SHA", async () => {
  let remote: Library | null = null;
  let writes = 0;
  const session = new GitHubLibrarySession(
    {
      read: async () => ({ library: remote, sha: remote ? "created" : null }),
      write: async (next, sha) => {
        assert.equal(sha, null);
        remote = next;
        writes++;
      },
    },
    merge,
    "new/repo",
    0,
  );
  await session.open();
  assert.equal(session.getSnapshot().library!.papers.length, 0);
  await session.sync();
  assert.equal(writes, 0);
  session.update(library(paper("first")));
  await session.flush();
  assert.equal(writes, 1);
  assert.equal(session.getSnapshot().library!.papers[0].id, "first");
  assert.equal(session.getSnapshot().dirty, false);
});
