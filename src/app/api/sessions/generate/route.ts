/**
 * @state.route /api/sessions/generate
 * @state.area api
 * @state.capabilities create:generate
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Session generator API with tenant scoping, RBAC, and timezone-safe recurrence.
import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { toAuditErrorCode } from "@/lib/audit/errorCode";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  generateOccurrences,
  type SessionOccurrence,
} from "@/lib/sessions/generator";
import {
  AuditActorType,
  Prisma,
  SessionType,
  type Role,
} from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const OCCURRENCE_PREVIEW_LIMIT = 50;
const CREATED_ID_LIMIT = 10;

const GenerateSessionsSchema = z
  .object({
    centerId: z.string().trim().min(1),
    tutorId: z.string().trim().min(1),
    sessionType: z.nativeEnum(SessionType),
    studentId: z.string().trim().min(1).optional(),
    groupId: z.string().trim().min(1).optional(),
    startDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
    startTime: z.string().trim().regex(TIME_REGEX),
    endTime: z.string().trim().regex(TIME_REGEX),
    timezone: z.string().trim().min(1),
    dryRun: z.boolean().optional(),
  })
  .strict();

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  return hour * 60 + minute;
}

function isValidTimezone(timezone: string): boolean {
  return DateTime.now().setZone(timezone).isValid;
}

function buildOccurrencePreview(occurrences: SessionOccurrence[]) {
  return occurrences.slice(0, OCCURRENCE_PREVIEW_LIMIT).map((occurrence) => ({
    startAt: occurrence.startAtUtc,
    endAt: occurrence.endAtUtc,
  }));
}

export async function POST(req: NextRequest) {
  let tenantId: string | null = null;
  let actorId: string | null = null;
  let actorDisplay: string | null = null;
  let entityIdentifier: string | null = null;
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const scopedTenantId = ctx.tenant.tenantId;
    tenantId = scopedTenantId;
    actorId = ctx.user.id;
    actorDisplay = ctx.user.name ?? null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = GenerateSessionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const dryRun = data.dryRun ?? true;
    entityIdentifier = data.groupId ?? data.centerId;

    if (!isValidTimezone(data.timezone)) {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid timezone" },
        { status: 400 },
      );
    }

    if (toMinutes(data.endTime) <= toMinutes(data.startTime)) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "endTime must be after startTime",
        },
        { status: 400 },
      );
    }

    if (data.sessionType === "ONE_ON_ONE") {
      if (!data.studentId) {
        return NextResponse.json(
          { error: "ValidationError", details: "studentId is required" },
          { status: 400 },
        );
      }
      if (data.groupId) {
        return NextResponse.json(
          { error: "ValidationError", details: "groupId is not allowed" },
          { status: 400 },
        );
      }
    }

    if (data.sessionType === "GROUP" || data.sessionType === "CLASS") {
      if (!data.groupId) {
        return NextResponse.json(
          { error: "ValidationError", details: "groupId is required" },
          { status: 400 },
        );
      }
      if (data.studentId) {
        return NextResponse.json(
          { error: "ValidationError", details: "studentId is not allowed" },
          { status: 400 },
        );
      }
    }

    let occurrences: SessionOccurrence[];
    try {
      occurrences = generateOccurrences({
        startDate: data.startDate,
        endDate: data.endDate,
        weekdays: data.weekdays,
        startTime: data.startTime,
        endTime: data.endTime,
        timezone: data.timezone,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details:
            error instanceof Error ? error.message : "Invalid recurrence input",
        },
        { status: 400 },
      );
    }

    const occurrencePreview = buildOccurrencePreview(occurrences);
    const occurrencesTruncated = occurrences.length > OCCURRENCE_PREVIEW_LIMIT;

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalOccurrences: occurrences.length,
        occurrences: occurrencePreview,
        ...(occurrencesTruncated
          ? { occurrencesNote: "Occurrences truncated to first 50 results" }
          : {}),
      });
    }

    const center = await prisma.center.findFirst({
      where: { id: data.centerId, tenantId: scopedTenantId },
      select: { id: true },
    });
    if (!center) {
      return NextResponse.json(
        { error: "ValidationError", details: "Center not found for tenant" },
        { status: 400 },
      );
    }

    const tutorMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId: scopedTenantId, userId: data.tutorId, role: "Tutor" },
      select: { id: true },
    });
    if (!tutorMembership) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "Tutor must have Tutor role in this tenant",
        },
        { status: 400 },
      );
    }

    const staffCenter = await prisma.staffCenter.findFirst({
      where: { tenantId: scopedTenantId, userId: data.tutorId, centerId: data.centerId },
      select: { id: true },
    });
    if (!staffCenter) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "Tutor is not assigned to this center",
        },
        { status: 400 },
      );
    }

    if (data.sessionType === "ONE_ON_ONE") {
      const student = await prisma.student.findFirst({
        where: { id: data.studentId, tenantId: scopedTenantId },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json(
          { error: "ValidationError", details: "Student not found for tenant" },
          { status: 400 },
        );
      }
    }

    let rosterStudentIds: string[] = [];

    if (data.sessionType === "ONE_ON_ONE") {
      rosterStudentIds = [data.studentId!];
    } else if (data.groupId) {
      const group = await prisma.group.findFirst({
        where: { id: data.groupId, tenantId: scopedTenantId },
        select: { id: true, centerId: true, type: true },
      });
      if (!group) {
        return NextResponse.json(
          { error: "ValidationError", details: "Group not found for tenant" },
          { status: 400 },
        );
      }
      if (group.centerId !== data.centerId) {
        return NextResponse.json(
          {
            error: "ValidationError",
            details: "Group does not belong to center",
          },
          { status: 400 },
        );
      }
      if (data.sessionType === "GROUP" && group.type !== "GROUP") {
        return NextResponse.json(
          { error: "ValidationError", details: "Group type must be GROUP" },
          { status: 400 },
        );
      }
      if (data.sessionType === "CLASS" && group.type !== "CLASS") {
        return NextResponse.json(
          { error: "ValidationError", details: "Group type must be CLASS" },
          { status: 400 },
        );
      }

      const roster = await prisma.groupStudent.findMany({
        where: { tenantId: scopedTenantId, groupId: data.groupId },
        select: { studentId: true },
      });
      rosterStudentIds = roster.map((entry) => entry.studentId);
    }

    const existingStartAt = new Set<number>();
    if (occurrences.length) {
      const existingSessions = await prisma.session.findMany({
        where: {
          tenantId: scopedTenantId,
          tutorId: data.tutorId,
          centerId: data.centerId,
          startAt: { in: occurrences.map((occ) => occ.startAtUtc) },
        },
        select: { startAt: true },
      });

      for (const session of existingSessions) {
        existingStartAt.add(session.startAt.getTime());
      }
    }

    const createdIds: string[] = [];
    let createdCount = 0;
    let skippedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const occurrence of occurrences) {
        if (existingStartAt.has(occurrence.startAtUtc.getTime())) {
          skippedCount += 1;
          continue;
        }

        try {
          const session = await tx.session.create({
            data: {
              tenantId: scopedTenantId,
              centerId: data.centerId,
              tutorId: data.tutorId,
              sessionType: data.sessionType,
              groupId: data.groupId ?? null,
              startAt: occurrence.startAtUtc,
              endAt: occurrence.endAtUtc,
              timezone: data.timezone,
            },
            select: { id: true },
          });

          createdCount += 1;
          if (createdIds.length < CREATED_ID_LIMIT) {
            createdIds.push(session.id);
          }

          if (rosterStudentIds.length) {
            await tx.sessionStudent.createMany({
              data: rosterStudentIds.map((studentId) => ({
                tenantId: scopedTenantId,
                sessionId: session.id,
                studentId,
              })),
              skipDuplicates: true,
            });
          }
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            skippedCount += 1;
            continue;
          }
          throw error;
        }
      }
    });

    await writeAuditEvent({
      tenantId: scopedTenantId,
      actorType: AuditActorType.USER,
      actorId,
      actorDisplay,
      action: AUDIT_ACTIONS.SESSIONS_GENERATED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: entityIdentifier,
      result: "SUCCESS",
      metadata: {
        // Counts + range are safe operational metadata for support triage.
        sessionsCreatedCount: createdCount,
        sessionsUpdatedCount: 0,
        sessionsSkippedCount: skippedCount,
        inputRangeFrom: data.startDate,
        inputRangeTo: data.endDate,
      },
      request: req,
    });

    return NextResponse.json({
      dryRun: false,
      totalOccurrences: occurrences.length,
      createdCount,
      skippedCount,
      occurrences: occurrencePreview,
      ...(occurrencesTruncated
        ? { occurrencesNote: "Occurrences truncated to first 50 results" }
        : {}),
      createdSessionIds: createdIds,
    });
  } catch (error) {
    if (tenantId) {
      await writeAuditEvent({
        tenantId,
        actorType: AuditActorType.USER,
        actorId,
        actorDisplay,
        action: AUDIT_ACTIONS.SESSIONS_GENERATED,
        entityType: AUDIT_ENTITY_TYPES.SESSION,
        entityId: entityIdentifier,
        result: "FAILURE",
        metadata: {
          errorCode: toAuditErrorCode(error),
        },
        request: req,
      });
    }
    console.error("POST /api/sessions/generate failed", error);
    return jsonError(500, "Internal server error");
  }
}
