export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const isAuthenticationError = (error: unknown) =>
  error instanceof ApiError && [401, 409].includes(error.status);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const data = await r.json().catch(() => {
    throw new ApiError(
      r.ok ? 502 : r.status,
      "서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  });
  if (!r.ok)
    throw new ApiError(r.status, data?.error || "요청을 처리하지 못했어요.");
  return data as T;
}
