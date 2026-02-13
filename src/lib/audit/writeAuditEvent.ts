// Server-only audit writer with metadata sanitation + best-effort behavior.
import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getRequestId } from "@/lib/observability/request";
import type {
  AuditActorType,
  AuditEventResult,
  Prisma,
} from "@/generated/prisma/client";

type WriteAuditEventInput = {
  tenantId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  actorDisplay?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  result?: AuditEventResult;
  correlationId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  request?: Request | null;
};

const MAX_METADATA_KEYS = 20;
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 20;
const MAX_NESTED_DEPTH = 3;
const DISALLOWED_KEY_PATTERN =
  /(accessCode|access_code|password|token|secret|hash|authorization|cookie|email|ip)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function sanitizeString(value: string) {
  const trimmed = value.trim();
  if (trimmed.length > MAX_STRING_LENGTH) {
    return { length: trimmed.length };
  }
  return trimmed;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= MAX_NESTED_DEPTH) return [];
    return value.slice(0, MAX_ARRAY_LENGTH).map((entry) =>
      sanitizeValue(entry, depth + 1),
    );
  }
  if (typeof value === "object") {
    if (depth >= MAX_NESTED_DEPTH) return {};
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_METADATA_KEYS,
    );
    const cleaned: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      if (DISALLOWED_KEY_PATTERN.test(key)) continue;
      const sanitized = sanitizeValue(entryValue, depth + 1);
      if (sanitized !== undefined) {
        cleaned[key] = sanitized;
      }
    }
    return cleaned;
  }
  return undefined;
}

function sanitizeMetadata(metadata?: Prisma.InputJsonValue | null) {
  if (!metadata) return undefined;
  const cleaned = sanitizeValue(metadata, 0);
  if (!cleaned || typeof cleaned !== "object") return undefined;
  const record = cleaned as Record<string, unknown>;
  return Object.keys(record).length
    ? (record as Prisma.InputJsonValue)
    : undefined;
}

function normalizeDisplay(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  // Privacy guard: audit actor display must never store raw email addresses.
  if (!trimmed || EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed ? trimmed : null;
}

// Best-effort audit writer: failures are logged but never block core flows.
export async function writeAuditEvent({
  tenantId,
  actorType,
  actorId,
  actorDisplay,
  action,
  entityType,
  entityId,
  result,
  correlationId,
  metadata,
  request,
}: WriteAuditEventInput) {
  if (!tenantId) {
    console.error("writeAuditEvent called without tenantId", {
      action,
      actorType,
    });
    return;
  }

  try {
    const sanitizedMetadata = sanitizeMetadata(metadata);
    const requestId = correlationId?.trim() || getRequestId(request ?? undefined);

    await prisma.auditEvent.create({
      data: {
        tenantId,
        actorType,
        actorId: actorId ?? null,
        actorDisplay: normalizeDisplay(actorDisplay),
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        result: result ?? "SUCCESS",
        correlationId: requestId || null,
        metadata: sanitizedMetadata,
      },
    });
  } catch (error) {
    console.error("writeAuditEvent failed", error);
  }
}
