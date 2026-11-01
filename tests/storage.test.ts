import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary, type Library, type Paper } from "../src/lib/model";
import {
  libraryContent,
  reconcileLibraries,
  resolveMerge,
} from "../src/lib/reconcile";

const t = "2026-10-29T00:00:00.000Z";
const paper = (id: string, notes = ""): Paper => ({
  id,
  arxivId: id + "v1",
  title: `Paper ${id}`,
  authors: [],
  abstract: "Research",
  published: "2026",
  categories: [],
  addedAt: t,
  updatedAt: t,
  status: "unread",
  tags: [],
  notes,
  analysis: null,
  analysisMeta: null,
});
const library = (...papers: Paper[]): Library => ({
  ...emptyLibrary(),
  papers,
});
test("explicit imported library merges both papers and graph, then retains tab edits", () => {
  const local = library(paper("1706.03762")),
    remote = library(paper("2106.09685"));
  remote.edges = [
    {
      id: "edge",
      source: "1706.03762",
      target: "2106.09685",
      label: "related to",
      note: "connection",
      origin: "manual",
      updatedAt: t,
    },
  ];
  const connected = resolveMerge(reconcileLibraries(null, local, remote));
  assert.equal(connected.papers.length, 2);
  assert.equal(connected.edges.length, 1);
  const updated = structuredClone(connected);
  updated.papers[0].notes = "local edit";
  const next = resolveMerge(reconcileLibraries(connected, updated, connected));
  assert.equal(next.papers[0].notes, "local edit");
});

test("one-sided agent edits are detected even when the timestamp was not updated", () => {
  const base = library(paper("1"));
  const agent = library(paper("1", "agent notes"));
  const result = reconcileLibraries(base, base, agent);
  assert.equal(result.conflicts.length, 0);
  assert.equal(resolveMerge(result).papers[0].notes, "agent notes");
});

test("concurrent changes require an explicit choice, including first attachment and equal timestamps", () => {
  const base = library(paper("1"));
  const local = library(paper("1", "local version"));
  const remote = library(paper("1", "remote version"));
  for (const baseline of [base, null]) {
    const result = reconcileLibraries(baseline, local, remote);
    assert.equal(result.conflicts.length, 1);
    assert.throws(() => resolveMerge(result), /선택/);
    assert.equal(
      resolveMerge(result, { "1": "remote" }).papers[0].notes,
      "remote version",
    );
    assert.equal(
      resolveMerge(result, { "1": "local" }).papers[0].notes,
      "local version",
    );
  }
  assert.equal(base.papers[0].notes, "");
});

test("delete vs edit conflict can retain either version; one-sided deletion removes dangling links", () => {
  const base = library(paper("1"), paper("2"));
  base.edges = [
    {
      id: "edge",
      source: "1",
      target: "2",
      label: "related",
      note: "",
      origin: "manual",
      updatedAt: t,
    },
  ];
  const removed = {
    ...base,
    papers: [base.papers[1]],
    deleted: { "1": "2026-10-29T01:00:00.000Z" },
  };
  const edited = structuredClone(base);
  edited.papers[0].notes = "changed";
  const conflict = reconcileLibraries(base, edited, removed);
  assert.equal(conflict.conflicts.length, 1);
  const restored = resolveMerge(conflict, { "1": "local" });
  assert.equal(restored.papers.length, 2);
  assert.equal(restored.deleted["1"], undefined);
  const deleted = resolveMerge(conflict, { "1": "remote" });
  assert.equal(deleted.papers.length, 1);
  assert.equal(deleted.edges.length, 0);
  assert.equal(
    resolveMerge(reconcileLibraries(base, base, removed)).papers.length,
    1,
  );
});

test("a timestamp-only change does not trigger a conflict and a second sync is idempotent", () => {
  const base = library(paper("1"));
  const remote = structuredClone(base);
  remote.papers[0].updatedAt = "2026-10-29T01:00:00.000Z";
  const result = reconcileLibraries(null, base, remote);
  assert.equal(result.conflicts.length, 0);
  const merged = resolveMerge(result);
  assert.equal(
    libraryContent(resolveMerge(reconcileLibraries(merged, merged, remote))),
    libraryContent(merged),
  );
});
