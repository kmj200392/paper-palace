import { z } from "zod";
import {
  blockSchema,
  citationSchema,
  citationMatches,
  type Block,
} from "./model";

export const chatQuoteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  page: z.number().int().min(1).max(120),
});
export type ChatQuote = z.infer<typeof chatQuoteSchema>;
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(16000),
  quote: chatQuoteSchema.optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export const chatDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(1500),
    blocks: z.array(blockSchema).min(1).max(1500),
    contextComplete: z.boolean(),
    messages: z.array(chatMessageSchema).min(1).max(21),
  })
  .superRefine((data, ctx) => {
    if (
      data.blocks.reduce((n, b) => n + b.text.length, 0) > 120000 ||
      data.messages.reduce(
        (n, m) => n + m.content.length + (m.quote?.text.length || 0),
        0,
      ) > 60000
    )
      ctx.addIssue({
        code: "custom",
        message: "대화가 너무 길어요. 새 대화를 시작해 주세요.",
      });
    if (new Set(data.blocks.map((b) => b.id)).size !== data.blocks.length)
      ctx.addIssue({ code: "custom", message: "중복된 원문 블록이에요." });
    if (
      data.messages.some(
        (m, i) =>
          m.role !== (i % 2 === 0 ? "user" : "assistant") ||
          (m.role === "assistant" && m.quote),
      ) ||
      data.messages.at(-1)?.role !== "user"
    )
      ctx.addIssue({ code: "custom", message: "대화 순서를 확인해 주세요." });
  });
export const chatAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(16000),
  citations: z.array(citationSchema).max(8),
});
export type ChatAnswer = z.infer<typeof chatAnswerSchema>;
export function verifiedChatAnswer(answer: ChatAnswer, blocks: Block[]) {
  return {
    ...answer,
    citations: answer.citations.filter((c) => citationMatches(c, blocks)),
  };
}
// Keep complete turns together and bound every request, including long replies.
export function chatHistory(
  history: ChatMessage[],
  next: ChatMessage,
): ChatMessage[] {
  const kept = [...history.slice(-20), next];
  while (
    kept.length > 1 &&
    kept.reduce(
      (n, m) => n + m.content.length + (m.quote?.text.length || 0),
      0,
    ) > 60000
  )
    kept.splice(0, 2);
  return kept;
}
export function chatContext(blocks: Block[], message: ChatMessage) {
  if (blocks.reduce((n, b) => n + b.text.length, 0) <= 120000)
    return { blocks, contextComplete: true };
  const query = `${message.content} ${message.quote?.text || ""}`.toLowerCase();
  const terms = [...new Set(query.match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(
    0,
    80,
  );
  const ranked = blocks
    .map((b, index) => ({
      index,
      score:
        terms.reduce(
          (n, t) => n + (b.text.toLowerCase().includes(t) ? 1 : 0),
          0,
        ) + (message.quote && message.quote.page === b.page ? 20 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const priority = [
    ...ranked
      .filter(({ score }) => score > 0)
      .slice(0, 30)
      .flatMap(({ index }) => [index, index - 1, index + 1]),
    ...blocks.slice(0, 6).map((_, i) => i),
    ...blocks.map((_, i) => i),
  ];
  const selected = new Set<number>();
  let chars = 0;
  for (const i of priority) {
    if (selected.has(i) || !blocks[i] || chars + blocks[i].text.length > 120000)
      continue;
    selected.add(i);
    chars += blocks[i].text.length;
  }
  return {
    blocks: blocks.filter((_, i) => selected.has(i)),
    contextComplete: false,
  };
}
