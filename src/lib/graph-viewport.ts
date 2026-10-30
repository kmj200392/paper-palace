export type Point = { x: number; y: number };
export type GraphViewport = { scale: number; pan: Point };

export function zoomGraphAt(
  viewport: GraphViewport,
  requestedScale: number,
  anchor: Point,
): GraphViewport {
  const scale = Math.max(0.15, Math.min(2, requestedScale));
  const ratio = scale / viewport.scale;
  return {
    scale,
    pan: {
      x: anchor.x - (anchor.x - viewport.pan.x) * ratio,
      y: anchor.y - (anchor.y - viewport.pan.y) * ratio,
    },
  };
}
