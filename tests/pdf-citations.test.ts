import { test } from "node:test";
import assert from "node:assert/strict";
import { citationPdfMatches, appendPdfQuote } from "../src/lib/pdf-citations";

test("PDF citations tolerate line breaks, hyphenation, ligatures and typography without losing offsets", () => {
  const content =
    "Preface. Our re-\ntrieval method uses efﬁcient memory — café models. End.";
  const matches = citationPdfMatches(
    "Our retrieval method uses efficient memory cafe models",
    content,
  );
  assert.equal(matches.length, 1);
  assert.equal(
    content.slice(matches[0].index, matches[0].index + matches[0].length),
    "Our re-\ntrieval method uses efﬁcient memory — café models",
  );
});
test("PDF matching exposes multiple exact occurrences and Unicode offsets", () => {
  const phrase = "이 방법은 기억을 단계적으로 개선합니다";
  const content = `🧠 ${phrase}. More text. ${phrase}.`;
  const matches = citationPdfMatches(phrase, content);
  assert.equal(matches.length, 2);
  for (const m of matches)
    assert.equal(content.slice(m.index, m.index + m.length), phrase);
});
test("PDF citation matching does not invent locations for partial or absent evidence", () => {
  assert.deepEqual(
    citationPdfMatches("Attention", "Attention Is All You Need"),
    [],
  );
  assert.deepEqual(
    citationPdfMatches(
      "Our method beats all baselines",
      "Our method uses memory. All baselines use search.",
    ),
    [],
  );
  assert.deepEqual(citationPdfMatches("", ""), []);
});
test("PDF quote notes preserve existing content and reject length overflow", () => {
  assert.equal(
    appendPdfQuote("MY ORIGINAL NOTES", "A selected\n sentence", 3),
    "MY ORIGINAL NOTES\n\n> A selected sentence\n— PDF 3쪽",
  );
  assert.equal(
    appendPdfQuote("x".repeat(29990), "A selected sentence", 3),
    null,
  );
  assert.equal(appendPdfQuote("Keep", " ", 1), null);
});
