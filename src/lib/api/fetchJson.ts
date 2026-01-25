// Tiny fetch helper for admin clients that normalizes JSON parsing without changing API error shapes.
// Use this for client-side calls and map 401/403 to localized messaging in the caller.
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false;
  status: number;
  error?: string;
  details?: unknown;
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

type ErrorPayload = { error?: string; message?: string } | null;

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    let payload: unknown = undefined;
    if (isJson) {
      try {
        payload = (await res.json()) as unknown;
      } catch {
        payload = undefined;
      }
    }

    if (res.ok) {
      if (!isJson) {
        // Keep non-JSON responses as failures so callers can decide how to recover.
        return { ok: false, status: res.status };
      }
      return { ok: true, data: payload as T };
    }

    const errorPayload = (payload ?? null) as ErrorPayload;
    const error =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : typeof errorPayload?.message === "string"
          ? errorPayload.message
          : undefined;

    return {
      ok: false,
      status: res.status,
      error,
      details: payload,
    };
  } catch (error) {
    // Network errors surface as status 0 to keep error handling consistent in callers.
    return { ok: false, status: 0, details: error };
  }
}
