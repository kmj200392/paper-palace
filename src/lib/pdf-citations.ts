function indexedText(text: string) {
  let normalized = "",
    offset = 0;
  const starts: number[] = [],
    ends: number[] = [];
  for (const char of text) {
    const clean = char
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
    normalized += clean;
    for (let i = 0; i < clean.length; i++) {
      starts.push(offset);
      ends.push(offset + char.length);
    }
    offset += char.length;
  }
  return { normalized, starts, ends };
}

// Exact content matching after typography normalization, never fuzzy page guessing.
// Offsets refer to PDF.js's input text so its highlighter can map back to glyphs.
export function citationPdfMatches(quote: string, pageContent: string) {
  const needle = indexedText(quote).normalized;
  if (needle.length < 16) return [];
  const { normalized, starts, ends } = indexedText(pageContent);
  const matches: { index: number; length: number }[] = [];
  let offset = normalized.indexOf(needle);
  while (offset !== -1 && matches.length < 1000) {
    const index = starts[offset];
    matches.push({ index, length: ends[offset + needle.length - 1] - index });
    offset = normalized.indexOf(needle, offset + needle.length);
  }
  return matches;
}

export function appendPdfQuote(notes: string, selection: string, page: number) {
  const quote = selection.replace(/\s+/g, " ").trim();
  if (!quote || quote.length > 2000 || !Number.isInteger(page) || page < 1)
    return null;
  const next = `${notes}${notes ? "\n\n" : ""}> ${quote}\n— PDF ${page}쪽`;
  return next.length <= 30000 ? next : null;
}
