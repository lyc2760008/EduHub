// Server-only resolver that maps audit entity IDs to tenant-scoped display labels for admin readability.
import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AuditEventQueryRow } from "@/lib/audit/queryAuditEvents";
import { formatDisplayName } from "@/lib/reports/adminReportUtils";

type AuditEntityRef = Pick<AuditEventQueryRow, "entityType" | "entityId">;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const MAX_DISPLAY_LENGTH = 140;

function toEntityLookupKey(entityType: string | null, entityId: string | null) {
  return `${entityType ?? ""}::${entityId ?? ""}`;
}

function normalizeEntityDisplay(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed.length > MAX_DISPLAY_LENGTH
    ? trimmed.slice(0, MAX_DISPLAY_LENGTH)
    : trimmed;
}

function addDisplay(
  lookup: Map<string, string>,
  entityType: string,
  entityId: string,
  display: string | null,
) {
  const normalized = normalizeEntityDisplay(display);
  if (!normalized) return;
  lookup.set(toEntityLookupKey(entityType, entityId), normalized);
}

function getEntityIdsByType(rows: AuditEntityRef[]) {
  const idsByType = new Map<string, Set<string>>();
  for (const row of rows) {
    const entityType = row.entityType?.trim().toUpperCase();
    const entityId = row.entityId?.trim();
    if (!entityType || !entityId) continue;
    const existing = idsByType.get(entityType);
    if (existing) {
      existing.add(entityId);
      continue;
    }
    idsByType.set(entityType, new Set([entityId]));
  }
  return idsByType;
}

function formatSessionEntityDisplay(input: {
  groupName: string | null;
  centerName: string | null;
  startAt: Date;
}) {
  const scope = input.groupName?.trim() || input.centerName?.trim() || null;
  const dateLabel = input.startAt.toISOString().slice(0, 10);
  if (!scope) return dateLabel;
  return `${scope} (${dateLabel})`;
}

export async function resolveAuditEntityDisplayLookup(args: {
  tenantId: string;
  rows: AuditEntityRef[];
}) {
  const idsByType = getEntityIdsByType(args.rows);
  const lookup = new Map<string, string>();

  const studentIds = Array.from(idsByType.get("STUDENT") ?? []);
  if (studentIds.length) {
    const students = await prisma.student.findMany({
      where: { tenantId: args.tenantId, id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
    });
    for (const student of students) {
      addDisplay(
        lookup,
        "STUDENT",
        student.id,
        formatDisplayName(student.firstName, student.lastName, student.preferredName),
      );
    }
  }

  const parentIds = Array.from(idsByType.get("PARENT") ?? []);
  if (parentIds.length) {
    const parents = await prisma.parent.findMany({
      where: { tenantId: args.tenantId, id: { in: parentIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const parent of parents) {
      addDisplay(lookup, "PARENT", parent.id, `${parent.firstName} ${parent.lastName}`);
    }
  }

  const groupIds = Array.from(idsByType.get("GROUP") ?? []);
  if (groupIds.length) {
    const groups = await prisma.group.findMany({
      where: { tenantId: args.tenantId, id: { in: groupIds } },
      select: { id: true, name: true },
    });
    for (const group of groups) {
      addDisplay(lookup, "GROUP", group.id, group.name);
    }
  }

  const requestIds = Array.from(idsByType.get("REQUEST") ?? []);
  if (requestIds.length) {
    const requests = await prisma.parentRequest.findMany({
      where: { tenantId: args.tenantId, id: { in: requestIds } },
      select: {
        id: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        },
      },
    });
    for (const request of requests) {
      addDisplay(
        lookup,
        "REQUEST",
        request.id,
        formatDisplayName(
          request.student.firstName,
          request.student.lastName,
          request.student.preferredName,
        ),
      );
    }
  }

  const attendanceIds = Array.from(idsByType.get("ATTENDANCE") ?? []);
  if (attendanceIds.length) {
    const attendances = await prisma.attendance.findMany({
      where: { tenantId: args.tenantId, id: { in: attendanceIds } },
      select: {
        id: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        },
      },
    });
    for (const attendance of attendances) {
      addDisplay(
        lookup,
        "ATTENDANCE",
        attendance.id,
        formatDisplayName(
          attendance.student.firstName,
          attendance.student.lastName,
          attendance.student.preferredName,
        ),
      );
    }
  }

  const sessionEntityIds = Array.from(idsByType.get("SESSION") ?? []).filter(
    (entityId) => entityId !== "bulk",
  );
  if (sessionEntityIds.length) {
    const [sessions, centers, groups] = await Promise.all([
      prisma.session.findMany({
        where: { tenantId: args.tenantId, id: { in: sessionEntityIds } },
        select: {
          id: true,
          startAt: true,
          group: { select: { name: true } },
          center: { select: { name: true } },
        },
      }),
      prisma.center.findMany({
        where: { tenantId: args.tenantId, id: { in: sessionEntityIds } },
        select: { id: true, name: true },
      }),
      prisma.group.findMany({
        where: { tenantId: args.tenantId, id: { in: sessionEntityIds } },
        select: { id: true, name: true },
      }),
    ]);

    for (const session of sessions) {
      addDisplay(
        lookup,
        "SESSION",
        session.id,
        formatSessionEntityDisplay({
          groupName: session.group?.name ?? null,
          centerName: session.center.name,
          startAt: session.startAt,
        }),
      );
    }

    for (const center of centers) {
      if (lookup.has(toEntityLookupKey("SESSION", center.id))) continue;
      addDisplay(lookup, "SESSION", center.id, center.name);
    }

    for (const group of groups) {
      if (lookup.has(toEntityLookupKey("SESSION", group.id))) continue;
      addDisplay(lookup, "SESSION", group.id, group.name);
    }
  }

  const accessCodeIds = Array.from(idsByType.get("ACCESS_CODE") ?? []);
  if (accessCodeIds.length) {
    const parents = await prisma.parent.findMany({
      where: { tenantId: args.tenantId, id: { in: accessCodeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const parent of parents) {
      addDisplay(
        lookup,
        "ACCESS_CODE",
        parent.id,
        `${parent.firstName} ${parent.lastName}`,
      );
    }
  }

  return lookup;
}

export function getAuditEntityDisplay(
  row: AuditEntityRef,
  lookup: Map<string, string>,
) {
  const entityType = row.entityType?.trim().toUpperCase() ?? null;
  const entityId = row.entityId?.trim() ?? null;
  if (!entityType || !entityId) return null;
  return lookup.get(toEntityLookupKey(entityType, entityId)) ?? null;
}
