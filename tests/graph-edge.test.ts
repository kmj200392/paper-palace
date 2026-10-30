import { test } from "node:test";
import assert from "node:assert/strict";
import { directedEdge, type GraphNodeBounds } from "../src/lib/graph-edge";
import type { Point } from "../src/lib/graph-viewport";

function onBoundary(p: Point, node: GraphNodeBounds) {
  const x = Math.abs(p.x - node.x),
    y = Math.abs(p.y - node.y);
  const width = node.width / 2 + 1,
    height = node.height / 2 + 1;
  assert.ok(x <= width + 1e-6 && y <= height + 1e-6);
  assert.ok(Math.abs(x - width) < 1e-6 || Math.abs(y - height) < 1e-6);
}

test("arrows terminate at measured target boundaries in every direction", () => {
  const source = { x: 440, y: 310, width: 187, height: 120.125 };
  for (const [dx, dy] of [
    [350, 0],
    [-350, 0],
    [0, 300],
    [0, -300],
    [250, 200],
    [-250, 200],
    [250, -200],
    [-250, -200],
  ]) {
    for (const [width, height] of [
      [187, 142.5],
      [150, 105],
      [240, 180],
      [88, 44],
    ]) {
      const target = { x: source.x + dx, y: source.y + dy, width, height };
      const curve = directedEdge(source, target);
      assert.ok(curve);
      onBoundary(curve.start, source);
      onBoundary(curve.end, target);
      assert.ok(!curve.path.includes("NaN"));
    }
  }
});

test("moving and resizing a card moves the arrow tip; reciprocal links stay separate", () => {
  const a = { x: 0, y: 0, width: 187, height: 120 };
  const b = { x: 340, y: 220, width: 150, height: 105 };
  const forward = directedEdge(a, b)!;
  const reverse = directedEdge(b, a)!;
  onBoundary(reverse.end, a);
  assert.notDeepEqual(forward.label, reverse.label);
  const moved = { ...b, x: 420, height: 160 };
  const after = directedEdge(a, moved)!;
  assert.notDeepEqual(forward.end, after.end);
  onBoundary(after.end, moved);
});

test("coincident or overlapping nodes do not produce an arrow inside a card", () => {
  const node = { x: 100, y: 100, width: 187, height: 120 };
  assert.equal(directedEdge(node, node), null);
  assert.equal(directedEdge(node, { ...node, x: 105 }), null);
});
