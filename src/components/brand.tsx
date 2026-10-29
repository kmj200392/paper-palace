import Link from "next/link";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${compact ? "compact" : ""}`}
      aria-label="Paper Palace 홈"
    >
      <span className="brand-mark">
        <img src="/brand/paper-palace.png" alt="" width="1254" height="1254" />
      </span>
      <span>
        Paper Palace<small>YOUR PERSONAL RESEARCH GRAPH</small>
      </span>
    </Link>
  );
}
