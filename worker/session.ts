import type { DurableObjectState } from "@cloudflare/workers-types";
import { z } from "zod";
import {
  boundedText,
  cookie,
  cookieValue,
  HttpError,
  randomToken,
  seal,
  unseal,
} from "./security";

export const SESSION_AGE = 180 * 24 * 60 * 60;
const cookieName = "__Host-pp-session";
const unavailable =
  "로그인 연결을 잠시 확인하지 못했어요. 연결이 복구되면 다시 시도해 주세요.";
export interface SessionNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface SessionEnv {
  SESSION_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_SESSIONS?: SessionNamespace;
}
const userSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string(),
});
const legacySchema = userSchema.extend({
  token: z.string().min(1),
  expires: z.number(),
});
export type Session = z.infer<typeof legacySchema>;
const recordSchema = legacySchema.extend({
  accessExpires: z.number(),
  refreshToken: z.string().min(1).optional(),
});
type RecordData = z.infer<typeof recordSchema>;
const ticketSchema = z.object({
  kind: z.literal("github-session-v2"),
  sid: z.string().regex(/^[\w-]{43}$/),
  expires: z.number(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1).max(2000),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).max(2000).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});
export type GithubTokens = z.infer<typeof tokenSchema>;
function secret(env: SessionEnv, purpose: string) {
  if (env.SESSION_SECRET.length < 32) throw new HttpError(503, unavailable);
  return `${env.SESSION_SECRET}:${purpose}:v2`;
}
const ticketSecret = (env: SessionEnv) => secret(env, "session-ticket");
const recordSecret = (env: SessionEnv) => secret(env, "session-record");
const withTokens = (
  user: z.infer<typeof userSchema>,
  tokens: GithubTokens,
): RecordData => {
  const now = Date.now();
  const accessExpires =
    now + Math.min(tokens.expires_in || 28800, 28800) * 1000;
  return {
    ...user,
    token: tokens.access_token,
    accessExpires,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    expires:
      tokens.refresh_token && tokens.refresh_token_expires_in
        ? now + Math.min(tokens.refresh_token_expires_in, SESSION_AGE) * 1000
        : accessExpires,
  };
};
function stub(env: SessionEnv, sid: string) {
  if (!env.GITHUB_SESSIONS) throw new HttpError(503, unavailable);
  return env.GITHUB_SESSIONS.get(env.GITHUB_SESSIONS.idFromName(sid));
}
async function sessionRequest(
  env: SessionEnv,
  sid: string,
  method = "GET",
  body?: string,
) {
  try {
    const r = await stub(env, sid).fetch(
      new Request("https://session.internal/", { method, body }),
    );
    if (!r.ok && r.status !== 401) throw new HttpError(503, unavailable);
    return r;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, unavailable);
  }
}
async function sessionCookie(env: SessionEnv, sid: string, expires: number) {
  return cookie(
    cookieName,
    await seal({ kind: "github-session-v2", sid, expires }, ticketSecret(env)),
    Math.max(0, Math.floor((expires - Date.now()) / 1000)),
  );
}
export async function createSession(
  env: SessionEnv,
  user: unknown,
  input: unknown,
) {
  const record = withTokens(userSchema.parse(user), tokenSchema.parse(input));
  const sid = randomToken();
  const r = await sessionRequest(
    env,
    sid,
    "PUT",
    await seal(record, recordSecret(env)),
  );
  if (!r.ok) throw new HttpError(503, unavailable);
  return sessionCookie(env, sid, record.expires);
}
async function ticket(req: Request, env: SessionEnv) {
  const value = cookieValue(req, cookieName);
  if (!value || value.length > 4096) return null;
  const parsed = ticketSchema.safeParse(await unseal(value, ticketSecret(env)));
  return parsed.success ? parsed.data : null;
}
export async function readSession(req: Request, env: SessionEnv) {
  const value = cookieValue(req, cookieName);
  if (!value || value.length > 4096) return null;
  const t = await ticket(req, env);
  if (t) {
    const r = await sessionRequest(env, t.sid);
    if (r.status === 401) return null;
    const data = (await r.json()) as { renewable?: boolean };
    const session = legacySchema.parse(data);
    return {
      session,
      renewedCookie: await sessionCookie(env, t.sid, session.expires),
      renewable: data.renewable === true,
    };
  }
  // Pre-release cookies remain valid until their original eight-hour expiry.
  // Their refresh tokens were discarded, so they cannot be upgraded silently.
  const legacy = legacySchema.safeParse(
    await unseal(value, env.SESSION_SECRET),
  );
  return legacy.success
    ? { session: legacy.data, renewedCookie: undefined, renewable: false }
    : null;
}
export async function requireSession(req: Request, env: SessionEnv) {
  const result = await readSession(req, env);
  if (!result) throw new HttpError(401, "GitHub에 다시 로그인해 주세요.");
  return result.session;
}
export async function logoutSession(req: Request, env: SessionEnv) {
  const t = await ticket(req, env);
  if (t) await sessionRequest(env, t.sid, "DELETE");
  return cookie(cookieName, "", 0);
}

