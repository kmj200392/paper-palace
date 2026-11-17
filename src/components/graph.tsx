"use client";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Minus,
  Plus,
  Expand,
  Minimize2,
  Scan,
  Network,
  Landmark,
  Tags,
  BookOpen,
} from "lucide-react";
import type { Paper, Edge } from "@/lib/model";
import {
  zoomGraphAt,
  type GraphViewport,
  type Point,
} from "@/lib/graph-viewport";
import { directedEdge } from "@/lib/graph-edge";
import { graphPaperLabel } from "@/lib/paper-labels";
import { PalaceCourtyard, PaperPortal } from "./palace-architecture";
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
      Record<
        string,
        { width: number; height: number; offsetX: number; offsetY: number }
      >
    >({}),
    [expanded, setExpanded] = useState(false),
    [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [palace, setPalace] = useState(true);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const { scale, pan } = viewport;
  const related = useMemo(() => {
    const ids = new Set<string>();
    if (activeNode) {
      ids.add(activeNode);
      edges.forEach((edge) => {
        if (edge.source === activeNode) ids.add(edge.target);
        if (edge.target === activeNode) ids.add(edge.source);
      });
    }
    return ids;
  }, [activeNode, edges]);
  const activePaper = papers.find((paper) => paper.id === activeNode);
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
          const ringIndex = Math.floor(i / 8);
          const slots = Math.min(8, papers.length - ringIndex * 8);
          const angle =
            ((i % 8) * Math.PI * 2) / Math.max(slots, 1) -
            Math.PI / 2 +
            ringIndex * (Math.PI / 8);
          const ring =
            papers.length === 1
              ? 0
              : papers.length < 6
                ? 180
                : 260 + ringIndex * 220;
          return [
            p.id,
            positions[p.id] || {
              x: 440 + Math.cos(angle) * ring,
              y: 345 + Math.sin(angle) * ring * 0.8,
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
    const left = Math.min(
      ...points.map((p) => p.x - 85),
      ...(palace ? [60] : []),
    );
    const right = Math.max(
      ...points.map((p) => p.x + 85),
      ...(palace ? [820] : []),
    );
    const top = Math.min(
      ...points.map((p) => p.y - 65),
      ...(palace ? [20] : []),
    );
    const bottom = Math.max(
      ...points.map((p) => p.y + 65),
      ...(palace ? [625] : []),
    );
    const nextScale = Math.max(
      0.15,
      Math.min(
        1,
        (element.clientWidth - 32) / (right - left),
        (element.clientHeight - 125) / (bottom - top),
      ),
    );
    setViewport({
      scale: nextScale,
      pan: {
        x: (440 - (left + right) / 2) * nextScale,
        y: (310 - (top + bottom) / 2) * nextScale - 20,
      },
    });
  }, [palace]);
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
          const label = palace ? element.querySelector("strong") : null;
          // The palace illustration has a transparent hit area. Connect to the
          // visible nameplate; flat mode still connects to the full card edge.
          const size = entry.borderBoxSize[0];
          const width =
            label?.offsetWidth ?? size?.inlineSize ?? element.offsetWidth;
          const height =
            label?.offsetHeight ?? size?.blockSize ?? element.offsetHeight;
          const offsetX = label
            ? label.offsetLeft + width / 2 - element.offsetWidth / 2
            : 0;
          const offsetY = label
            ? label.offsetTop + height / 2 - element.offsetHeight / 2
            : 0;
          if (
            next[id]?.width !== width ||
            next[id]?.height !== height ||
            next[id]?.offsetX !== offsetX ||
            next[id]?.offsetY !== offsetY
          ) {
            next[id] = { width, height, offsetX, offsetY };
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    });
    nodeElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [papers, palace]);
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
          event.clientX -
          rect.left -
          element.clientLeft -
          element.clientWidth / 2,
        y:
          event.clientY -
          rect.top -
          element.clientTop -
          element.clientHeight / 2,
      };
      setViewport((v) => zoomGraphAt(v, v.scale * factor, anchor));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [hasPapers]);
  if (!papers.length)
    return (
      <div className="empty-state graph-empty">
        <PaperPortal />
        <h2>첫 논문이 궁전의 첫 방이 됩니다.</h2>
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
        className={`graph-canvas${expanded ? " is-expanded" : ""}${palace ? " is-palace" : " is-map"}${activeNode ? " has-active-node" : ""}`}
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
          style={
            {
              transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`,
              "--graph-label-size": `${Math.min(30, Math.max(16, 11 / scale))}px`,
            } as CSSProperties
          }
        >
          <PalaceCourtyard className="graph-architecture" />
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
                {
                  ...nodeSizes[e.source],
                  x: a.x + nodeSizes[e.source].offsetX,
                  y: a.y + nodeSizes[e.source].offsetY,
                },
                {
                  ...nodeSizes[e.target],
                  x: b.x + nodeSizes[e.target].offsetX,
                  y: b.y + nodeSizes[e.target].offsetY,
                },
              );
              if (!curve) return null;
              return (
                <g
                  key={e.id}
                  data-source={e.source}
                  data-target={e.target}
                  className={
                    activeNode &&
                    e.source !== activeNode &&
                    e.target !== activeNode
                      ? "is-muted"
                      : "is-connected"
                  }
                >
                  <path
                    d={curve.path}
                    markerEnd={`url(#${arrowId})`}
                    strokeDasharray={
                      e.origin === "suggested" ? "5 5" : undefined
                    }
                  />
                  {(showLabels ||
                    e.source === activeNode ||
                    e.target === activeNode) && (
                    <text
                      x={curve.label.x}
                      y={curve.label.y - 13}
                      textAnchor="middle"
                    >
                      {e.label}
                    </text>
                  )}
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
              title={`${graphPaperLabel(p)}\n${p.title}`}
              aria-label={`${graphPaperLabel(p)} · ${p.title} 읽기`}
              className={`graph-node ${p.status === "read" ? "is-read" : ""}${activeNode === p.id ? " is-active" : ""}${activeNode && !related.has(p.id) ? " is-muted" : ""}`}
              style={{ left: layout[p.id].x, top: layout[p.id].y }}
              onPointerEnter={() => setActiveNode(p.id)}
              onPointerLeave={() => setActiveNode(null)}
              onFocus={() => setActiveNode(p.id)}
              onBlur={() => setActiveNode(null)}
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
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p.id);
                }
              }}
            >
              <PaperPortal />
              <strong>{graphPaperLabel(p)}</strong>
            </button>
          ))}
        </div>
        <div className="graph-presentation" aria-label="지도 보기 방식">
          <button aria-pressed={palace} onClick={() => setPalace(true)}>
            <Landmark size={15} /> 궁전
          </button>
          <button aria-pressed={!palace} onClick={() => setPalace(false)}>
            <Network size={15} /> 지도
          </button>
        </div>
        <div className="graph-viewbar">
          <button
            className="icon-button graph-label-toggle"
            title="연결 이름 표시"
            aria-label="연결 이름 표시"
            aria-pressed={showLabels}
            onClick={() => setShowLabels((value) => !value)}
          >
            <Tags size={16} />
          </button>
          {expanded && <kbd>Esc</kbd>}
          <button
            ref={expandButton}
            className="button small"
            aria-pressed={expanded}
            onClick={() => {
              if (!expanded)
                setPlaceholderHeight(
                  canvas.current?.getBoundingClientRect().height || 590,
                );
              setExpanded((value) => !value);
            }}
          >
            {expanded ? <Minimize2 size={16} /> : <Expand size={16} />}
            {expanded ? "원래 화면으로" : "보드 크게 보기"}
          </button>
        </div>
        <div className="graph-insight" aria-live="polite" aria-atomic="true">
          <BookOpen size={15} aria-hidden="true" />
          <div>
            <strong>
              {activePaper
                ? graphPaperLabel(activePaper)
                : palace
                  ? "논문이 방이 되고, 연결이 길이 되는 곳"
                  : "나의 논문과 그 사이의 연결"}
            </strong>
            <span>
              {activePaper
                ? activePaper.title
                : "논문을 눌러 읽기 · 드래그로 이동 · 휠로 확대"}
            </span>
          </div>
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
