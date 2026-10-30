import { ArrowUpRight, LoaderCircle } from "lucide-react";
import type { AuthorDetails } from "@/lib/author-affiliations";
import type { Candidate } from "@/lib/recommendations";

export function RecommendationAuthors({
  paper,
  details,
  loading,
  failed,
}: {
  paper: Candidate;
  details?: AuthorDetails;
  loading: boolean;
  failed: boolean;
}) {
  const first =
    details?.firstAuthors ||
    (paper.authors[0]
      ? [
          {
            name: paper.authors[0],
            role: "first" as const,
            evidence: "",
            affiliations: [],
          },
        ]
      : []);
  const corresponding = details?.correspondingAuthors || [];
  const people = [...first, ...corresponding];
  const evidence = [
    ...new Set(
      people
        .flatMap((p) => [p.evidence, ...p.affiliations.map((a) => a.evidence)])
        .filter(Boolean),
    ),
  ];
  return (
    <section
      className="recommendation-author-info"
      aria-label="주요 저자와 소속"
      aria-busy={loading}
    >
      <div className="recommendation-author-heading">
        <h4>주요 저자 · 소속</h4>
        {loading && (
          <span role="status">
            <LoaderCircle size={13} className="spin" /> 원문 확인 중
          </span>
        )}
      </div>
      <dl>
        <div>
          <dt>
            {first.some((p) => p.role === "co-first")
              ? "1저자 · 공동 1저자"
              : "1저자"}
          </dt>
          <dd>
            {first.length
              ? first.map((p) => (
                  <div className="recommendation-author-person" key={p.name}>
                    <strong>
                      {p.name}
                      {p.role === "co-first" && <small>동등 기여</small>}
                    </strong>
                    <span>
                      {p.affiliations.length
                        ? p.affiliations.map((a) => a.name).join(" · ")
                        : loading
                          ? "소속 확인 중…"
                          : "소속 확인 안 됨"}
                    </span>
                  </div>
                ))
              : "저자 정보 없음"}
          </dd>
        </div>
        <div>
          <dt>교신저자</dt>
          <dd>
            {corresponding.length ? (
              corresponding.map((p) => (
                <div className="recommendation-author-person" key={p.name}>
                  <strong>{p.name}</strong>
                  <span>
                    {p.affiliations.length
                      ? p.affiliations.map((a) => a.name).join(" · ")
                      : "소속 확인 안 됨"}
                  </span>
                </div>
              ))
            ) : (
              <span className="recommendation-author-unknown">
                {loading ? "원문 표기 확인 중…" : "교신저자 표기 확인 안 됨"}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {!loading && (
        <p className="recommendation-author-caption">
          {failed
            ? "저자·소속 확인을 완료하지 못했어요. 추천 논문은 그대로 읽을 수 있어요."
            : details
              ? "원문의 저자 표기를 AI로 추출했어요. 소속은 논문 작성 당시 기준이며, 확인 안 된 정보는 원문에서 살펴보세요."
              : "원문에서 저자·소속 정보를 가져오지 못했어요."}
        </p>
      )}
      {evidence.length > 0 && (
        <details className="recommendation-author-evidence">
          <summary>저자·소속 근거 보기</summary>
          {evidence.map((quote, i) => (
            <blockquote key={i}>{quote}</blockquote>
          ))}
        </details>
      )}
      {!loading && (
        <a
          className="recommendation-author-source"
          href={`https://arxiv.org/${details?.format === "html" ? "html" : "pdf"}/${paper.arxivId}${details?.format === "html" ? "" : "#page=1"}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          원문 저자 정보 <ArrowUpRight size={12} />
        </a>
      )}
    </section>
  );
}
