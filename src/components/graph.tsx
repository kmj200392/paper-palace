"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2, ArrowUpRight, Network } from "lucide-react";
import type { Paper, Edge } from "@/lib/model";
import { zoomGraphAt, type GraphViewport, type Point } from "@/lib/graph-viewport";
export function Graph({
  papers,
  edges,
  onSelect,
}: {
  papers: Paper[];
  edges: Edge[];
  onSelect: (id: string) => void;
}) {
  const [viewport, setViewport] = useState<GraphViewport>({
      scale: 1,
      pan: { x: 0, y: 0 },
    }),
    [positions, setPositions] = useState<Record<string, Point>>({});
  const { scale, pan } = viewport;
  const arrowId = useId();
  const hasPapers = papers.length > 0;
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    start: Point;
    hasMoved: boolean;
  } | null>(null);
  const layout = useMemo(
    () =>
      Object.fromEntries(
        papers.map((p, i) => {
          const angle =
            (i * Math.PI * 2) / Math.max(papers.length, 1) - Math.PI / 2;
          const ring =
            papers.length === 1
              ? 0
              : papers.length < 6
                ? 180
                : 240 + Math.floor(i / 12) * 110;
          return [
            p.id,
            positions[p.id] || {
              x: 440 + Math.cos(angle) * ring,
              y: 310 + Math.sin(angle) * ring * 0.8,
            },
          ];
        }),
      ),
    [papers, positions],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const fitView = useCallback(() => {
    const element = canvas.current;
    const points = Object.values(layoutRef.current);
    if (!element || !points.length) return;
    const left = Math.min(...points.map((p) => p.x));
    const right = Math.max(...points.map((p) => p.x));
    const top = Math.min(...points.map((p) => p.y));
    const bottom = Math.max(...points.map((p) => p.y));
    const nextScale = Math.max(
      0.15,
      Math.min(
        1,
        (element.clientWidth - 40) / (right - left + 220),
        (element.clientHeight - 100) / (bottom - top + 150),
      ),
    );
    setViewport({
      scale: nextScale,
      pan: {
        x: (440 - (left + right) / 2) * nextScale,
        y: (310 - (top + bottom) / 2) * nextScale - 20,
      },
    });
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(fitView);
    observer.observe(element);
    fitView();
    return () => observer.disconnect();
  }, [papers.length, fitView]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      // Trackpad pinches arrive as Ctrl+wheel. React wheel listeners are
      // passive, so use a native listener scoped to this board to stop page zoom.
      event.preventDefault();
      if (!event.deltaY) return;
      const rect = element.getBoundingClientRect();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      const delta = Math.max(-200, Math.min(200, event.deltaY * unit));
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002));
      const anchor = {
        x:
          event.clientX - rect.left - element.clientLeft - element.clientWidth / 2,
        y:
          event.clientY - rect.top - element.clientTop - element.clientHeight / 2,
      };
      setViewport((v) => zoomGraphAt(v, v.scale * factor, anchor));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [hasPapers]);
  if (!papers.length)
    return (
      <div className="empty-state graph-empty">
        <Network size={35} />
        <h2>첫 논문에서 시작되는 지도.</h2>
        <p>
          라이브러리에 논문을 더하면 이곳에 나타나요.
          <br />두 논문을 연결해 나만의 관점을 남겨 보세요.
        </p>
      </div>
    );
  return (
    <div
      ref={canvas}
      className="graph-canvas"
      role="region"
      aria-label="지식 지도 · 휠 또는 핀치로 확대·축소"
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x) / scale,
          dy = (e.clientY - d.y) / scale;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.hasMoved = true;
        if (d.id === "canvas")
          setViewport((v) => ({
            ...v,
            pan: { x: d.start.x + dx * scale, y: d.start.y + dy * scale },
          }));
        else
          setPositions((p) => ({
            ...p,
            [d.id]: { x: d.start.x + dx, y: d.start.y + dy },
          }));
      }}
      onPointerUp={() => {
        const d = drag.current;
        if (d && d.id !== "canvas" && !d.hasMoved) onSelect(d.id);
        drag.current = null;
      }}
      onPointerCancel={() => (drag.current = null)}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            id: "canvas",
            x: e.clientX,
            y: e.clientY,
            start: pan,
            hasMoved: false,
          };
        }
      }}
    >
      <div
        className="graph-world"
        style={{
          transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`,
        }}
      >
        <svg viewBox="0 0 880 620" className="graph-edges" aria-hidden="true">
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 12 12"
              refX="6"
              refY="6"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path className="graph-arrow" d="M 1 1 L 11 6 L 1 11 L 4 6 Z" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = layout[e.source],
              b = layout[e.target];
            if (!a || !b) return null;
            // Opposite directions bend to opposite sides. Split the curve so
            // marker-mid stays between cards and follows source → target.
            const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const control = {
              x: (a.x + b.x) / 2 - ((b.y - a.y) / distance) * 54,
              y: (a.y + b.y) / 2 + ((b.x - a.x) / distance) * 54,
            };
            const middle = {
              x: (a.x + 2 * control.x + b.x) / 4,
              y: (a.y + 2 * control.y + b.y) / 4,
            };
            return (
              <g key={e.id}>
                <path
                  d={`M ${a.x} ${a.y} Q ${(a.x + control.x) / 2} ${(a.y + control.y) / 2} ${middle.x} ${middle.y} Q ${(control.x + b.x) / 2} ${(control.y + b.y) / 2} ${b.x} ${b.y}`}
                  markerMid={`url(#${arrowId})`}
                  strokeDasharray={e.origin === "suggested" ? "5 5" : undefined}
                />
                <text
                  x={middle.x}
                  y={middle.y - 13}
                  textAnchor="middle"
                >
                  {e.label}
                </text>
              </g>
            );
          })}
        </svg>
        {papers.map((p) => (
          <button
            key={p.id}
            className={`graph-node ${p.status === "read" ? "is-read" : ""}`}
            style={{ left: layout[p.id].x, top: layout[p.id].y }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                id: p.id,
                x: e.clientX,
                y: e.clientY,
                start: layout[p.id],
                hasMoved: false,
              };
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(p.id);
            }}
          >
            <span>{p.tags[0] || p.published.slice(0, 4) || "PAPER"}</span>
            <strong>{p.title}</strong>
            <small>
              {p.authors[0] || "arXiv"} <ArrowUpRight size={12} />
            </small>
          </button>
        ))}
      </div>
      <div className="graph-legend">
        <i /> 나의 논문
        <span>화살표는 연결 방향 · 드래그로 배치 · 휠/핀치로 확대</span>
      </div>
      <div className="graph-controls">
        <button
          className="icon-button"
          aria-label="축소"
          onClick={() =>
            setViewport((v) => zoomGraphAt(v, v.scale - 0.15, { x: 0, y: 0 }))
          }
        >
          <Minus size={17} />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          className="icon-button"
          aria-label="확대"
          onClick={() =>
            setViewport((v) => zoomGraphAt(v, v.scale + 0.15, { x: 0, y: 0 }))
          }
        >
          <Plus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="전체 지도 보기"
          onClick={fitView}
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
}
