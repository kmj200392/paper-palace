import type { Point } from "./graph-viewport";

export type GraphNodeBounds = Point & { width: number; height: number };

const at = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
});

function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-8) return Math.abs(b) < 1e-8 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const d = Math.sqrt(discriminant);
  return [(-b - d) / (2 * a), (-b + d) / (2 * a)];
}

function boundaryTimes(a: Point, c: Point, b: Point, node: GraphNodeBounds) {
  // Leave one pixel for the card border, with the arrow tip at the path end.
  const half = { x: node.width / 2 + 1, y: node.height / 2 + 1 };
  const times: number[] = [];
  for (const axis of ["x", "y"] as const) {
    const other = axis === "x" ? "y" : "x";
    for (const sign of [-1, 1]) {
      for (const t of roots(
        a[axis] - 2 * c[axis] + b[axis],
        2 * (c[axis] - a[axis]),
        a[axis] - node[axis] - sign * half[axis],
      )) {
        if (t <= 0 || t >= 1) continue;
        const p = at(a, c, b, t);
        if (Math.abs(p[other] - node[other]) <= half[other] + 1e-7)
          times.push(t);
      }
    }
  }
  return times;
}

export function directedEdge(source: GraphNodeBounds, target: GraphNodeBounds) {
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  if (!distance) return null;
  // Reciprocal links curve to opposite sides instead of sharing an arrow.
  const control = {
    x: (source.x + target.x) / 2 - ((target.y - source.y) / distance) * 54,
    y: (source.y + target.y) / 2 + ((target.x - source.x) / distance) * 54,
  };
  const from = Math.min(...boundaryTimes(source, control, target, source));
  const to = Math.max(...boundaryTimes(source, control, target, target));
  // Overlapping cards may leave no visible segment. Avoid an arrow inside a card.
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
    return null;
  const start = at(source, control, target, from);
  const end = at(source, control, target, to);
  const trimmedControl = {
    x:
      start.x +
      (to - from) *
        ((1 - from) * (control.x - source.x) + from * (target.x - control.x)),
    y:
      start.y +
      (to - from) *
        ((1 - from) * (control.y - source.y) + from * (target.y - control.y)),
  };
  return {
    start,
    end,
    label: at(source, control, target, (from + to) / 2),
    path: `M ${start.x} ${start.y} Q ${trimmedControl.x} ${trimmedControl.y} ${end.x} ${end.y}`,
  };
}
