import { z } from "zod";
import { paperSchema, type Paper } from "../src/lib/model";
import { parseOpenReviewId } from "../src/lib/paper-reference";
import { HttpError, boundedText } from "./security";
const hosts = ["https://api2.openreview.net", "https://api.openreview.net"];
const noteSchema = z.object({
  id: z.string(),
  forum: z.string().optional(),
  replyto: z.string().nullable().optional(),
  readers: z.array(z.string()),
  content: z.record(z.string(), z.unknown()),
  cdate: z.number().optional(),
  tcdate: z.number().optional(),
  pdate: z.number().nullable().optional(),
  odate: z.number().nullable().optional(),
  ddate: z.number().nullable().optional(),
});
type Note = z.infer<typeof noteSchema>;
const headers = {
  "User-Agent": "PaperPalace/0.1 (https://paperpalace.minjaek.im)",
  Accept: "application/json",
};
// Both API generations are supported, but authentication failures never trigger
// credential reuse, scraping, or a fallback that could expose private submissions.
async function request(url: string) {
  const r = await fetch(url, {
    headers,
    // Workers support manual/follow only. Never follow redirects to a challenge
    // page or another host, including for PDF requests.
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 401 || r.status === 403)
    throw new HttpError(
      403,
      "OpenReview에서 접근 인증을 요구하고 있어 지금은 가져올 수 없어요. 공개 논문인지 확인한 뒤 다시 시도해 주세요.",
    );
  if (r.status === 429)
    throw new HttpError(
      429,
      "OpenReview 요청이 많아요. 잠시 후 다시 시도해 주세요.",
    );
  if (!r.ok && r.status !== 404)
    throw new HttpError(
      502,
      "OpenReview에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  return r;
}
function content(note: Note, key: string): unknown {
  const field = note.content[key];
  if (field && typeof field === "object" && !Array.isArray(field)) {
    const wrapped = field as { value?: unknown; readers?: unknown };
    if (Array.isArray(wrapped.readers) && !wrapped.readers.includes("everyone"))
      return undefined;
    return wrapped.value;
  }
  return field;
}
async function findNote(id: string): Promise<{ note: Note; host: string }> {
  for (const host of hosts) {
    const r = await request(`${host}/notes?id=${encodeURIComponent(id)}`);
    if (r.status === 404) continue;
    const parsed = z
      .object({ notes: z.array(noteSchema).max(10) })
      .safeParse(JSON.parse(await boundedText(r, 2000000)));
    if (!parsed.success)
      throw new HttpError(502, "OpenReview 논문 정보를 확인하지 못했어요.");
    const note = parsed.data.notes.find((n) => n.id === id);
    if (!note) continue;
    if (note.ddate || !note.readers.includes("everyone"))
      throw new HttpError(403, "공개된 OpenReview 논문만 추가할 수 있어요.");
    return { note, host };
  }
  throw new HttpError(
    404,
    "OpenReview에서 논문을 찾지 못했어요. 링크와 공개 여부를 확인해 주세요.",
  );
}
export async function openReviewSubmission(input: string) {
  const id = parseOpenReviewId(input);
  let found = await findNote(id);
  if (found.note.forum && found.note.forum !== found.note.id)
    found = await findNote(parseOpenReviewId(found.note.forum));
  const { note } = found;
  if (
    note.replyto ||
    (note.forum && note.forum !== note.id) ||
    typeof content(note, "title") !== "string" ||
    typeof content(note, "pdf") !== "string" ||
    !content(note, "pdf")
  )
    throw new HttpError(
      422,
      "논문 PDF가 공개된 OpenReview 제출 페이지의 링크를 입력해 주세요.",
    );
  return found;
}
export async function importOpenReview(input: string): Promise<Paper> {
  const { note } = await openReviewSubmission(input);
  const text = (key: string) =>
    typeof content(note, key) === "string"
      ? (content(note, key) as string).trim()
      : "";
  const strings = (key: string) =>
    Array.isArray(content(note, key))
      ? (content(note, key) as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
  const now = new Date().toISOString();
  const date = note.pdate || note.odate || note.cdate || note.tcdate;
  const published =
    date && Number.isFinite(date) && date > 0 && date < 8640000000000000
      ? new Date(date).toISOString().slice(0, 10)
      : "";
  const parsed = paperSchema.safeParse({
    id: `openreview:${note.id}`,
    openreviewId: note.id,
    title: text("title"),
    authors: strings("authors"),
    abstract: text("abstract"),
    published,
    categories: strings("keywords"),
    ...(text("venue") ? { venue: text("venue") } : {}),
    addedAt: now,
    updatedAt: now,
    status: "unread",
    tags: [],
    notes: "",
    analysis: null,
    analysisMeta: null,
  });
  if (!parsed.success)
    throw new HttpError(
      422,
      "OpenReview 논문 정보가 지원하는 형식이나 크기를 벗어났어요.",
    );
  return parsed.data;
}
export async function openReviewPdf(input: string) {
  const { note, host } = await openReviewSubmission(input);
  return request(`${host}/pdf?id=${encodeURIComponent(note.id)}`);
}
