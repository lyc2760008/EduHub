// Server-only logging wrapper attaches request IDs and redacts sensitive metadata.
import "server-only";

import { getRequestId } from "@/lib/observability/request";
import { redactSensitive } from "@/lib/observability/redaction";

type LogMeta = Record<string, unknown>;

type RequestLike = Request | { headers: Headers };

function buildPayload(meta?: LogMeta, request?: RequestLike) {
  const redactedMeta = meta ? (redactSensitive(meta) as LogMeta) : undefined;
  if (!request) {
    return redactedMeta;
  }

  const requestId = getRequestId(request);
  if (!requestId) {
    return redactedMeta;
  }

  return redactedMeta ? { requestId, ...redactedMeta } : { requestId };
}

export function logInfo(
  message: string,
  meta?: LogMeta,
  request?: RequestLike,
) {
  const payload = buildPayload(meta, request);
  if (payload) {
    console.info(message, payload);
    return;
  }
  console.info(message);
}

export function logWarn(
  message: string,
  meta?: LogMeta,
  request?: RequestLike,
) {
  const payload = buildPayload(meta, request);
  if (payload) {
    console.warn(message, payload);
    return;
  }
  console.warn(message);
}

export function logError(
  message: string,
  meta?: LogMeta,
  request?: RequestLike,
) {
  const payload = buildPayload(meta, request);
  if (payload) {
    console.error(message, payload);
    return;
  }
  console.error(message);
}
