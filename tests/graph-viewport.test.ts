import { test } from "node:test";
import assert from "node:assert/strict";
import {
  zoomGraphAt,
  type GraphViewport,
  type Point,
} from "../src/lib/graph-viewport";

const worldPoint = (v: GraphViewport, p: Point) => ({
  x: (p.x - v.pan.x) / v.scale,
  y: (p.y - v.pan.y) / v.scale,
});
test("zoom keeps the world point beneath the cursor fixed after panning", () => {
  const before = { scale: 0.8, pan: { x: 80, y: -30 } };
  const anchor = { x: -120, y: 150 };
  const after = zoomGraphAt(before, 1.6, anchor);
  assert.deepEqual(worldPoint(after, anchor), worldPoint(before, anchor));
  assert.deepEqual(zoomGraphAt(after, 0.8, anchor), before);
});
test("zoom limits preserve the anchor and do not drift at either bound", () => {
  const initial = { scale: 1, pan: { x: 25, y: -70 } };
  const anchor = { x: 125, y: 80 };
  for (const [requested, expected] of [
    [10, 2],
    [0.001, 0.15],
  ]) {
    const result = zoomGraphAt(initial, requested, anchor);
    assert.equal(result.scale, expected);
    assert.deepEqual(worldPoint(result, anchor), worldPoint(initial, anchor));
    assert.deepEqual(zoomGraphAt(result, requested, anchor), result);
  }
});
