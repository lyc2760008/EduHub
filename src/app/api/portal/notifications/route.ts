/**
 * @state.route /api/portal/notifications
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.3 parent+tutor notifications inbox list endpoint.
 */
// Parent+tutor notifications list endpoint enforces tenant+recipient scope with cursor pagination.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { NotificationType } from "@/generated/prisma/client";
import { requireNotificationPortalAccess } from "@/lib/notifications/access";
import { listRecipientNotifications } from "@/lib/notifications/query";
import { getTargetUrl, type NotificationSurface } from "@/lib/notifications/targets";

export const runtime = "nodejs";

const querySchema = z
  .object({
    status: z.enum(["all", "unread"]).optional(),
    type: z.enum(["all", "announcement", "homework", "request"]).optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

function toTypeFilter(type: "all" | "announcement" | "homework" | "request" | undefined) {
  if (!type || type === "all") return undefined;
  const map: Record<string, NotificationType> = {
    announcement: "ANNOUNCEMENT",
    homework: "HOMEWORK",
    request: "REQUEST",
  };
  return [map[type]];
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireNotificationPortalAccess(req);
    if (access instanceof Response) return access;

    const parsed = querySchema.safeParse({
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      type: req.nextUrl.searchParams.get("type") ?? undefined,
      cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path.join("."),
            })),
          },
        },
        { status: 400 },
      );
    }

    const result = await listRecipientNotifications({
      tenantId: access.tenantId,
      recipientUserId: access.recipientUserId,
      status: parsed.data.status ?? "all",
      types: toTypeFilter(parsed.data.type),
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit ?? 20,
    });
    const surface: NotificationSurface =
      access.role === "Tutor" ? "tutor" : "portal";

    return NextResponse.json({
      items: result.items.map((item) => ({
        ...item,
        // Prefer deterministic route derivation; targetUrl in DB remains optional fallback only.
        targetUrl:
          getTargetUrl({
            tenantSlug: access.tenantSlug,
            targetType: item.targetType,
            targetId: item.targetId,
            surface,
          }) ?? item.targetUrl,
      })),
      pageInfo: {
        nextCursor: result.nextCursor,
      },
    });
  } catch (error) {
    console.error("GET /api/portal/notifications failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
