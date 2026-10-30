import Link from "next/link";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/app/"
      className={`brand ${compact ? "compact" : ""}`}
      aria-label="Paper Palace 연구 공간"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="240 200 850 750" focusable="false">
          <image href="/brand/paper-palace.png" width="1254" height="1254" />
        </svg>
      </span>
      <span>
        Paper Palace<small>YOUR PERSONAL RESEARCH GRAPH</small>
      </span>
    </Link>
  );
}
