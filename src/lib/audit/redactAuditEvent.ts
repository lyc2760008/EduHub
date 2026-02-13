// Server-only audit redaction transform enforces strict safe-field output for list/detail/export.
import "server-only";

import type {
  AuditActorType,
  AuditEventResult,
  Prisma,
} from "@/generated/prisma/client";
import type { AuditEventQueryRow } from "@/lib/audit/queryAuditEvents";

type SafeMetadataValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, number>;

export type RedactedAuditEvent = {
  id: string;
  occurredAt: string;
  actorType: AuditActorType;
  actorId: string | null;
  actorDisplay: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityDisplay: string | null;
  result: AuditEventResult;
  correlationId: string | null;
  metadata: Record<string, SafeMetadataValue> | null;
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;
const SENSITIVE_FIELD_PATTERN =
  /(token|secret|password|authorization|cookie|set-cookie|smtp|magic|access[_-]?code|api[_-]?key|email|ip|header)/i;

// Metadata is allowlisted by key to ensure unknown payload fragments are dropped by default.
const SAFE_METADATA_KEYS = new Set<string>([
  "fromStatus",
  "toStatus",
  "errorCode",
  "sessionsCreatedCount",
  "sessionsUpdatedCount",
  "sessionsSkippedCount",
  "sessionsAffectedCount",
  "canceledCount",
  "rowsUpdatedCount",
  "updatedCount",
  "clearedCount",
  "studentsAddedCount",
  "totalFutureSessions",
  "reasonCode",
  "dateRangeFrom",
  "dateRangeTo",
  "inputRangeFrom",
  "inputRangeTo",
  "presentCount",
  "absentCount",
  "lateCount",
  "excusedCount",
  "method",
  "studentContextId",
  "rowCount",
  "totalCount",
  "sortField",
  "sortDir",
  "exportTruncated",
  "searchProvided",
  "filterKeys",
  "sessionId",
  "resourceId",
  "type",
  "sessionCount",
  "resourcesAttempted",
  "resourcesCreated",
  "duplicatesSkipped",
]);

const STATUS_COUNT_KEYS = new Set([
  "statusCounts",
  "statusCountsDelta",
  "attendanceCounts",
]);

function normalizeActorDisplay(actorDisplay: string | null | undefined) {
  if (!actorDisplay) return null;
  const trimmed = actorDisplay.trim();
  if (!trimmed) return null;
  // Never expose raw email addresses in audit read APIs.
  if (EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

function sanitizeMetadataString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return null;
  if (EMAIL_PATTERN.test(trimmed)) return null;
  if (IPV4_PATTERN.test(trimmed)) return null;
  if (SENSITIVE_FIELD_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function sanitizeCountRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  const safeEntries = entries
    .filter(([key, count]) => {
      if (SENSITIVE_FIELD_PATTERN.test(key)) return false;
      return typeof count === "number" && Number.isFinite(count);
    })
    .slice(0, 20);
  if (!safeEntries.length) return null;
  return Object.fromEntries(safeEntries) as Record<string, number>;
}

function sanitizeMetadataValue(
  key: string,
  value: unknown,
): SafeMetadataValue | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return sanitizeMetadataString(value);

  if (Array.isArray(value) && key === "filterKeys") {
    const safeValues = value
      .filter((entry) => typeof entry === "string")
      .map((entry) => sanitizeMetadataString(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 20);
    return safeValues.length ? safeValues : null;
  }

  if (STATUS_COUNT_KEYS.has(key)) {
    return sanitizeCountRecord(value);
  }

  return null;
}

function sanitizeMetadata(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const sanitized: Record<string, SafeMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_PATTERN.test(key)) continue;
    if (!SAFE_METADATA_KEYS.has(key) && !STATUS_COUNT_KEYS.has(key)) continue;
    const safeValue = sanitizeMetadataValue(key, value);
    if (safeValue === null) continue;
    sanitized[key] = safeValue;
  }

  return Object.keys(sanitized).length ? sanitized : null;
}

function sanitizeEntityDisplay(entityDisplay: string | null | undefined) {
  if (!entityDisplay) return null;
  const trimmed = entityDisplay.trim();
  if (!trimmed) return null;
  // Keep display-only labels safe from accidental PII leakage (especially emails).
  if (EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed.length > 140 ? trimmed.slice(0, 140) : trimmed;
}

export function redactAuditEvent(
  raw: AuditEventQueryRow,
  options?: {
    entityDisplay?: string | null;
  },
): RedactedAuditEvent {
  return {
    id: raw.id,
    occurredAt: raw.occurredAt.toISOString(),
    actorType: raw.actorType,
    actorId: raw.actorId ?? null,
    actorDisplay: normalizeActorDisplay(raw.actorDisplay),
    action: raw.action,
    entityType: raw.entityType ?? null,
    entityId: raw.entityId ?? null,
    entityDisplay: sanitizeEntityDisplay(options?.entityDisplay),
    result: raw.result,
    correlationId: raw.correlationId ?? null,
    metadata: sanitizeMetadata(raw.metadata as Prisma.JsonValue | null),
  };
}

export function summarizeAuditMetadata(
  metadata: Record<string, SafeMetadataValue> | null,
) {
  if (!metadata) return "";
  // CSV keeps metadata compact by serializing only already-redacted allowlisted keys.
  return JSON.stringify(metadata);
}
