import { ArrowUpRight, LoaderCircle } from "lucide-react";
import type { AuthorDetails } from "@/lib/author-affiliations";
import type { Candidate } from "@/lib/recommendations";

export function RecommendationAffiliations({
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
  const affiliations = new Map<string, { name: string; evidence: string[] }>();
  for (const person of [
    ...(details?.firstAuthors || []),
    ...(details?.correspondingAuthors || []),
  ]) {
    for (const affiliation of person.affiliations) {
      const name = affiliation.name.trim().replace(/\s+/g, " ");
      const key = name.normalize("NFKC").toLowerCase();
      if (!key) continue;
      const existing = affiliations.get(key);
      if (existing) existing.evidence.push(affiliation.evidence);
      else affiliations.set(key, { name, evidence: [affiliation.evidence] });
    }
  }
  const institutions = [...affiliations.values()];
  const evidence = [
    ...new Set(institutions.flatMap((a) => a.evidence).filter(Boolean)),
  ];
  return (
    <section
      className="recommendation-affiliations"
      aria-label="연구기관 소속"
      aria-busy={loading}
    >
      <div className="recommendation-affiliation-heading">
        <h4>Affiliations</h4>
        {loading && (
          <span role="status">
            <LoaderCircle size={13} className="spin" /> 소속 확인 중
          </span>
        )}
      </div>
      {institutions.length > 0 ? (
        <ul className="recommendation-affiliation-list">
          {institutions.map(({ name }) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        !loading && (
          <p className="recommendation-affiliation-unknown">
            {failed
              ? "소속 정보를 불러오지 못했어요."
              : "원문에서 확인된 소속이 없어요."}
          </p>
        )
      )}
      {institutions.length > 0 && (
        <p className="recommendation-affiliation-caption">
          논문 작성 당시 소속 · 원문에서 확인된 기관
        </p>
      )}
      {evidence.length > 0 && (
        <details className="recommendation-affiliation-evidence">
          <summary>소속 근거 보기</summary>
          {evidence.map((quote, i) => (
            <blockquote key={i}>{quote}</blockquote>
          ))}
        </details>
      )}
      {!loading && (
        <a
          className="recommendation-affiliation-source"
          href={`https://arxiv.org/${details?.format === "html" ? "html" : "pdf"}/${paper.arxivId}${details?.format === "html" ? "" : "#page=1"}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          원문에서 소속 확인 <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
