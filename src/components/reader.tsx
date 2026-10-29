"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  Quote,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  type Paper,
  type Source,
  type Analysis,
  type Citation,
  sectionKeys,
  sectionLabels,
  citationMatches,
  verifyAnalysis,
} from "@/lib/model";
import { getSource } from "@/lib/source";
import { api } from "@/lib/api";
export type AISettings = {
  provider: "openai" | "anthropic";
  model: string;
  apiKey: string;
};
export function Reader({
  paper,
  onBack,
  onUpdate,
  onDelete,
  settings,
  openSettings,
  notify,
}: {
  paper: Paper;
  onBack: () => void;
  onUpdate: (p: Partial<Paper>) => void;
  onDelete: () => void;
  settings: AISettings;
  openSettings: () => void;
  notify: (s: string) => void;
}) {
  const [source, setSource] = useState<Source | null>(null),
    [loading, setLoading] = useState(""),
    [sourceError, setSourceError] = useState(""),
    [retry, setRetry] = useState(0),
    [analyzing, setAnalyzing] = useState(false),
    [active, setActive] = useState(""),
    [tab, setTab] = useState<"summary" | "notes">("summary"),
    [mobile, setMobile] = useState<"source" | "summary">("summary"),
    [pdf, setPdf] = useState(false),
    [pdfPage, setPdfPage] = useState(1);
  const sourcePane = useRef<HTMLDivElement>(null),
    analysisRequest = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setSourceError("");
    setLoading("원문을 여는 중…");
    getSource(paper.arxivId, (m) => {
      if (!cancelled) setLoading(m);
    })
      .then((s) => {
        if (!cancelled) setSource(s);
      })
      .catch((e) => {
        if (!cancelled) setSourceError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading("");
      });
    return () => {
      cancelled = true;
    };
  }, [paper.arxivId, retry]);
  const update = (changes: Partial<Paper>) =>
    onUpdate({ ...changes, updatedAt: new Date().toISOString() });
  const analyze = async () => {
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    if (!source || analysisRequest.current) return;
    if (source.blocks.reduce((n, b) => n + b.text.length, 0) > 220000) {
      notify(
        "이 논문은 분석 한도인 22만 자를 초과해요. 원문 읽기와 메모는 사용할 수 있어요.",
      );
      return;
    }
    analysisRequest.current = true;
    setAnalyzing(true);
    try {
      const { analysis } = await api<{ analysis: Analysis }>("/analyze", {
        method: "POST",
        body: JSON.stringify({
          ...settings,
          title: paper.title,
          blocks: source.blocks,
        }),
      });
      onUpdate({
        analysis,
        tags: [...new Set([...paper.tags, ...analysis.tags])].slice(0, 30),
        analysisMeta: {
          provider: settings.provider,
          model: settings.model,
          createdAt: new Date().toISOString(),
          sourceHash: source.hash,
          coverage: `${source.format.toUpperCase()}에서 추출한 전체 텍스트 · 그림 픽셀은 분석하지 않음`,
        },
        updatedAt: new Date().toISOString(),
      });
      notify("다섯 가지 관점으로 논문을 정리했어요.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      analysisRequest.current = false;
      setAnalyzing(false);
    }
  };
  const jump = (c: Citation) => {
    if (!source || !citationMatches(c, source.blocks)) return;
    setPdf(false);
    setMobile("source");
    setActive(c.blockId);
    const block = source.blocks.find((b) => b.id === c.blockId);
    if (block?.page) setPdfPage(block.page);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById(`source-${c.blockId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      ),
    );
  };
  const verified =
    source && paper.analysis
      ? verifyAnalysis(paper.analysis, source.blocks)
      : paper.analysis;
  const stale = !!(
    source &&
    paper.analysisMeta &&
    source.hash !== paper.analysisMeta.sourceHash
  );
  return (
    <div className="reader">
      <div className="reader-toolbar">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} /> 라이브러리
        </button>
        <span className="reader-id">arXiv:{paper.arxivId}</span>
        <div className="toolbar-right">
          <label className="sr-only" htmlFor="reading-status">
            읽기 상태
          </label>
          <select
            id="reading-status"
            value={paper.status}
            onChange={(e) =>
              update({ status: e.target.value as Paper["status"] })
            }
          >
            <option value="unread">읽기 전</option>
            <option value="reading">읽는 중</option>
            <option value="read">읽음</option>
          </select>
          <a
            className="icon-button"
            href={`https://arxiv.org/abs/${paper.arxivId}`}
            target="_blank"
            rel="noreferrer"
            aria-label="arXiv에서 열기"
          >
            <ArrowUpRight size={18} />
          </a>
          <button
            className="icon-button"
            onClick={onDelete}
            aria-label="논문 삭제"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="mobile-reader-tabs">
        <button
          className={mobile === "summary" ? "active" : ""}
          onClick={() => setMobile("summary")}
        >
          정리와 메모
        </button>
        <button
          className={mobile === "source" ? "active" : ""}
          onClick={() => setMobile("source")}
        >
          논문 원문
        </button>
      </div>
      <div className="reader-columns">
        <section
          className={`source-panel ${mobile === "source" ? "mobile-active" : ""}`}
        >
          <div className="panel-heading">
            <span>
              <FileText size={15} /> 원문 읽기
            </span>
            <div className="segmented">
              <button
                className={!pdf ? "active" : ""}
                onClick={() => setPdf(false)}
              >
                텍스트
              </button>
              <button
                className={pdf ? "active" : ""}
                onClick={() => setPdf(true)}
              >
                PDF
              </button>
            </div>
          </div>
          <div ref={sourcePane} className="source-scroll">
            {pdf ? (
              <>
                <div className="pdf-page-control">
                  <label>
                    페이지{" "}
                    <input
                      type="number"
                      min="1"
                      value={pdfPage}
                      onChange={(e) =>
                        setPdfPage(Math.max(1, Number(e.target.value) || 1))
                      }
                    />
                  </label>
                  <a
                    href={`https://arxiv.org/pdf/${paper.arxivId}#page=${pdfPage}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    새 창에서 보기 ↗
                  </a>
                </div>
                <iframe
                  key={pdfPage}
                  title={`${paper.title} PDF ${pdfPage}쪽`}
                  src={`/api/source?id=${encodeURIComponent(paper.arxivId)}&format=pdf#page=${pdfPage}&view=FitH`}
                  className="pdf-frame"
                />
              </>
            ) : (
              <article className="paper-document">
                <p className="tiny-label">
                  ARXIV · {paper.published} ·{" "}
                  {source?.format === "pdf"
                    ? "PDF 추출 텍스트"
                    : "HTML 원문 텍스트"}
                </p>
                <h1>{paper.title}</h1>
                <p className="paper-authors">{paper.authors.join(", ")}</p>
                <div className="paper-abstract">
                  <h2>Abstract</h2>
                  <p>{paper.abstract}</p>
                </div>
                {loading ? (
                  <div className="loading-state" role="status">
                    <LoaderCircle className="spin" size={20} />
                    {loading}
                  </div>
                ) : sourceError ? (
                  <div className="inline-error">
                    <p>{sourceError}</p>
                    <button
                      className="button small"
                      onClick={() => setRetry((r) => r + 1)}
                    >
                      다시 가져오기
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setPdf(true)}
                    >
                      PDF로 보기
                    </button>
                  </div>
                ) : (
                  source?.blocks.map((b) => (
                    <div
                      id={`source-${b.id}`}
                      key={b.id}
                      tabIndex={active === b.id ? 0 : undefined}
                      className={`source-block ${active === b.id ? "highlighted" : ""}`}
                    >
                      {b.page && (
                        <button
                          className="page-marker"
                          onClick={() => {
                            setPdfPage(b.page!);
                            setPdf(true);
                          }}
                        >
                          PDF {b.page}쪽 ↗
                        </button>
                      )}
                      {b.kind === "heading" ? (
                        <h2>{b.text}</h2>
                      ) : (
                        <p className={b.kind === "table" ? "source-table" : ""}>
                          {b.text}
                        </p>
                      )}
                      {active === b.id && (
                        <span className="source-badge">
                          <Check size={12} /> 요약의 근거 위치
                        </span>
                      )}
                    </div>
                  ))
                )}
              </article>
            )}
          </div>
        </section>
        <section
          className={`analysis-panel ${mobile === "summary" ? "mobile-active" : ""}`}
        >
          <div className="panel-heading">
            <div className="reader-tabs">
              <button
                className={tab === "summary" ? "active" : ""}
                onClick={() => setTab("summary")}
              >
                <Sparkles size={14} /> 논문 정리
              </button>
              <button
                className={tab === "notes" ? "active" : ""}
                onClick={() => setTab("notes")}
              >
                <StickyNote size={14} /> 나의 메모
              </button>
            </div>
          </div>
          <div className="analysis-scroll">
            {tab === "notes" ? (
              <div className="notes-panel">
                <p className="eyebrow">MAKE IT PART OF YOUR THINKING</p>
                <h2>읽으며 떠오른 생각.</h2>
                <label htmlFor="paper-tags">
                  태그 <small>쉼표로 구분해 주세요</small>
                </label>
                <input
                  id="paper-tags"
                  defaultValue={paper.tags.join(", ")}
                  key={paper.id}
                  onBlur={(e) =>
                    update({
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .slice(0, 30),
                    })
                  }
                  placeholder="예: efficient training, retrieval"
                  maxLength={1500}
                />
                <label htmlFor="paper-notes">연구 메모</label>
                <textarea
                  id="paper-notes"
                  value={paper.notes}
                  maxLength={30000}
                  onChange={(e) => update({ notes: e.target.value })}
                  placeholder="이 논문은 내 연구와 어떻게 이어질까?\n비교해 보고 싶은 방법이나 남은 질문을 적어 보세요."
                />
                <span className="muted">
                  <Check size={12} /> 이 브라우저에 자동 저장
                </span>
              </div>
            ) : (
              <>
                {!verified ? (
                  <div className="analysis-empty">
                    <div className="arch-icon">
                      <Sparkles size={28} />
                    </div>
                    <p className="eyebrow">YOUR READING COMPANION</p>
                    <h2>
                      이 논문을,
                      <br />
                      다섯 가지 관점으로.
                    </h2>
                    <p>
                      논문에서 출발한 질문부터 실험 결과까지.
                      <br />
                      근거를 따라 읽는 AI 요약을 만들어 보세요.
                    </p>
                    <ol>
                      {sectionKeys.map((k) => (
                        <li key={k}>
                          <span>{sectionLabels[k][0]}</span>
                          {sectionLabels[k][1]}
                        </li>
                      ))}
                    </ol>
                    <button
                      className="button primary"
                      disabled={!source || analyzing}
                      onClick={analyze}
                    >
                      {analyzing ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}{" "}
                      {analyzing
                        ? "논문을 읽고 정리하는 중…"
                        : "AI로 논문 정리하기"}
                    </button>
                    <small>
                      선택한 AI에 원문 텍스트가 전달되며
                      <br />
                      본인 API 계정의 사용료가 발생합니다.
                    </small>
                  </div>
                ) : (
                  <>
                    <div className="positioning">
                      <p className="eyebrow">THE BIG PICTURE</p>
                      <h2>이 논문의 자리</h2>
                      <p>{verified.positioning}</p>
                      <div className="tag-list">
                        {verified.tags.map((t) => (
                          <span className="tag" key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    {stale && (
                      <p className="inline-warning">
                        원문이 이전 분석 때와 달라졌어요. 정확한 근거 연결을
                        위해 다시 분석해 주세요.
                      </p>
                    )}
                    <div className="summary-instruction">
                      <Quote size={15} /> 근거 문구를 누르면 원문으로 이동해요.
                    </div>
                    {sectionKeys.map((key, i) => (
                      <section className="analysis-section" key={key}>
                        <div className="analysis-section-title">
                          <span>0{i + 1}</span>
                          <div>
                            <h3>{sectionLabels[key][0]}</h3>
                            <p>{sectionLabels[key][1]}</p>
                          </div>
                        </div>
                        {verified.sections[key].map((point, j) => (
                          <div className="analysis-point" key={j}>
                            <p>{point.text}</p>
                            <div className="citations">
                              {point.citations.map((c, k) => (
                                <button
                                  key={k}
                                  className="citation"
                                  disabled={!source || stale}
                                  onClick={() => jump(c)}
                                >
                                  <Quote size={12} />
                                  <span>{c.quote}</span>
                                  <ArrowUpRight size={12} />
                                </button>
                              ))}
                              {!point.citations.length && (
                                <span className="unverified">
                                  연결 가능한 원문 근거 없음 · 직접 확인해
                                  주세요
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </section>
                    ))}
                    {!!verified.limitations.length && (
                      <div className="limitations">
                        <h3>함께 기억할 한계</h3>
                        <ul>
                          {verified.limitations.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="analysis-footer">
                      <p>
                        {paper.analysisMeta?.model} ·{" "}
                        {paper.analysisMeta?.createdAt.slice(0, 10)}
                        <br />
                        {paper.analysisMeta?.coverage}
                        <br />
                        AI 요약은 오류가 있을 수 있어요. 원문과 함께 확인하세요.
                      </p>
                      <button
                        className="button small"
                        disabled={analyzing || !source}
                        onClick={analyze}
                      >
                        {analyzing ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <Sparkles size={15} />
                        )}
                        다시 분석하기
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
