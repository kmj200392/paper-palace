export const bytesToBase64 = (b: Uint8Array) => {
  const chunks: string[] = [];
  for (let offset = 0; offset < b.length; offset += 32768) {
    chunks.push(String.fromCharCode(...b.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join(""));
};
export const base64ToBytes = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const url64 = (s: string) =>
  s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = () =>
  url64(bytesToBase64(crypto.getRandomValues(new Uint8Array(32))));
export async function challenge(verifier: string) {
  return url64(
    bytesToBase64(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    ),
  );
}
async function key(secret: string) {
  if (secret.length < 32) throw new Error("Session secret is not configured");
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(data: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}
export async function unseal<T extends { expires: number }>(
  value: string,
  secret: string,
): Promise<T | null> {
  try {
    const [iv, payload] = value.split(".");
    const data = JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(iv) },
          await key(secret),
          base64ToBytes(payload),
        ),
      ),
    );
    return typeof data.expires === "number" && data.expires > Date.now()
      ? (data as T)
      : null;
  } catch {
    return null;
  }
}
export function cookieValue(request: Request, name: string) {
  return (
    (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export const cookie = (name: string, value: string, age: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export function sameOrigin(request: Request, origin: string) {
  return request.headers.get("origin") === origin;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function boundedText(response: Response | Request, limit: number) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new HttpError(413, "문서가 너무 커요. 더 작은 문서를 사용해 주세요.");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let count = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    count += value.byteLength;
    if (count > limit) {
      await reader.cancel();
      throw new HttpError(413, "허용된 문서 크기를 초과했어요.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(count);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}
