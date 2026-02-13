/**
 * @state.route /api/admin/announcements
 * @state.area api
 * @state.capabilities view:list, create:announcement
 * @state.notes Step 22.8 admin announcements list/create endpoint with tenant-safe RBAC and server-side table query parsing.
 */
// Admin announcements list/create endpoint with tenant isolation, URL query state parsing, and safe audit metadata.
import { NextRequest, NextResponse } from "next/server";

import { AuditActorType, type AnnouncementScope, type Role } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import {
  toAdminDetailDTO,
  toAdminListDTO,
} from "@/lib/announcements/dto";
import {
  AnnouncementApiError,
  normalizeAnnouncementRoleError,
  toAnnouncementErrorResponse,
} from "@/lib/announcements/http";
import {
  buildAnnouncementListOrderBy,
  buildAnnouncementListWhere,
  parseAnnouncementListQuery,
  toPageInfo,
} from "@/lib/announcements/query";
import { validateAnnouncementTitleBody } from "@/lib/announcements/validate";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const V1_SCOPE: AnnouncementScope = "TENANT_WIDE";

function parseScope(input: unknown) {
  if (input === undefined || input === null || input === "") return V1_SCOPE;
  if (input === V1_SCOPE) return V1_SCOPE;
  throw new AnnouncementApiError(400, "ValidationError", {
    field: "scope",
    reason: "UNSUPPORTED_SCOPE",
  });
}

export async function GET(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeAnnouncementRoleError(roleResult);
    }
    const tenantId = roleResult.tenant.tenantId;

    const parsedQuery = parseAnnouncementListQuery(new URL(req.url).searchParams);
    const where = buildAnnouncementListWhere({
      tenantId,
      search: parsedQuery.search,
      filters: parsedQuery.filters,
    });
    const orderBy = buildAnnouncementListOrderBy(
      parsedQuery.sort.field,
      parsedQuery.sort.dir,
    );
    const skip = (parsedQuery.page - 1) * parsedQuery.pageSize;
    const take = parsedQuery.pageSize;

    const [totalCount, rows] = await Promise.all([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          createdByUser: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              reads: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      items: rows.map((row) => toAdminListDTO(row)),
      pageInfo: toPageInfo({
        totalCount,
        page: parsedQuery.page,
        pageSize: parsedQuery.pageSize,
      }),
      sort: parsedQuery.sort,
      appliedFilters: parsedQuery.appliedFilters,
    });
  } catch (error) {
    if (!(error instanceof AnnouncementApiError)) {
      console.error("GET /api/admin/announcements failed", error);
    }
    return toAnnouncementErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeAnnouncementRoleError(roleResult);
    }
    const tenantId = roleResult.tenant.tenantId;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      throw new AnnouncementApiError(400, "ValidationError", {
        field: "body",
        reason: "INVALID_JSON",
      });
    }

    const validated = validateAnnouncementTitleBody(
      typeof body === "object" && body !== null
        ? {
            title: (body as Record<string, unknown>).title,
            body: (body as Record<string, unknown>).body,
          }
        : body,
    );
    if (!validated.ok) {
      throw new AnnouncementApiError(400, "ValidationError", {
        issues: validated.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join("."),
        })),
      });
    }
    const scope = parseScope(
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).scope
        : undefined,
    );

    const created = await prisma.announcement.create({
      data: {
        tenantId,
        title: validated.data.title,
        body: validated.data.body,
        scope,
        status: "DRAFT",
        createdByUserId: roleResult.user.id,
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            reads: true,
          },
        },
      },
    });

    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: roleResult.user.id,
      actorDisplay: roleResult.user.name ?? null,
      action: AUDIT_ACTIONS.ANNOUNCEMENT_CREATED,
      entityType: AUDIT_ENTITY_TYPES.ANNOUNCEMENT,
      entityId: created.id,
      result: "SUCCESS",
      metadata: {
        toStatus: created.status,
        scope: created.scope,
        hasPublishedAt: Boolean(created.publishedAt),
      },
      request: req,
    });

    return NextResponse.json(
      {
        item: toAdminDetailDTO(created),
      },
      { status: 201 },
    );
  } catch (error) {
    if (!(error instanceof AnnouncementApiError)) {
      console.error("POST /api/admin/announcements failed", error);
    }
    return toAnnouncementErrorResponse(error);
  }
}
