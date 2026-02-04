// Server-only audit writer with metadata sanitation + best-effort behavior.
import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AuditActorType, Prisma } from "@/generated/prisma/client";

type WriteAuditEventInput = {
  tenantId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  actorDisplay?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  request?: Request | null;
};

const MAX_METADATA_KEYS = 20;
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 20;
const MAX_NESTED_DEPTH = 3;
const DISALLOWED_KEY_PATTERN =
  /(accessCode|access_code|password|token|secret|hash)/i;

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

function getIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip");
}

function normalizeDisplay(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
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
    const ip = request ? getIp(request) : null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    await prisma.auditEvent.create({
      data: {
        tenantId,
        actorType,
        actorId: actorId ?? null,
        actorDisplay: normalizeDisplay(actorDisplay),
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        metadata: sanitizedMetadata,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("writeAuditEvent failed", error);
  }
}
