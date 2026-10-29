import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisSchema,
  analysisOutputSchema,
  verifyAnalysis,
  sectionKeys,
  librarySchema,
  emptyLibrary,
} from "../src/lib/model";

const point = {
  heading: "입력과 처리 과정",
  text: "먼저 입력을 벡터로 표현한다. 각 성분이 어떤 역할을 하는지 설명한다.\n\n다음 단계에서는 이 표현을 결합한다. 입력에서 출력으로 이어지는 관계를 설명한다.",
  citations: [
    { blockId: "b1", quote: "Each input is represented as a vector." },
  ],
};
const explanation = {
  positioning: "이 연구가 다루는 문제와 구체적 기여를 연결한 설명.",
  tags: ["representation"],
  limitations: ["제공된 원문에는 평가 지표가 보고되어 있지 않다."],
  sections: {
    motivation: [point],
    coreConcept: [point],
    method: Array.from({ length: 8 }, () => ({ ...point })),
    experimentalSetup: [point],
    results: [point],
  },
};

test("detailed explanations keep headings, paragraphs and verified evidence through library export", () => {
  const parsed = analysisOutputSchema.parse(explanation);
  const verified = verifyAnalysis(parsed, [
    { id: "b1", kind: "paragraph", text: point.citations[0].quote },
  ]);
  const library = emptyLibrary();
  library.papers.push({
    id: "1706.03762",
    arxivId: "1706.03762v7",
    title: "Test paper",
    authors: [],
    abstract: "",
    published: "",
    categories: [],
    addedAt: library.updatedAt,
    updatedAt: library.updatedAt,
    status: "reading",
    tags: [],
    notes: "My notes",
    analysis: verified,
    analysisMeta: {
      provider: "openai",
      model: "gpt-6-luna",
      createdAt: library.updatedAt,
      sourceHash: "test",
      coverage: "Test source",
      explanationVersion: 2,
    },
  });
  const restored = librarySchema.parse(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(restored.papers[0].analysis, explanation);
  assert.equal(restored.papers[0].analysisMeta?.explanationVersion, 2);
  assert.equal(restored.papers[0].notes, "My notes");
});

test("old summaries remain readable while new generations require titled nonempty sections", () => {
  const legacy = structuredClone(explanation);
  const oldPoint = { text: "기존에 저장한 짧은 요약", citations: [] };
  const oldSections = Object.fromEntries(
    sectionKeys.map((key) => [key, key === "motivation" ? [oldPoint] : []]),
  );
  const oldSummary = { ...legacy, sections: oldSections };
  assert(analysisSchema.safeParse(oldSummary).success);
  assert(!analysisOutputSchema.safeParse(oldSummary).success);
  assert(
    !analysisOutputSchema.safeParse({
      ...explanation,
      sections: { ...explanation.sections, results: [] },
    }).success,
  );
});
