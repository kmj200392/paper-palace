import { parseArxivId, type Paper } from "./model";
export type PaperReference = { provider: "arxiv" | "openreview"; id: string };
const openReviewId = /^[A-Za-z0-9_-]{1,64}$/;
export function parseOpenReviewId(id: string) {
  if (!openReviewId.test(id))
    throw new Error("올바른 OpenReview 논문 링크를 입력해 주세요.");
  return id;
}
export function parsePaperReference(input: string): PaperReference {
  const trimmed = input.trim();
  const value =
    /^(?:www\.)?(?:arxiv\.org|export\.arxiv\.org|openreview\.net)\//i.test(
      trimmed,
    )
      ? `https://${trimmed}`
      : trimmed;
  if (/^openreview:/i.test(value))
    return { provider: "openreview", id: parseOpenReviewId(value.slice(11)) };
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password || url.port)
      throw new Error("논문의 공식 링크를 입력해 주세요.");
    if (["openreview.net", "www.openreview.net"].includes(url.hostname)) {
      if (
        !["/forum", "/pdf"].includes(url.pathname.replace(/\/$/, "")) ||
        url.searchParams.getAll("id").length !== 1
      )
        throw new Error(
          "OpenReview의 forum?id=… 또는 pdf?id=… 링크를 입력해 주세요.",
        );
      return {
        provider: "openreview",
        id: parseOpenReviewId(url.searchParams.get("id") || ""),
      };
    }
    if (
      !["arxiv.org", "www.arxiv.org", "export.arxiv.org"].includes(url.hostname)
    )
      throw new Error("현재 arXiv와 OpenReview 논문 링크를 지원해요.");
  }
  return { provider: "arxiv", id: parseArxivId(value) };
}
export function paperReference(
  paper: Pick<Paper, "arxivId" | "openreviewId">,
): PaperReference {
  if (paper.openreviewId)
    return {
      provider: "openreview",
      id: parseOpenReviewId(paper.openreviewId),
    };
  return { provider: "arxiv", id: parseArxivId(paper.arxivId || "") };
}
export const documentId = (ref: PaperReference) =>
  ref.provider === "arxiv" ? ref.id : `openreview:${ref.id}`;
export const paperProviderName = (paper: Pick<Paper, "openreviewId">) =>
  paper.openreviewId ? "OpenReview" : "arXiv";
export const paperDisplayId = (
  paper: Pick<Paper, "arxivId" | "openreviewId">,
) => `${paperProviderName(paper)}:${paper.openreviewId || paper.arxivId || ""}`;
export const paperUrl = (ref: PaperReference) =>
  ref.provider === "arxiv"
    ? `https://arxiv.org/abs/${ref.id}`
    : `https://openreview.net/forum?id=${encodeURIComponent(ref.id)}`;
export const paperPdfUrl = (ref: PaperReference) =>
  ref.provider === "arxiv"
    ? `https://arxiv.org/pdf/${ref.id}`
    : `https://openreview.net/pdf?id=${encodeURIComponent(ref.id)}`;
export const sourceUrl = (ref: PaperReference, format: "html" | "pdf") =>
  `/api/source?id=${encodeURIComponent(documentId(ref))}&format=${format}`;
