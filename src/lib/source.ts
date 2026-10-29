import {
  type Block,
  type Source,
  type Paper,
  parseArxivId,
  baseId,
} from "./model";
import { loadSource, saveSource } from "./storage";
import { api } from "./api";
export async function importPaper(input: string): Promise<Paper> {
  const id = parseArxivId(input);
  const { html } = await api<{ html: string }>(
    `/paper?id=${encodeURIComponent(id)}`,
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (n: string) =>
    doc.querySelector(`meta[name="${n}"]`)?.getAttribute("content") || "";
  const title = meta("citation_title");
  if (!title)
    throw new Error("논문 정보를 찾지 못했어요. arXiv ID를 확인해 주세요.");
  const canonical =
    doc.querySelector('meta[property="og:url"]')?.getAttribute("content") || "";
  const version = /v\d+$/.test(id)
    ? id
    : canonical.split("/abs/")[1] ||
      meta("citation_pdf_url")
        .split("/pdf/")[1]
        ?.replace(/\.pdf$/, "") ||
      id;
  const arxivId = parseArxivId(version);
  const now = new Date().toISOString();
  return {
    id: baseId(arxivId),
    arxivId,
    title,
    authors: [...doc.querySelectorAll('meta[name="citation_author"]')].map(
      (e) => e.getAttribute("content") || "",
    ),
    abstract: (
      doc.querySelector("blockquote.abstract")?.textContent ||
      meta("citation_abstract")
    )
      .replace(/^\s*Abstract:\s*/, "")
      .trim(),
    published: meta("citation_date"),
    categories: (doc.querySelector(".subjects")?.textContent || "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean),
    addedAt: now,
    updatedAt: now,
    status: "unread",
    tags: [],
    notes: "",
    analysis: null,
    analysisMeta: null,
  };
}
export async function getSource(
  arxivId: string,
  onProgress?: (s: string) => void,
): Promise<Source> {
  const cached = await loadSource(arxivId);
  if (cached) return cached;
  onProgress?.("논문 원문을 가져오는 중…");
  let blocks: Block[] = [],
    format: "html" | "pdf" = "html";
  const htmlRes = await fetch(
    `/api/source?id=${encodeURIComponent(arxivId)}&format=html`,
  );
  if (htmlRes.ok) {
    const doc = new DOMParser().parseFromString(
      await htmlRes.text(),
      "text/html",
    );
    const article =
      doc.querySelector("article.ltx_document") || doc.querySelector("article");
    if (article) {
      article
        .querySelectorAll(
          "script,style,nav,footer,.ltx_bibliography,.ltx_role_affiliation,.ltx_role_email",
        )
        .forEach((e) => e.remove());
      article.querySelectorAll("math").forEach((e) => {
        e.replaceWith(
          doc.createTextNode(e.getAttribute("alttext") || e.textContent || ""),
        );
      });
      const elements = [
        ...article.querySelectorAll("h1,h2,h3,h4,p.ltx_p,table"),
      ];
      blocks = elements
        .filter((e) => !e.closest("table") || e.tagName === "TABLE")
        .flatMap((e, i) => {
          const text = (e.textContent || "").replace(/\s+/g, " ").trim();
          const chunks = text.match(/[\s\S]{1,30000}/g) || [];
          return chunks.map((text, j) => ({
            id: chunks.length === 1 ? `b${i + 1}` : `b${i + 1}-${j}`,
            kind: (/^H\d$/.test(e.tagName)
              ? "heading"
              : e.tagName === "TABLE"
                ? "table"
                : "paragraph") as Block["kind"],
            text,
          }));
        })
        .filter((b) => b.text.length > 1);
    }
  }
  if (blocks.filter((b) => b.kind === "paragraph").length < 5) {
    format = "pdf";
    onProgress?.("HTML 원문이 없어 PDF를 읽고 있어요…");
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const loading = pdfjs.getDocument({
      url: `/api/source?id=${encodeURIComponent(arxivId)}&format=pdf`,
    });
    const pdf = await loading.promise;
    if (pdf.numPages > 120) {
      await loading.destroy();
      throw new Error("120쪽을 넘는 문서는 현재 지원하지 않아요.");
    }
    blocks = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      onProgress?.(`PDF 원문을 읽는 중 · ${page}/${pdf.numPages}쪽`);
      const p = await pdf.getPage(page),
        content = await p.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item
            ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
            : "",
        )
        .join("")
        .trim();
      const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
      for (let j = 0; j < paragraphs.length; j++) {
        const chunks = paragraphs[j].match(/[\s\S]{1,7000}/g) || [];
        chunks.forEach((chunk, k) =>
          blocks.push({
            id: `p${page}-${j}-${k}`,
            kind: "paragraph",
            text: chunk,
            page,
          }),
        );
      }
    }
    await loading.destroy();
  }
  if (blocks.reduce((n, b) => n + b.text.length, 0) < 800)
    throw new Error(
      "원문에서 충분한 텍스트를 추출하지 못했어요. 스캔 PDF는 지원하지 않아요.",
    );
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(blocks)),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const source: Source = { arxivId, blocks, format, hash };
  await saveSource(source);
  return source;
}
