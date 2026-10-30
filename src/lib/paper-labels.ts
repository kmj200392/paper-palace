import { z } from "zod";
import type { Library, Paper } from "./model";

export const labelBatchSize = 20;
export const graphLabelSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^\S+(?: \S+)?$/);
export const paperLabelsSchema = z.object({
  labels: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        label: graphLabelSchema,
      }),
    )
    .min(1)
    .max(labelBatchSize),
});
export type PaperLabelInput = Pick<Paper, "id" | "title" | "abstract">;
export type PaperLabel = z.infer<typeof paperLabelsSchema>["labels"][number];
export const labelInput = (paper: PaperLabelInput): PaperLabelInput => ({
  id: paper.id,
  title: paper.title,
  abstract: paper.abstract.slice(0, 4000),
});
export const labelFingerprint = (paper: PaperLabelInput) =>
  JSON.stringify(labelInput(paper));

// A readable placeholder while offline or waiting for AI; never saved as an AI name.
export function graphPaperLabel(paper: Pick<Paper, "title" | "graphLabel">) {
  if (paper.graphLabel) return paper.graphLabel;
  const prefix = paper.title.split(/[:：]/)[0].trim();
  if (graphLabelSchema.safeParse(prefix).success) return prefix;
  const words =
    paper.title.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’._-]*/gu) || [];
  const word =
    words.find((w) => !/^(a|an|the|on|towards?|with|for|in|of)$/i.test(w)) ||
    words[0] ||
    "Paper";
  return word.length > 32 ? word.slice(0, 31) + "…" : word;
}

export function applyPaperLabels(
  library: Library,
  requested: PaperLabelInput[],
  labels: PaperLabel[],
): Library {
  const inputs = new Map(requested.map((p) => [p.id, labelFingerprint(p)]));
  const names = new Map(labels.map((label) => [label.id, label.label]));
  const now = new Date().toISOString();
  let changed = false;
  const papers = library.papers.map((paper) => {
    const name = names.get(paper.id);
    if (
      !name ||
      paper.graphLabel ||
      inputs.get(paper.id) !== labelFingerprint(paper)
    )
      return paper;
    changed = true;
    return {
      ...paper,
      graphLabel: graphLabelSchema.parse(name),
      updatedAt: now,
    };
  });
  return changed ? { ...library, papers, updatedAt: now } : library;
}
