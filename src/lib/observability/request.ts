// Server-only request helpers keep request IDs available in App Router contexts.
import "server-only";

type HeaderSource = { get: (name: string) => string | null };
type RequestLike = Request | { headers: HeaderSource };

export function getRequestId(request?: RequestLike): string | null {
  if (!request?.headers) return null;

  const value = request.headers.get("x-request-id");
  return value?.trim() || null;
}
