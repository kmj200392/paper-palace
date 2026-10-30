"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Minus, Plus, Expand, Minimize2, Scan, ArrowUpRight, Network,
} from "lucide-react";
import type { Paper, Edge } from "@/lib/model";
import { zoomGraphAt, type GraphViewport, type Point } from "@/lib/graph-viewport";
import { directedEdge } from "@/lib/graph-edge";
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
    [positions, setPositions] = useState<Record<string, Point>>({}),
    [nodeSizes, setNodeSizes] = useState<
      Record<string, { width: number; height: number }>
    >({}),
    [expanded, setExpanded] = useState(false),
    [placeholderHeight, setPlaceholderHeight] = useState(0);
  const { scale, pan } = viewport;
  const arrowId = useId();
  const hasPapers = papers.length > 0;
  const canvas = useRef<HTMLDivElement>(null);
  const nodeElements = useRef(new Map<string, HTMLButtonElement>());
  const expandButton = useRef<HTMLButtonElement>(null);
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
    const observer = new ResizeObserver((entries) => {
      setNodeSizes((previous) => {
        const next = { ...previous };
        let changed = false;
        for (const entry of entries) {
          const element = entry.target as HTMLButtonElement;
          const id = element.dataset.paperId!;
          const size = entry.borderBoxSize[0];
          const width = size?.inlineSize ?? element.offsetWidth;
          const height = size?.blockSize ?? element.offsetHeight;
          if (next[id]?.width !== width || next[id]?.height !== height) {
            next[id] = { width, height };
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    });
    nodeElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [papers]);
  useEffect(() => {
    if (!expanded || !hasPapers) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = expandButton.current;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      } else if (event.key === "Tab") {
        const buttons = canvas.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [expanded, hasPapers]);
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
    <div style={{ height: expanded ? placeholderHeight : undefined }}>
      <div
        ref={canvas}
        className={`graph-canvas${expanded ? " is-expanded" : ""}`}
        role={expanded ? "dialog" : "region"}
        aria-modal={expanded || undefined}
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
                refX="11"
                refY="6"
                markerWidth="12"
                markerHeight="12"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path className="graph-arrow" d="M 1 1 L 11 6 L 1 11 Z" />
              </marker>
            </defs>
            {edges.map((e) => {
              const a = layout[e.source],
                b = layout[e.target];
              if (!a || !b || !nodeSizes[e.source] || !nodeSizes[e.target])
                return null;
              const curve = directedEdge(
                { ...a, ...nodeSizes[e.source] },
                { ...b, ...nodeSizes[e.target] },
              );
              if (!curve) return null;
              return (
                <g key={e.id} data-source={e.source} data-target={e.target}>
                  <path
                    d={curve.path}
                    markerEnd={`url(#${arrowId})`}
                    strokeDasharray={e.origin === "suggested" ? "5 5" : undefined}
                  />
                  <text
                    x={curve.label.x}
                    y={curve.label.y - 13}
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
              ref={(element) => {
                if (element) nodeElements.current.set(p.id, element);
                else nodeElements.current.delete(p.id);
              }}
              data-paper-id={p.id}
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
        <div className="graph-viewbar">
          {expanded && <kbd>Esc</kbd>}
          <button
            ref={expandButton}
            className="button small"
            aria-pressed={expanded}
            onClick={() => {
              if (!expanded)
                setPlaceholderHeight(canvas.current?.getBoundingClientRect().height || 590);
              setExpanded((value) => !value);
            }}
          >
            {expanded ? <Minimize2 size={16} /> : <Expand size={16} />}
            {expanded ? "원래 화면으로" : "보드 크게 보기"}
          </button>
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
            aria-label="전체 지도 맞추기"
            title="전체 지도 맞추기"
            onClick={fitView}
          >
            <Scan size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
