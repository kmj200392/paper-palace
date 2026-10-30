"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Compass,
  GitBranch,
  LoaderCircle,
  Plus,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { hasAIConnection, type AISettings } from "@/lib/ai-settings";
import { type Library } from "@/lib/model";
import {
  authorDetailsResponseSchema,
  loadAuthorSources,
  type AuthorDetails,
} from "@/lib/author-affiliations";
import { RecommendationAffiliations } from "./recommendation-affiliations";
import {
  canonicalPaperId,
  discoveryInput,
  discoveryResultSchema,
  type DiscoveryResult,
  type Recommendation,
} from "@/lib/recommendations";

export function PaperDiscovery({
  library,
  settings,
  openSettings,
  onAdd,
  onOpen,
}: {
  library: Library;
  settings: AISettings;
  openSettings: () => void;
  onAdd: (recommendation: Recommendation, connections: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [revision, setRevision] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authorBusy, setAuthorBusy] = useState(false);
  const [authorFailed, setAuthorFailed] = useState(false);
  const [authors, setAuthors] = useState<Record<string, AuthorDetails>>({});
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const request = useRef<AbortController | null>(null);
  const currentRevision = useMemo(
    () => JSON.stringify(discoveryInput(library, searchedQuery)),
    [library, searchedQuery],
  );
  useEffect(() => () => request.current?.abort(), []);
  const find = async () => {
    if (request.current || query.trim().length < 2) return;
    if (!hasAIConnection(settings)) {
      openSettings();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const prompt = query.trim();
    const context = discoveryInput(library, prompt);
    const version = JSON.stringify(context);
    setBusy(true);
    setError("");
    try {
      const data = await api<unknown>("/recommend", {
        method: "POST",
        body: JSON.stringify({ ...settings, ...context }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const parsed = discoveryResultSchema.safeParse(data);
      if (!parsed.success)
        throw new Error(
          "추천 결과를 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      setResult(parsed.data);
      setSearchedQuery(prompt);
      setRevision(version);
      setConnections({});
      setAuthors({});
      setAuthorFailed(false);
      if (parsed.data.recommendations.length) {
        setAuthorBusy(true);
        try {
          const sources = await loadAuthorSources(
            parsed.data.recommendations.map((r) => r.paper),
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (sources.length) {
            const response = await api<unknown>("/author-affiliations", {
              method: "POST",
              body: JSON.stringify({ ...settings, papers: sources }),
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            const verified = authorDetailsResponseSchema.parse(response);
            setAuthors(
              Object.fromEntries(verified.papers.map((p) => [p.arxivId, p])),
            );
          }
        } catch {
          if (!controller.signal.aborted) setAuthorFailed(true);
        } finally {
          if (!controller.signal.aborted) setAuthorBusy(false);
        }
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "논문 추천을 완료하지 못했어요.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <section className="discovery" aria-labelledby="discovery-title">
      <div className="discovery-heading">
        <p className="eyebrow">YOUR NEXT CONNECTION</p>
        <h1 id="discovery-title">다음에 읽을 논문.</h1>
        <p>
          지금까지 쌓은 연구 지도에서, 다음 질문으로 이어지는 논문을 찾아보세요.
        </p>
      </div>
      <form
        className="discovery-search"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <label htmlFor="discovery-query">어떤 분야를 더 알아보고 싶나요?</label>
        <textarea
          id="discovery-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="예: 에이전트의 장기 기억을 줄이는 방법. 내 그래프의 연구와 비교할 실험이나 다른 접근을 찾아줘."
        />
        <div className="discovery-search-footer">
          <span>
            <GitBranch size={15} aria-hidden="true" /> 현재 논문{" "}
            {library.papers.length}편 · 연결 {library.edges.length}개
          </span>
          <button
            className="button primary"
            disabled={busy || query.trim().length < 2}
            type="submit"
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Search size={16} />
            )}
            {busy
              ? authorBusy
                ? "소속 확인 중…"
                : "연구 지도에서 찾는 중…"
              : hasAIConnection(settings)
                ? "논문 추천받기"
                : "AI 연결하고 시작하기"}
          </button>
        </div>
        <p className="discovery-cost">
          {hasAIConnection(settings) ? settings.model : "연결한 AI"} · 검색당 AI
          최대 3회 호출(소속 확인 포함). 내 API 크레딧을 사용해요.
        </p>
      </form>
      <p className="discovery-scope">
        라이브러리에 없는 arXiv 논문을 찾아요. 제목·초록·저장한 요약과 그래프
        관계를 참고하며, 개인 메모와 원문 전체는 보내지 않아요.
        {library.papers.length > 60
          ? " 큰 그래프는 주제와 가까운 논문·주요 연결을 중심으로 최대 60편을 참고해요."
          : ""}
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="discovery-progress" role="status">
          <LoaderCircle size={20} className="spin" />
          <span>
            {authorBusy
              ? "추천 논문의 원문에서 연구기관 소속을 확인하고 있어요."
              : "관심 분야를 해석하고 arXiv 검색 결과를 그래프와 비교하고 있어요."}
            <small>
              잠시 걸릴 수 있어요. 검색 버튼을 다시 누를 필요는 없어요.
            </small>
          </span>
        </div>
      )}
      {!result && !busy && (
        <div className="discovery-empty">
          <Compass size={32} strokeWidth={1.2} />
          <h2>익숙한 연구에서 한 걸음 더.</h2>
          <p>
            기존 논문과 닮은 방법, 다른 관점, 아직 비어 있는 주제를 함께
            살펴봐요.
          </p>
          <div className="discovery-examples">
            {(library.papers.length
              ? [
                  "내 그래프와 이어지는 최근 연구",
                  "기존 방법과 비교할 다른 접근",
                  "이 분야를 이해하기 위한 기초 논문",
                ]
              : [
                  "LLM 에이전트의 장기 기억 연구",
                  "검색 증강 생성의 평가 방법",
                  "멀티모달 모델을 이해하기 위한 기초 논문",
                ]
            ).map((example) => (
              <button key={example} onClick={() => setQuery(example)}>
                {example}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        </div>
      )}
      {result && (
        <div className="discovery-results" aria-busy={busy}>
          <div className="discovery-result-heading">
            <span className="eyebrow">A NEW READING PATH</span>
            <h2>{searchedQuery}</h2>
            <p>{result.focus}</p>
            <small>
              arXiv 후보 {result.candidateCount}편 비교 · 내 논문{" "}
              {result.contextCount}편 참고 ·{" "}
              {new Date(result.searchedAt).toLocaleDateString("ko-KR")}
            </small>
          </div>
          {revision !== currentRevision && (
            <p className="discovery-updated">
              검색 이후 라이브러리가 바뀌었어요. 다음 검색부터 새 그래프를
              반영해요.
            </p>
          )}
          {!result.recommendations.length && (
            <div className="discovery-empty">
              <h3>이번 검색에서는 새로운 추천을 찾지 못했어요.</h3>
              <p>
                이미 보관한 논문이거나 주제에 맞는 후보가 부족해요. 분야를 조금
                넓히거나 다른 키워드로 찾아보세요.
              </p>
            </div>
          )}
          <div className="recommendation-list">
            {result.recommendations.map((rec, index) => {
              const existing = library.papers.find(
                (p) =>
                  canonicalPaperId(p.arxivId) ===
                  canonicalPaperId(rec.paper.arxivId),
              );
              const arxivUrl = `https://arxiv.org/abs/${canonicalPaperId(rec.paper.arxivId)}`;
              const related = rec.connections.filter((c) =>
                library.papers.some((p) => p.id === c.paperId),
              );
              return (
                <article className="recommendation-card" key={rec.paper.id}>
                  <div className="recommendation-top">
                    <span className="recommendation-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {rec.paper.published.slice(0, 4)} ·{" "}
                      {rec.paper.categories.slice(0, 2).join(" / ")}
                    </span>
                  </div>
                  <h3>
                    <a
                      href={arxivUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {rec.paper.title}
                    </a>
                  </h3>
                  <a
                    className="recommendation-arxiv"
                    href={arxivUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${rec.paper.title} arXiv 소개 페이지`}
                  >
                    {arxivUrl} <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  <RecommendationAffiliations
                    paper={rec.paper}
                    details={authors[rec.paper.arxivId]}
                    loading={authorBusy}
                    failed={authorFailed}
                  />
                  <div className="recommendation-reason">
                    <h4>왜 지금 읽으면 좋을까</h4>
                    <p>{rec.reason}</p>
                    <h4>새로 얻을 관점</h4>
                    <p>{rec.learning}</p>
                  </div>
                  {related.length > 0 && (
                    <div className="recommendation-connections">
                      <h4>
                        <GitBranch size={14} /> 내 지도와 만나는 지점
                      </h4>
                      {related.map((c) => {
                        const p = library.papers.find(
                          (p) => p.id === c.paperId,
                        )!;
                        return (
                          <div key={c.paperId}>
                            <button
                              onClick={() => onOpen(p.id)}
                              title={p.title}
                            >
                              {p.graphLabel || p.title}
                              <ArrowUpRight size={12} />
                            </button>
                            <span>{c.label}</span>
                            <p>{c.note}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <details className="recommendation-abstract">
                    <summary>원문 초록 보기</summary>
                    <p>{rec.paper.abstract}</p>
                  </details>
                  <div className="recommendation-actions">
                    {!existing && related.length > 0 && (
                      <label>
                        <input
                          type="checkbox"
                          checked={!!connections[rec.paper.id]}
                          onChange={(e) =>
                            setConnections((previous) => ({
                              ...previous,
                              [rec.paper.id]: e.target.checked,
                            }))
                          }
                        />
                        추천 연결도 지도에 표시 <small>검토 전 점선 연결</small>
                      </label>
                    )}
                    <button
                      className={`button small ${existing ? "" : "primary"}`}
                      onClick={() => {
                        if (existing) {
                          onOpen(existing.id);
                          return;
                        }
                        try {
                          onAdd(rec, !!connections[rec.paper.id]);
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {existing ? (
                        <>
                          <Check size={15} />
                          추가됨 · 원문 읽기
                        </>
                      ) : (
                        <>
                          <Plus size={15} />
                          읽을 목록에 추가
                        </>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="discovery-scope">
            추천 이유와 연결은 초록·요약을 바탕으로 한 AI 제안이에요. 논문 간
            인용 관계나 실험 결과가 검증된 것은 아니며, 원문을 함께 확인해
            주세요.
          </p>
          <details className="discovery-query">
            <summary>실제 검색어 보기</summary>
            <code>{result.searchQuery}</code>
          </details>
        </div>
      )}
    </section>
  );
}
