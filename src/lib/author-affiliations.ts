import { z } from "zod";
import { parseArxivId } from "./model";

export const authorSourceSchema = z.object({
  arxivId: z
    .string()
    .max(80)
    .refine((id) => {
      try {
        return parseArxivId(id) === id;
      } catch {
        return false;
      }
    }),
  authors: z.array(z.string().min(1).max(300)).min(1).max(200),
  format: z.enum(["html", "pdf"]),
  text: z.string().min(20).max(16000),
});
export type AuthorSource = z.infer<typeof authorSourceSchema>;
const affiliationSchema = z.object({
  name: z.string().min(1).max(300),
  evidence: z.string().min(1).max(4000),
});
const personSchema = z.object({
  name: z.string().min(1).max(300),
  role: z.enum(["first", "co-first", "corresponding"]),
  evidence: z.string().max(4000),
  affiliations: z.array(affiliationSchema).max(6),
});
export const authorDetailsSchema = z.object({
  arxivId: z.string().max(80),
  format: z.enum(["html", "pdf"]),
  firstAuthors: z.array(personSchema).min(1).max(12),
  correspondingAuthors: z.array(personSchema).max(12),
});
export type AuthorDetails = z.infer<typeof authorDetailsSchema>;
export const authorDetailsResponseSchema = z.object({
  papers: z.array(authorDetailsSchema).max(6),
});

// Preserve markers and author-to-institution layout; the ordinary reader's
// source cache intentionally removes affiliation fields and cannot be reused.
export function authorFrontmatter(doc: Document): string {
  const article = doc.querySelector("article.ltx_document, article");
  if (!article) return "";
  const copy = article.cloneNode(true) as Element;
  copy.querySelectorAll("script,style,nav,footer").forEach((el) => el.remove());
  copy.querySelectorAll("sup").forEach((el) => {
    el.replaceWith(doc.createTextNode(` [${el.textContent || ""}] `));
  });
  copy
    .querySelectorAll("br")
    .forEach((el) => el.replaceWith(doc.createTextNode("\n")));
  const parts: string[] = [];
  for (const el of Array.from(copy.children)) {
    if (
      el.matches(".ltx_abstract, section, .ltx_section") ||
      el.querySelector(".ltx_abstract")
    )
      break;
    parts.push(el.textContent || "");
  }
  return parts
    .join("\n")
    .replace(/[\t\u00a0 ]+/g, " ")
    .trim()
    .slice(0, 16000);
}

export async function loadAuthorSource(
  paper: { arxivId: string; authors: string[] },
  signal: AbortSignal,
): Promise<AuthorSource | null> {
  const id = parseArxivId(paper.arxivId);
  if (!paper.authors.length) return null;
  let htmlText = "";
  try {
    const response = await fetch(
      `/api/source?id=${encodeURIComponent(id)}&format=html`,
      {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      },
    );
    if (response.ok) {
      const doc = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      htmlText = authorFrontmatter(doc);
      // Some conversions contain authors but omit the institutions entirely.
      const affiliations = Array.from(
        doc.querySelectorAll(".ltx_authors .ltx_role_affiliation"),
      ).map((el) =>
        (el.textContent || "").replace(/^\s*Affiliation\s*:\s*/i, "").trim(),
      );
      if (htmlText.length >= 20 && affiliations.some((s) => s.length > 4))
        return authorSourceSchema.parse({
          ...paper,
          arxivId: id,
          format: "html",
          text: htmlText,
        });
    } else await response.body?.cancel();
  } catch {
    /* Try the original PDF when HTML is missing or incomplete. */
  }
  if (signal.aborted) return null;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  let loading: { destroy: () => Promise<void> } | undefined;
  const abort = () => {
    void loading?.destroy().catch(() => {});
  };
  try {
    const pdfjs = await import("pdfjs-dist");
    if (deadline.aborted) return null;
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      url: `/api/source?id=${encodeURIComponent(id)}&format=pdf`,
      disableAutoFetch: true,
    });
    loading = task;
    deadline.addEventListener("abort", abort, { once: true });
    const pdf = await task.promise;
    const parts: string[] = [];
    for (let n = 1; n <= Math.min(2, pdf.numPages); n++) {
      if (deadline.aborted) return null;
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      parts.push(
        `PDF page ${n}\n` +
          content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join(""),
      );
      page.cleanup();
    }
    const text = parts.join("\n").trim().slice(0, 16000);
    if (
      text.replace(/PDF page \d+/g, "").trim().length >= 20 &&
      !deadline.aborted
    )
      return authorSourceSchema.parse({
        ...paper,
        arxivId: id,
        format: "pdf",
        text,
      });
  } catch {
    /* Recommendations remain usable if the source cannot be read. */
  } finally {
    deadline.removeEventListener("abort", abort);
    await loading?.destroy().catch(() => {});
  }
  return !signal.aborted && htmlText.length >= 20
    ? authorSourceSchema.parse({
        ...paper,
        arxivId: id,
        format: "html",
        text: htmlText,
      })
    : null;
}

export async function loadAuthorSources(
  papers: { arxivId: string; authors: string[] }[],
  signal: AbortSignal,
): Promise<AuthorSource[]> {
  const found: AuthorSource[] = [];
  // At most two documents in flight; no automatic retries or source archive.
  for (let i = 0; i < Math.min(papers.length, 6) && !signal.aborted; i += 2) {
    const batch = await Promise.allSettled(
      papers.slice(i, i + 2).map((p) => loadAuthorSource(p, signal)),
    );
    for (const item of batch)
      if (item.status === "fulfilled" && item.value) found.push(item.value);
  }
  return found;
}
