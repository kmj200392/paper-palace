import type { DurableObjectState } from "@cloudflare/workers-types";
import { z } from "zod";
import { boundedText, HttpError } from "./security";
import {
  arxivSearchQuery,
  parseArxivFeed,
  searchPlanSchema,
} from "./discovery";
import type { Candidate } from "../src/lib/recommendations";

export interface SearchNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
// One globally named instance serializes all arXiv API access. Only the last
// request time is persisted; the small public-metadata cache is ephemeral.
export class ArxivSearch {
  private busy = false;
  private cache = new Map<string, { expires: number; papers: Candidate[] }>();
  constructor(private state: Pick<DurableObjectState, "storage">) {}
  async fetch(request: Request): Promise<Response> {
    const respond = (value: unknown, status = 200) =>
      Response.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    let plan: z.infer<typeof searchPlanSchema>;
    try {
      plan = searchPlanSchema.parse(
        JSON.parse(await boundedText(request, 5000)),
      );
    } catch {
      return respond({ error: "검색어 형식을 확인해 주세요." }, 400);
    }
    const query = arxivSearchQuery(plan),
      key = plan.sort + query;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now())
      return respond({ papers: cached.papers });
    if (this.busy)
      return respond(
        { error: "논문 검색이 잠시 붐비고 있어요. 잠시 후 다시 찾아 주세요." },
        429,
      );
    this.busy = true;
    try {
      const previous =
        (await this.state.storage.get<number>("last-request")) || 0;
      const wait = Math.max(0, previous + 3100 - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      await this.state.storage.put("last-request", Date.now());
      const url = new URL("https://export.arxiv.org/api/query");
      url.search = new URLSearchParams({
        search_query: query,
        start: "0",
        max_results: "40",
        sortBy: plan.sort,
        sortOrder: "descending",
      }).toString();
      const response = await fetch(url, {
        headers: {
          "User-Agent": "PaperPalace/0.1 (https://paperpalace.minjaek.im)",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpError(
          502,
          "arXiv 검색에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      }
      const papers = parseArxivFeed(await boundedText(response, 1000000));
      if (this.cache.size >= 16)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { papers, expires: Date.now() + 3600000 });
      return respond({ papers });
    } catch (error) {
      return respond(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "arXiv 검색이 지연되고 있어요. 잠시 후 다시 시도해 주세요.",
        },
        502,
      );
    } finally {
      this.busy = false;
    }
  }
}
