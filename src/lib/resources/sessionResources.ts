// Server-only session resource helpers centralize RBAC, tenant scoping, and URL-safe mutations.
import "server-only";

import type { Role, SessionResourceCreatedByRole, SessionResourceType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeResourceUrl } from "@/lib/resources/url";

type AccessMode = "read" | "write";

type SessionResourceActor = {
  role: Role;
  userId: string;
  parentId?: string | null;
};

type AssertCanAccessSessionResourcesInput = {
  tenantId: string;
  actor: SessionResourceActor;
  sessionId: string;
  mode: AccessMode;
  tutorCreateEnabled?: boolean;
};

type SessionResourceListItem = {
  id: string;
  title: string;
  url: string;
  type: SessionResourceType;
  createdAt: Date;
  updatedAt: Date;
};

type SessionResourceMutateItem = SessionResourceListItem & {
  sessionId: string;
};

type CreateSessionResourceInput = {
  tenantId: string;
  sessionId: string;
  title: string;
  url: string;
  type: SessionResourceType;
  createdByUserId: string | null;
  createdByRole: SessionResourceCreatedByRole;
};

type UpdateSessionResourceInput = {
  tenantId: string;
  resourceId: string;
  title?: string;
  url?: string;
  type?: SessionResourceType;
};

type DeleteSessionResourceInput = {
  tenantId: string;
  resourceId: string;
};

type BulkApplyResourcesInput = {
  tenantId: string;
  sessionIds: string[];
  resources: Array<{
    title: string;
    url: string;
    type: SessionResourceType;
  }>;
  actor: SessionResourceActor;
};

type BulkApplyResourcesResult = {
  sessionsProcessed: number;
  sessionsUpdated: number;
  resourcesAttempted: number;
  resourcesCreated: number;
  duplicatesSkipped: number;
};

export class SessionResourceError extends Error {
  status: number;
  code:
    | "ValidationError"
    | "Unauthorized"
    | "Forbidden"
    | "NotFound"
    | "InternalError";
  details: Record<string, unknown>;

  constructor(
    status: number,
    code: SessionResourceError["code"],
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SessionResourceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeTitle(input: string) {
  const normalized = input.trim();
  if (!normalized) {
    throw new SessionResourceError(400, "ValidationError", "Title is required", {
      field: "title",
    });
  }
  if (normalized.length > 200) {
    throw new SessionResourceError(400, "ValidationError", "Title is too long", {
      field: "title",
      max: 200,
    });
  }
  return normalized;
}

function normalizeUrlOrThrow(input: string) {
  try {
    return normalizeResourceUrl(input);
  } catch {
    throw new SessionResourceError(400, "ValidationError", "Invalid resource URL", {
      field: "url",
    });
  }
}

function canonicalizeForDedupe(rawUrl: string) {
  try {
    // Normalization is applied first, then lowercased for case-insensitive URL duplicate checks.
    return normalizeResourceUrl(rawUrl).toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

async function assertSessionExists(tenantId: string, sessionId: string) {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      tenantId,
    },
    select: { id: true },
  });

  if (!session) {
    throw new SessionResourceError(404, "NotFound", "Session not found");
  }
}

export async function assertCanAccessSessionResources({
  tenantId,
  actor,
  sessionId,
  mode,
  tutorCreateEnabled = false,
}: AssertCanAccessSessionResourcesInput) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new SessionResourceError(400, "ValidationError", "Invalid session id", {
      field: "sessionId",
    });
  }

  if (actor.role === "Owner" || actor.role === "Admin") {
    await assertSessionExists(tenantId, normalizedSessionId);
    return { sessionId: normalizedSessionId };
  }

  if (actor.role === "Tutor") {
    const session = await prisma.session.findFirst({
      where: {
        id: normalizedSessionId,
        tenantId,
        tutorId: actor.userId,
      },
      select: { id: true },
    });
    // Return 404 for ownership mismatches to avoid ID probing across tutors.
    if (!session) {
      throw new SessionResourceError(404, "NotFound", "Session not found");
    }
    if (mode === "write" && !tutorCreateEnabled) {
      throw new SessionResourceError(403, "Forbidden", "Tutor cannot modify resources", {
        mode,
      });
    }
    return { sessionId: normalizedSessionId };
  }

  if (actor.role === "Parent") {
    const parentId = actor.parentId?.trim();
    if (!parentId) {
      throw new SessionResourceError(403, "Forbidden", "Parent not resolved");
    }
    const linked = await prisma.sessionStudent.findFirst({
      where: {
        tenantId,
        sessionId: normalizedSessionId,
        student: {
          parents: {
            some: {
              tenantId,
              parentId,
            },
          },
        },
      },
      select: { id: true },
    });
    // Return 404 for missing linkage to prevent parent-side session ID probing.
    if (!linked) {
      throw new SessionResourceError(404, "NotFound", "Session not found");
    }
    if (mode === "write") {
      throw new SessionResourceError(403, "Forbidden", "Parent cannot modify resources", {
        mode,
      });
    }
    return { sessionId: normalizedSessionId };
  }

  throw new SessionResourceError(403, "Forbidden", "Role not allowed");
}

