// Users collection API with tenant scoping, RBAC, and center assignments.
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  parseAdminTableQuery,
  runAdminTableQuery,
} from "@/lib/reports/adminTableQuery";
import {
  ReportApiError,
  normalizeRoleError,
  toReportErrorResponse,
} from "@/lib/reports/adminReportErrors";
import { REPORT_LIMITS } from "@/lib/reports/reportConfigs";
import {
  fetchCentersForTenant,
  getStaffCentersForUsers,
  getUserDetailForTenant,
  normalizeCenterIds,
  replaceStaffCentersForUser,
  type CenterSummary,
  type UserListItem,
} from "@/lib/users/data";
import { Prisma, Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const CreateUserSchema = z
  .object({
    email: z.string().trim().email(),
    name: z.string().trim().min(1).optional(),
    role: z.nativeEnum(Role),
    centerIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

const USER_SORT_FIELDS = ["name", "email", "role"] as const;
type UserSortField = (typeof USER_SORT_FIELDS)[number];

const userFilterSchema = z
  .object({
    role: z.nativeEnum(Role).optional(),
  })
  .strict();

// Shared include ensures membership rows expose the user fields needed for list rendering.
const USER_MEMBERSHIP_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
} as const;

type UserMembershipRow = Prisma.TenantMembershipGetPayload<{
  include: typeof USER_MEMBERSHIP_INCLUDE;
}>;

function buildUserOrderBy(
  field: UserSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.TenantMembershipOrderByWithRelationInput> {
  // Stable ordering keeps pagination deterministic when names are missing.
  if (field === "email") {
    return [{ user: { email: dir } }, { userId: "asc" }];
  }
  if (field === "role") {
    return [
      { role: dir },
      { user: { email: "asc" } },
      { userId: "asc" },
    ];
  }
  return [
    { user: { name: dir } },
    { user: { email: "asc" } },
    { userId: "asc" },
  ];
}

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract keeps user list queries consistent.
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: userFilterSchema,
      allowedSortFields: USER_SORT_FIELDS,
      defaultSort: { field: "name", dir: "asc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const result = await runAdminTableQuery({
      filterSchema: userFilterSchema,
      allowedSortFields: USER_SORT_FIELDS,
      defaultSort: { field: "name", dir: "asc" },
      buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
        const andFilters: Prisma.TenantMembershipWhereInput[] = [
          { tenantId: scopedTenantId },
        ];
        if (search) {
          andFilters.push({
            OR: [
              { user: { name: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          });
        }
        if (filters.role) {
          andFilters.push({ role: filters.role });
        }
        return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
      },
      buildOrderBy: buildUserOrderBy,
      count: (where) => prisma.tenantMembership.count({ where }),
      findMany: async ({ where, orderBy, skip, take }) => {
        const memberships: UserMembershipRow[] =
          await prisma.tenantMembership.findMany({
            where,
            orderBy:
              orderBy as Prisma.TenantMembershipOrderByWithRelationInput[],
            skip,
            take,
            include: USER_MEMBERSHIP_INCLUDE,
          });

        const userIds = memberships.map((membership) => membership.userId);
        const staffCenters = await getStaffCentersForUsers(
          prisma,
          tenantId,
          userIds,
        );
        const centersByUserId = new Map<string, CenterSummary[]>();
        for (const staffCenter of staffCenters) {
          const existing = centersByUserId.get(staffCenter.userId) ?? [];
          existing.push(staffCenter.center);
          centersByUserId.set(staffCenter.userId, existing);
        }

        const users: UserListItem[] = memberships.map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.role,
          centers: centersByUserId.get(membership.userId) ?? [],
        }));

        return users;
      },
      mapRow: (row) => row,
    }, {
      tenantId,
      parsedQuery,
    });

    return NextResponse.json({
      rows: result.rows,
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      sort: result.sort,
      appliedFilters: result.appliedFilters,
    });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/users failed", error);
    }
    return toReportErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Validation error shape is consistent for malformed JSON payloads.
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    // Validate input before attempting to write to the database.
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    // Normalize centerIds to avoid duplicates while preserving tenant validation.
    const normalizedCenterIds = normalizeCenterIds(data.centerIds);
    const resolvedCenters =
      normalizedCenterIds && normalizedCenterIds.length
        ? await fetchCentersForTenant(prisma, tenantId, normalizedCenterIds)
        : normalizedCenterIds
          ? []
          : undefined;

    if (resolvedCenters === null) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "One or more centers do not belong to this tenant",
        },
        { status: 400 },
      );
    }

    // New users get a random password hash; onboarding is handled elsewhere.
    const passwordHash = await bcrypt.hash(randomUUID(), 10);

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: data.email },
        select: { id: true, name: true, email: true },
      });

      let user = existingUser;

      if (existingUser && data.name) {
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: { name: data.name },
          select: { id: true, name: true, email: true },
        });
      }

      if (!user) {
        try {
          user = await tx.user.create({
            data: {
              email: data.email,
              name: data.name,
              passwordHash,
            },
            select: { id: true, name: true, email: true },
          });
        } catch (error) {
          // Handle a rare concurrent create by reloading the existing user.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            user = await tx.user.findUnique({
              where: { email: data.email },
              select: { id: true, name: true, email: true },
            });
          } else {
            throw error;
          }
        }
      }

      if (!user) {
        throw new Error("User creation failed");
      }

      const membership = await tx.tenantMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId,
            userId: user.id,
          },
        },
        update: { role: data.role },
        create: {
          tenantId,
          userId: user.id,
          role: data.role,
        },
      });

      let centers: CenterSummary[];

      if (resolvedCenters) {
        await replaceStaffCentersForUser(
          tx,
          tenantId,
          user.id,
          resolvedCenters,
        );
        centers = resolvedCenters;
      } else {
        // When no centerIds are provided, preserve any existing assignments.
        const detail = await getUserDetailForTenant(tx, tenantId, user.id);
        centers = detail?.centers ?? [];
      }

      return {
        user,
        role: membership.role,
        centers,
      };
    });

    return NextResponse.json({
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.role,
      centers: result.centers,
    });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("POST /api/users failed", error);
    return jsonError(500, "Internal server error");
  }
}
