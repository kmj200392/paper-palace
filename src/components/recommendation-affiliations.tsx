import { LoaderCircle } from "lucide-react";
import type { AuthorDetails } from "@/lib/author-affiliations";

export function RecommendationAffiliations({
  details,
  loading,
  failed,
}: {
  details?: AuthorDetails;
  loading: boolean;
  failed: boolean;
}) {
  const affiliations = new Map<string, string>();
  for (const person of [
    ...(details?.firstAuthors || []),
    ...(details?.correspondingAuthors || []),
  ]) {
    for (const affiliation of person.affiliations) {
      const name = affiliation.name.trim().replace(/\s+/g, " ");
      const key = name.normalize("NFKC").toLowerCase();
      if (!key) continue;
      if (!affiliations.has(key)) affiliations.set(key, name);
    }
  }
  const institutions = [...affiliations.values()];
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
          {institutions.map((name) => (
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
    </section>
  );
}