// Each browser login has its own object. Serialized rotation prevents two tabs
// from spending the same single-use GitHub refresh token. Only encrypted login
// credentials live here; research libraries and AI keys do not.
export class GithubSession {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private state: Pick<DurableObjectState, "storage">,
    private env: SessionEnv,
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  private async clear() {
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
  }
  private async read() {
    const value = await this.state.storage.get<string>("credentials");
    if (!value) return null;
    const parsed = recordSchema.safeParse(
      await unseal(value, recordSecret(this.env)),
    );
    return parsed.success ? parsed.data : null;
  }
  private async save(record: RecordData) {
    // Install cleanup before persisting so a later storage failure cannot leave
    // an unbounded orphan. Alarms re-check expiry after a renewal.
    await this.state.storage.setAlarm(record.expires);
    await this.state.storage.put(
      "credentials",
      await seal(record, recordSecret(this.env)),
    );
  }
  async alarm() {
    await this.serial(async () => {
      const current = await this.read();
      if (current) await this.state.storage.setAlarm(current.expires);
      else await this.clear();
    });
  }
  async fetch(req: Request): Promise<Response> {
    return this.serial(async () => {
      const json = (value: unknown, status = 200) =>
        Response.json(value, {
          status,
          headers: { "Cache-Control": "no-store" },
        });
      try {
        if (req.method === "DELETE") {
          await this.clear();
          return json({ ok: true });
        }
        if (req.method === "PUT") {
          if (await this.state.storage.get("credentials")) return json({}, 409);
          const data = recordSchema.parse(
            await unseal(await boundedText(req, 16000), recordSecret(this.env)),
          );
          await this.save(data);
          return json({ ok: true });
        }
        if (req.method !== "GET") return json({}, 405);
        let current = await this.read();
        if (!current) {
          await this.clear();
          return json({}, 401);
        }
        if (
          current.accessExpires <= Date.now() + 60000 &&
          current.refreshToken
        ) {
          let r: Response;
          try {
            r = await fetch("https://github.com/login/oauth/access_token", {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                client_id: this.env.GITHUB_CLIENT_ID,
                client_secret: this.env.GITHUB_CLIENT_SECRET,
                grant_type: "refresh_token",
                refresh_token: current.refreshToken,
              }),
              signal: AbortSignal.timeout(15000),
            });
          } catch {
            return json({ error: unavailable }, 503);
          }
          const data = (await r.json().catch(() => null)) as
            (GithubTokens & { error?: string }) | null;
          if (r.status >= 500 || r.status === 429)
            return json({ error: unavailable }, 503);
          if (
            [
              "bad_refresh_token",
              "invalid_grant",
              "expired_token",
              "invalid_refresh_token",
            ].includes(data?.error || "")
          ) {
            await this.clear();
            return json({}, 401);
          }
          const parsed = tokenSchema.safeParse(data);
          if (
            !r.ok ||
            !parsed.success ||
            !parsed.data.refresh_token ||
            !parsed.data.refresh_token_expires_in
          )
            return json({ error: unavailable }, 503);
          current = withTokens(userSchema.parse(current), parsed.data);
          // Persist the new pair before any request uses it. Old tokens are now invalid.
          await this.save(current);
        }
        if (current.accessExpires <= Date.now()) {
          await this.clear();
          return json({}, 401);
        }
        return json({
          ...legacySchema.parse(current),
          renewable: !!current.refreshToken,
        });
      } catch {
        return json({ error: unavailable }, 503);
      }
    });
  }
}
