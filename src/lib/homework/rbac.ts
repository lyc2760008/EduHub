// Homework RBAC helpers keep tenant scoping + ownership checks consistent across all endpoints.
import "server-only";

import type { NextRequest } from "next/server";

import { type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { HomeworkError } from "@/lib/homework/errors";
import { requireRole } from "@/lib/rbac";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export type HomeworkActor = {
  role: Role;
  userId: string;
  parentId?: string | null;
};

export async function requireAdminForTenant(request: NextRequest) {
  const ctx = await requireRole(request, ADMIN_ROLES);
  if (ctx instanceof Response) {
    throw new HomeworkError(
      ctx.status === 401 ? 401 : 403,
      ctx.status === 401 ? "Unauthorized" : "Forbidden",
      "Forbidden",
    );
  }
  return ctx;
}

export async function requireTutorForHomeworkItem(
  tenantId: string,
  tutorUserId: string,
  homeworkItemId: string,
) {
  const item = await prisma.homeworkItem.findFirst({
    where: {
      id: homeworkItemId,
      tenantId,
      session: { tutorId: tutorUserId },
    },
    select: {
      id: true,
      tenantId: true,
      sessionId: true,
      studentId: true,
      status: true,
    },
  });

  if (!item) {
    // Return 404 for ownership mismatches to avoid tutor-side ID probing.
    throw new HomeworkError(404, "NotFound", "Homework item not found");
  }

  return item;
}

export async function requireParentForHomeworkItem(
  tenantId: string,
  parentUserId: string,
  homeworkItemId: string,
) {
  const item = await prisma.homeworkItem.findFirst({
    where: {
      id: homeworkItemId,
      tenantId,
      student: {
        parents: {
          some: {
            tenantId,
            parentId: parentUserId,
          },
        },
      },
    },
    select: {
      id: true,
      tenantId: true,
      sessionId: true,
      studentId: true,
      status: true,
    },
  });

  if (!item) {
    // Return 404 for linkage mismatches to avoid parent-side ID probing.
    throw new HomeworkError(404, "NotFound", "Homework item not found");
  }

  return item;
}

export async function requireRoleForHomeworkFileDownload(
  tenantId: string,
  actor: HomeworkActor,
  fileId: string,
) {
  const baseSelect = {
    id: true,
    tenantId: true,
    homeworkItemId: true,
    slot: true,
    filename: true,
    mimeType: true,
    sizeBytes: true,
  } as const;

  const file =
    actor.role === "Owner" || actor.role === "Admin"
      ? await prisma.homeworkFile.findFirst({
          where: { id: fileId, tenantId },
          select: baseSelect,
        })
      : actor.role === "Tutor"
        ? await prisma.homeworkFile.findFirst({
            where: {
              id: fileId,
              tenantId,
              homeworkItem: {
                session: {
                  tutorId: actor.userId,
                },
              },
            },
            select: baseSelect,
          })
        : await prisma.homeworkFile.findFirst({
            where: {
              id: fileId,
              tenantId,
              homeworkItem: {
                student: {
                  parents: {
                    some: {
                      tenantId,
                      parentId: actor.parentId ?? actor.userId,
                    },
                  },
                },
              },
            },
            select: baseSelect,
          });

  if (!file) {
    throw new HomeworkError(404, "NotFound", "Homework file not found");
  }

  return file;
}

