// Shared redaction helpers keep observability payloads free of secrets and PII.
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|token|accesscode|access_code|password|secret|session|csrf|api[-_]?key|client_secret|private_key)/i;
const REDACTED_VALUE = "[REDACTED]";
const MAX_DEPTH = 6;
const MAX_ENTRIES = 50;

type PlainRecord = Record<string, unknown>;

type SentryRequest = {
  headers?: Record<string, string> | Array<[string, string]> | null;
  cookies?: Record<string, string> | string | null;
  data?: unknown;
  url?: string | null;
};

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHeaderEntries(
  headers?: Record<string, string> | Array<[string, string]> | null,
) {
  if (!headers) return undefined;
  if (Array.isArray(headers)) {
    return headers;
  }
  return Object.entries(headers);
}

function sanitizeHeaderValue(key: string, value: string) {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED_VALUE;
  }
  return value;
}

function sanitizeHeaders(
  headers?: Record<string, string> | Array<[string, string]> | null,
) {
  const entries = normalizeHeaderEntries(headers);
  if (!entries) return undefined;

  const sanitized: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey).toLowerCase();
    const value = sanitizeHeaderValue(key, String(rawValue));
    sanitized[key] = value;
  }

  return sanitized;
}

function extractRequestId(headers?: Record<string, string>) {
  if (!headers) return null;
  const value = headers["x-request-id"];
  return value ? value.trim() : null;
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return REDACTED_VALUE;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ENTRIES).map((entry) => redactSensitive(entry, depth + 1));
  }

  if (isPlainRecord(value)) {
    const entries = Object.entries(value).slice(0, MAX_ENTRIES);
    const cleaned: PlainRecord = {};
    for (const [key, entryValue] of entries) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        cleaned[key] = REDACTED_VALUE;
        continue;
      }
      cleaned[key] = redactSensitive(entryValue, depth + 1);
    }
    return cleaned;
  }

  return value;
}

export function redactSentryEvent<T>(event: T): T {
  // Create a shallow copy so we can safely mutate fields for redaction.
  const nextEvent = { ...(event as Record<string, unknown>) } as Record<
    string,
    unknown
  >;
  const rawRequest = (nextEvent.request ?? undefined) as SentryRequest | undefined;
  const request = rawRequest ? { ...rawRequest } : undefined;
  const sanitizedHeaders = sanitizeHeaders(request?.headers ?? undefined);

  if (request) {
    request.headers = sanitizedHeaders ?? undefined;
    request.cookies = undefined;
    request.data = undefined;
    nextEvent.request = request;
  }

  const requestId = extractRequestId(sanitizedHeaders);
  if (requestId) {
    const rawTags = (nextEvent.tags ?? {}) as Record<string, string>;
    nextEvent.tags = { ...rawTags, request_id: requestId };
  }

  // Drop user context entirely to avoid any accidental PII capture.
  nextEvent.user = undefined;

  if (nextEvent.extra) {
    nextEvent.extra = redactSensitive(nextEvent.extra) as PlainRecord;
  }

  if (nextEvent.contexts) {
    nextEvent.contexts = redactSensitive(nextEvent.contexts) as PlainRecord;
  }

  return nextEvent as T;
}
