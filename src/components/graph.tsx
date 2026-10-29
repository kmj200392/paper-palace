"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2, ArrowUpRight, Network } from "lucide-react";
import type { Paper, Edge } from "@/lib/model";
type Point = { x: number; y: number };
export function Graph({
  papers,
  edges,
  onSelect,
}: {
  papers: Paper[];
  edges: Edge[];
  onSelect: (id: string) => void;
}) {
  const [scale, setScale] = useState(1),
    [positions, setPositions] = useState<Record<string, Point>>({}),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 });
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
    setScale(nextScale);
    setPan({
      x: (440 - (left + right) / 2) * nextScale,
      y: (310 - (top + bottom) / 2) * nextScale - 20,
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
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x) / scale,
          dy = (e.clientY - d.y) / scale;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.hasMoved = true;
        if (d.id === "canvas")
          setPan({ x: d.start.x + dx * scale, y: d.start.y + dy * scale });
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
          {edges.map((e) => {
            const a = layout[e.source],
              b = layout[e.target];
            if (!a || !b) return null;
            return (
              <g key={e.id}>
                <path
                  d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 + 30} ${(a.y + b.y) / 2 - 45} ${b.x} ${b.y}`}
                  strokeDasharray={e.origin === "suggested" ? "5 5" : undefined}
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 15}
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
        <i /> 나의 논문 <span>노드를 누르면 읽기 · 드래그로 배치</span>
      </div>
      <div className="graph-controls">
        <button
          className="icon-button"
          aria-label="축소"
          onClick={() => setScale((s) => Math.max(0.15, s - 0.15))}
        >
          <Minus size={17} />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          className="icon-button"
          aria-label="확대"
          onClick={() => setScale((s) => Math.min(2, s + 0.15))}
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
