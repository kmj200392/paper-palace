"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import type {
  PDFViewer,
  PDFViewerOptions,
} from "pdfjs-dist/types/web/pdf_viewer";
import type { EventBus } from "pdfjs-dist/types/web/event_utils";
import { citationPdfMatches } from "@/lib/pdf-citations";
import "./pdf-viewer-styles.css";

export type PdfTarget = { quote?: string; page?: number; request: number };
type Runtime = {
  viewer: PDFViewer;
  bus: EventBus;
  find: (
    query: string,
    citation: boolean,
    again?: boolean,
    previous?: boolean,
  ) => void;
};
export function PdfReader({
  arxivId,
  title,
  target,
  visible,
  onQuote,
  onTextFallback,
}: {
  arxivId: string;
  title: string;
  target: PdfTarget | null;
  visible: boolean;
  onQuote: (text: string, page: number) => boolean;
  onTextFallback: () => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    pages = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const handledTarget = useRef<PdfTarget | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0),
    [page, setPage] = useState(1),
    [pageInput, setPageInput] = useState("1");
  const [count, setCount] = useState(0),
    [scale, setScale] = useState(1),
    [fit, setFit] = useState(true);
  const fitRef = useRef(true),
    mode = useRef<"search" | "citation">("search");
  const [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(""),
    [notFound, setNotFound] = useState(false);
  const [matches, setMatches] = useState({ current: 0, total: 0 });
  const [selection, setSelection] = useState<{
    text: string;
    page: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false,
      loading: PDFDocumentLoadingTask | undefined,
      viewer: PDFViewer | undefined;
    const abort = new AbortController();
    handledTarget.current = null;
    setReady(false);
    setError("");
    setCount(0);
    setStatus("");
    setNotFound(false);
    setSelection(null);
    setPage(1);
    setPageInput("1");
    void (async () => {
      // The viewer component expects the core library on globalThis.pdfjsLib.
      const pdfjs = await import("pdfjs-dist");
      const {
        PDFViewer,
        PDFLinkService,
        EventBus,
        PDFFindController,
        LinkTarget,
      } = await import("pdfjs-dist/web/pdf_viewer.mjs");
      if (cancelled || !container.current || !pages.current) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const bus = new EventBus();
      const links = new PDFLinkService({
        eventBus: bus,
        externalLinkTarget: LinkTarget.BLANK,
        externalLinkRel: "noopener noreferrer",
        ignoreDestinationZoom: true,
      });
      class CitationFindController extends PDFFindController {
        citation = false;
        match(query: string | string[], content: string, index: number) {
          return this.citation && typeof query === "string"
            ? citationPdfMatches(query, content)
            : super.match(query, content, index);
        }
      }
      const finder = new CitationFindController({
        eventBus: bus,
        linkService: links,
        delay: 0,
      });
      // abortSignal is supported by the installed viewer; its declaration omits it.
      const options: PDFViewerOptions & { abortSignal: AbortSignal } = {
        container: container.current,
        viewer: pages.current,
        eventBus: bus,
        linkService: links,
        findController: finder,
        abortSignal: abort.signal,
        annotationMode: pdfjs.AnnotationMode.ENABLE,
        annotationEditorMode: pdfjs.AnnotationEditorType.DISABLE,
        maxCanvasPixels: 8_000_000,
        imageResourcesPath: "/pdf-assets/images/",
      };
      viewer = new PDFViewer(options);
      const instance = viewer;
      links.setViewer(instance);
      runtime.current = {
        viewer: instance,
        bus,
        find(query, citation, again = false, previous = false) {
          finder.citation = citation;
          mode.current = citation ? "citation" : "search";
          setNotFound(false);
          setStatus(citation ? "PDF에서 근거 위치를 찾는 중…" : "검색 중…");
          bus.dispatch("find", {
            source: instance,
            type: again ? "again" : "",
            query,
            caseSensitive: false,
            entireWord: false,
            highlightAll: true,
            findPrevious: previous,
            matchDiacritics: false,
          });
        },
      };
      bus.on("pagesinit", () => {
        if (cancelled) return;
        instance.currentScaleValue = "page-width";
        fitRef.current = true;
        setFit(true);
        setReady(true);
      });
      bus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
        if (!cancelled) {
          setPage(pageNumber);
          setPageInput(String(pageNumber));
        }
      });
      bus.on("scalechanging", ({ scale }: { scale: number }) => {
        if (!cancelled) setScale(scale);
      });
      bus.on(
        "updatefindmatchescount",
        ({
          matchesCount,
        }: {
          matchesCount: { current: number; total: number };
        }) => {
          if (!cancelled) setMatches(matchesCount);
        },
      );
      bus.on(
        "updatefindcontrolstate",
        ({
          state,
          matchesCount,
        }: {
          state: number;
          matchesCount: { current: number; total: number };
        }) => {
          if (cancelled) return;
          setMatches(matchesCount);
          setNotFound(state === 1 && mode.current === "citation");
          setStatus(
            state === 3
              ? "찾는 중…"
              : state === 1
                ? mode.current === "citation"
                  ? "PDF에서 같은 문구를 찾지 못했어요. 추출 텍스트에서 근거를 확인해 주세요."
                  : "검색 결과가 없어요."
                : mode.current === "citation"
                  ? "근거 문구를 PDF에 표시했어요."
                  : "",
          );
        },
      );
      bus.on("pagerendered", ({ error }: { error?: Error }) => {
        if (!cancelled && error)
          setError(
            "이 PDF 페이지를 표시하지 못했어요. 원본 링크나 추출 텍스트로 확인해 주세요.",
          );
      });
      loading = pdfjs.getDocument({
        url: `/api/source?id=${encodeURIComponent(arxivId)}&format=pdf`,
        cMapUrl: "/pdf-assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf-assets/standard_fonts/",
        wasmUrl: "/pdf-assets/wasm/",
        iccUrl: "/pdf-assets/iccs/",
      });
      const document = await loading.promise;
      if (cancelled) return;
      if (document.numPages > 120)
        throw new Error("120쪽을 넘는 PDF는 원본 링크에서 열어 주세요.");
      setCount(document.numPages);
      links.setDocument(document);
      instance.setDocument(document);
    })().catch((cause) => {
      if (!cancelled)
        setError(
          cause instanceof Error && cause.message.startsWith("120쪽")
            ? cause.message
            : "원본 PDF를 불러오지 못했어요. 다시 시도하거나 원본 링크·추출 텍스트로 확인해 주세요.",
        );
    });
    return () => {
      cancelled = true;
      runtime.current = null;
      viewer?.setDocument(null);
      abort.abort();
      void viewer?.l10n?.destroy();
      void loading?.destroy();
    };
  }, [arxivId, retry]);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(() => {
      const viewer = runtime.current?.viewer;
      if (ready && viewer && container.current!.clientWidth > 0) {
        if (fitRef.current) viewer.currentScaleValue = "page-width";
        viewer.update();
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    const viewer = runtime.current?.viewer;
    if (visible && ready && viewer) {
      if (fitRef.current) viewer.currentScaleValue = "page-width";
      viewer.update();
    }
  }, [visible, ready]);
  useEffect(() => {
    const rt = runtime.current;
    if (
      !target ||
      !ready ||
      !rt ||
      !visible ||
      handledTarget.current === target
    )
      return;
    handledTarget.current = target;
    if (target.page && target.page <= rt.viewer.pagesCount)
      rt.viewer.currentPageNumber = target.page;
    if (target.quote) {
      setSearchOpen(true);
      setQuery(target.quote);
      rt.find(target.quote, true);
    }
  }, [target, ready, visible]);
  useEffect(() => {
    const onSelection = () => {
      const selected = window.getSelection();
      if (
        !selected ||
        selected.isCollapsed ||
        !container.current?.contains(selected.anchorNode) ||
        !container.current.contains(selected.focusNode)
      ) {
        setSelection(null);
        return;
      }
      const text = selected.toString().replace(/\s+/g, " ").trim();
      const anchor =
        selected.anchorNode instanceof Element
          ? selected.anchorNode
          : selected.anchorNode?.parentElement;
      const focus =
        selected.focusNode instanceof Element
          ? selected.focusNode
          : selected.focusNode?.parentElement;
      const firstPage = anchor?.closest<HTMLElement>(".page[data-page-number]");
      const lastPage = focus?.closest<HTMLElement>(".page[data-page-number]");
      setSelection(
        text && text.length <= 2000 && firstPage && firstPage === lastPage
          ? { text, page: Number(firstPage.dataset.pageNumber) }
          : null,
      );
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);
  const go = (number: number) => {
    const viewer = runtime.current?.viewer;
    if (viewer && ready)
      viewer.currentPageNumber = Math.min(
        count,
        Math.max(1, Math.round(number) || 1),
      );
    setPageInput(String(viewer?.currentPageNumber || page));
  };
  const zoom = (factor: number) => {
    const viewer = runtime.current?.viewer;
    if (!viewer || !ready) return;
    fitRef.current = false;
    setFit(false);
    viewer.currentScale = Math.min(
      3,
      Math.max(0.25, viewer.currentScale * factor),
    );
  };
  const clearSearch = () => {
    setQuery("");
    setStatus("");
    setNotFound(false);
    setSearchOpen(false);
    setMatches({ current: 0, total: 0 });
    runtime.current?.bus.dispatch("findbarclose", {});
  };
  return (
    <div className="pdf-reader">
      <div className="pdf-toolbar" aria-label="PDF 도구">
        <div className="pdf-tool-group">
          <button
            className="icon-button"
            aria-label="이전 페이지"
            disabled={!ready || page === 1}
            onClick={() => go(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go(Number(pageInput));
            }}
          >
            <input
              aria-label="PDF 페이지"
              type="number"
              min={1}
              max={count || 1}
              value={pageInput}
              disabled={!ready}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => go(Number(pageInput))}
            />
            <span>/ {count || "—"}</span>
          </form>
          <button
            className="icon-button"
            aria-label="다음 페이지"
            disabled={!ready || page === count}
            onClick={() => go(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="pdf-tool-group">
          <button
            className="icon-button"
            aria-label="PDF 축소"
            disabled={!ready}
            onClick={() => zoom(1 / 1.2)}
          >
            <Minus size={15} />
          </button>
          <button
            className={`pdf-fit ${fit ? "active" : ""}`}
            title="페이지 너비에 맞추기"
            disabled={!ready}
            onClick={() => {
              fitRef.current = true;
              setFit(true);
              if (runtime.current)
                runtime.current.viewer.currentScaleValue = "page-width";
            }}
          >
            {fit ? "너비 맞춤" : `${Math.round(scale * 100)}%`}
          </button>
          <button
            className="icon-button"
            aria-label="PDF 확대"
            disabled={!ready}
            onClick={() => zoom(1.2)}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="pdf-tool-group">
          <button
            className="icon-button"
            aria-label="PDF 본문 검색"
            aria-expanded={searchOpen}
            disabled={!ready}
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchInput.current?.focus());
            }}
          >
            <Search size={16} />
          </button>
          <a
            className="icon-button"
            aria-label="원본 PDF 새 창에서 열기"
            href={`https://arxiv.org/pdf/${arxivId}#page=${page}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
      {searchOpen && (
        <form
          className="pdf-search"
          onSubmit={(e) => {
            e.preventDefault();
            runtime.current?.find(query, false, mode.current === "search");
          }}
        >
          <Search size={14} />
          <input
            ref={searchInput}
            aria-label="PDF 검색어"
            placeholder="PDF 안에서 찾기"
            value={query}
            maxLength={400}
            onChange={(e) => {
              setQuery(e.target.value);
              runtime.current?.find(e.target.value, false);
            }}
          />
          <span aria-live="polite">
            {matches.total ? `${matches.current}/${matches.total}` : ""}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="이전 검색 결과"
            disabled={!query}
            onClick={() =>
              runtime.current?.find(
                query,
                mode.current === "citation",
                true,
                true,
              )
            }
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="다음 검색 결과"
            disabled={!query}
            onClick={() =>
              runtime.current?.find(query, mode.current === "citation", true)
            }
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="PDF 검색 닫기"
            onClick={clearSearch}
          >
            <X size={14} />
          </button>
        </form>
      )}
      {status && (
        <div className="pdf-status" role="status">
          {status}
          {notFound && (
            <button className="text-button" onClick={onTextFallback}>
              추출 텍스트에서 보기
            </button>
          )}
        </div>
      )}
      <div className="pdf-stage">
        <div
          ref={container}
          className="pdf-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${title} 원본 PDF`}
        >
          <div ref={pages} className="pdfViewer" />
        </div>
        {!ready && !error && (
          <div className="pdf-loading" role="status">
            <LoaderCircle size={22} className="spin" />
            원본 PDF를 여는 중…
          </div>
        )}
        {error && (
          <div className="pdf-load-error" role="alert">
            <p>{error}</p>
            <button
              className="button small"
              onClick={() => setRetry((r) => r + 1)}
            >
              다시 열기
            </button>
            <button className="text-button" onClick={onTextFallback}>
              추출 텍스트로 읽기
            </button>
          </div>
        )}
        {selection && (
          <button
            className="pdf-selection-action button small"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              if (onQuote(selection.text, selection.page)) {
                window.getSelection()?.removeAllRanges();
                setSelection(null);
              }
            }}
          >
            <StickyNote size={14} />
            선택한 문장 메모에 추가 · {selection.page}쪽
          </button>
        )}
      </div>
      <div className="pdf-reading-hint">
        그림·수식은 원본 그대로 · 문장을 드래그해 메모에 남기세요
      </div>
    </div>
  );
}