export async function listSessionResources(input: {
  tenantId: string;
  sessionId: string;
}): Promise<SessionResourceListItem[]> {
  return prisma.sessionResource.findMany({
    where: {
      tenantId: input.tenantId,
      sessionId: input.sessionId,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      url: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createSessionResource(
  input: CreateSessionResourceInput,
): Promise<SessionResourceMutateItem> {
  const title = normalizeTitle(input.title);
  const normalizedUrl = normalizeUrlOrThrow(input.url);

  const created = await prisma.sessionResource.create({
    data: {
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      title,
      url: normalizedUrl,
      type: input.type,
      createdByUserId: input.createdByUserId,
      createdByRole: input.createdByRole,
    },
    select: {
      id: true,
      sessionId: true,
      title: true,
      url: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return created;
}

export async function updateSessionResource(
  input: UpdateSessionResourceInput,
): Promise<SessionResourceMutateItem> {
  const normalizedResourceId = input.resourceId.trim();
  if (!normalizedResourceId) {
    throw new SessionResourceError(400, "ValidationError", "Invalid resource id", {
      field: "resourceId",
    });
  }

  const existing = await prisma.sessionResource.findFirst({
    where: {
      id: normalizedResourceId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
    },
  });
  if (!existing) {
    throw new SessionResourceError(404, "NotFound", "Resource not found");
  }

  const data: {
    title?: string;
    url?: string;
    type?: SessionResourceType;
  } = {};

  if (input.title !== undefined) {
    data.title = normalizeTitle(input.title);
  }
  if (input.url !== undefined) {
    data.url = normalizeUrlOrThrow(input.url);
  }
  if (input.type !== undefined) {
    data.type = input.type;
  }

  if (!Object.keys(data).length) {
    throw new SessionResourceError(400, "ValidationError", "No fields provided", {
      field: "body",
    });
  }

  const updated = await prisma.sessionResource.update({
    where: { id: normalizedResourceId },
    data,
    select: {
      id: true,
      sessionId: true,
      title: true,
      url: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
}

export async function deleteSessionResource(
  input: DeleteSessionResourceInput,
): Promise<{ id: string; sessionId: string }> {
  const normalizedResourceId = input.resourceId.trim();
  if (!normalizedResourceId) {
    throw new SessionResourceError(400, "ValidationError", "Invalid resource id", {
      field: "resourceId",
    });
  }

  const existing = await prisma.sessionResource.findFirst({
    where: {
      id: normalizedResourceId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      sessionId: true,
    },
  });
  if (!existing) {
    throw new SessionResourceError(404, "NotFound", "Resource not found");
  }

  await prisma.sessionResource.delete({
    where: { id: normalizedResourceId },
  });

  return existing;
}

export async function bulkApplyResources(
  input: BulkApplyResourcesInput,
): Promise<BulkApplyResourcesResult> {
  if (input.actor.role !== "Owner" && input.actor.role !== "Admin") {
    throw new SessionResourceError(403, "Forbidden", "Only admins can bulk apply resources");
  }

  const normalizedSessionIds = Array.from(
    new Set(input.sessionIds.map((sessionId) => sessionId.trim()).filter(Boolean)),
  );
  if (!normalizedSessionIds.length) {
    throw new SessionResourceError(400, "ValidationError", "sessionIds is required", {
      field: "sessionIds",
    });
  }
  if (!input.resources.length) {
    throw new SessionResourceError(400, "ValidationError", "resources is required", {
      field: "resources",
    });
  }

  const normalizedResources = input.resources.map((resource) => ({
    title: normalizeTitle(resource.title),
    url: normalizeUrlOrThrow(resource.url),
    type: resource.type,
  }));

  const scopedSessions = await prisma.session.findMany({
    where: {
      tenantId: input.tenantId,
      id: { in: normalizedSessionIds },
    },
    select: { id: true },
  });

  if (scopedSessions.length !== normalizedSessionIds.length) {
    // All-or-nothing to avoid partial writes on mixed-tenant or missing ids.
    throw new SessionResourceError(404, "NotFound", "Session not found");
  }

  const existingResources = await prisma.sessionResource.findMany({
    where: {
      tenantId: input.tenantId,
      sessionId: { in: normalizedSessionIds },
    },
    select: {
      sessionId: true,
      url: true,
      type: true,
    },
  });

  const existingKeys = new Set(
    existingResources.map((resource) =>
      `${resource.sessionId}|${resource.type}|${canonicalizeForDedupe(resource.url)}`),
  );

  const rowsToCreate: Array<{
    tenantId: string;
    sessionId: string;
    title: string;
    url: string;
    type: SessionResourceType;
    createdByUserId: string;
    createdByRole: SessionResourceCreatedByRole;
  }> = [];
  const sessionsUpdated = new Set<string>();
  let resourcesAttempted = 0;
  let duplicatesSkipped = 0;

  for (const sessionId of normalizedSessionIds) {
    for (const resource of normalizedResources) {
      resourcesAttempted += 1;
      // V1 duplicate rule: same session + resource type + URL (case-insensitive).
      const key = `${sessionId}|${resource.type}|${resource.url.toLowerCase()}`;
      if (existingKeys.has(key)) {
        duplicatesSkipped += 1;
        continue;
      }
      existingKeys.add(key);
      rowsToCreate.push({
        tenantId: input.tenantId,
        sessionId,
        title: resource.title,
        url: resource.url,
        type: resource.type,
        createdByUserId: input.actor.userId,
        createdByRole: "ADMIN",
      });
      sessionsUpdated.add(sessionId);
    }
  }

  const createdCount = rowsToCreate.length
    ? (
        await prisma.sessionResource.createMany({
          data: rowsToCreate,
        })
      ).count
    : 0;

  return {
    sessionsProcessed: normalizedSessionIds.length,
    sessionsUpdated: sessionsUpdated.size,
    resourcesAttempted,
    resourcesCreated: createdCount,
    duplicatesSkipped,
  };
}
