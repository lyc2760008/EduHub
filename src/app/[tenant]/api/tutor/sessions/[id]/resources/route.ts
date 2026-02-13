/**
 * @state.route /[tenant]/api/tutor/sessions/[id]/resources
 * @state.area api
 * @state.capabilities view:detail, create:session_resource
 * @state.notes Step 22.9 tutor resources endpoint with create-only ownership policy.
 */
// Tutor session-resources endpoint is ownership-scoped; tutors can list and add resources only.
import { NextRequest } from "next/server";
import { z } from "zod";

import { AuditActorType, SessionResourceType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { logError } from "@/lib/observability/logger";
import {
  assertCanAccessSessionResources,
  createSessionResource,
  listSessionResources,
  SessionResourceError,
} from "@/lib/resources/sessionResources";
import { type TutorDataErrorCode, TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  buildTutorOkResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ tenant: string; id: string }>;
};

const createResourceSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    type: z.nativeEnum(SessionResourceType),
  })
  .strict();

function toTutorErrorCode(code: SessionResourceError["code"]): TutorDataErrorCode {
  if (code === "ValidationError") return "ValidationError";
  if (code === "NotFound") return "NotFound";
  return "Forbidden";
}

export async function GET(request: NextRequest, context: Params) {
  const requestId = readTutorRequestId(request);
  const { tenant, id } = await context.params;

  try {
    const sessionId = id.trim();
    if (!sessionId) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid session id",
        details: { field: "id" },
        requestId,
      });
    }

    const tutorCtx = await requireTutorContextOrThrow(tenant);
    await assertCanAccessSessionResources({
      tenantId: tutorCtx.tenant.tenantId,
      actor: {
        role: "Tutor",
        userId: tutorCtx.tutorUserId,
      },
      sessionId,
      mode: "read",
    });

    const items = await listSessionResources({
      tenantId: tutorCtx.tenant.tenantId,
      sessionId,
    });

    return buildTutorOkResponse({
      data: { items },
      requestId,
    });
  } catch (error) {
    if (error instanceof SessionResourceError) {
      return buildTutorErrorResponse({
        status: error.status,
        code: toTutorErrorCode(error.code),
        message: error.message,
        details: error.details,
        requestId,
      });
    }
    if (
      !(error instanceof TutorAccessError) &&
      !(error instanceof TutorDataError)
    ) {
      logError(
        "GET /[tenant]/api/tutor/sessions/[id]/resources failed",
        { tenantSlug: tenant, sessionId: id },
        request,
      );
    }
    return normalizeTutorRouteError(error, requestId);
  }
}

export async function POST(request: NextRequest, context: Params) {
  const requestId = readTutorRequestId(request);
  const { tenant, id } = await context.params;

  try {
    const sessionId = id.trim();
    if (!sessionId) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid session id",
        details: { field: "id" },
        requestId,
      });
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid JSON body",
        details: { field: "body" },
        requestId,
      });
    }

    const parsed = createResourceSchema.safeParse(body);
    if (!parsed.success) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid payload",
        details: { issues: parsed.error.issues },
        requestId,
      });
    }

    const tutorCtx = await requireTutorContextOrThrow(tenant);
    // PO decision (Step 22.9 UI contract): tutors can create resources only on sessions they own.
    await assertCanAccessSessionResources({
      tenantId: tutorCtx.tenant.tenantId,
      actor: {
        role: "Tutor",
        userId: tutorCtx.tutorUserId,
      },
      sessionId,
      mode: "write",
      tutorCreateEnabled: true,
    });

    const item = await createSessionResource({
      tenantId: tutorCtx.tenant.tenantId,
      sessionId,
      title: parsed.data.title,
      url: parsed.data.url,
      type: parsed.data.type,
      createdByUserId: tutorCtx.tutorUserId,
      createdByRole: "TUTOR",
    });

    await writeAuditEvent({
      tenantId: tutorCtx.tenant.tenantId,
      actorType: AuditActorType.USER,
      actorId: tutorCtx.tutorUserId,
      actorDisplay: tutorCtx.session.user.name ?? null,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_CREATED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: item.id,
      metadata: {
        sessionId,
        type: item.type,
      },
      request,
    });

    return buildTutorOkResponse({
      data: { item },
      status: 201,
      requestId,
    });
  } catch (error) {
    if (error instanceof SessionResourceError) {
      return buildTutorErrorResponse({
        status: error.status,
        code: toTutorErrorCode(error.code),
        message: error.message,
        details: error.details,
        requestId,
      });
    }
    if (
      !(error instanceof TutorAccessError) &&
      !(error instanceof TutorDataError)
    ) {
      logError(
        "POST /[tenant]/api/tutor/sessions/[id]/resources failed",
        { tenantSlug: tenant, sessionId: id },
        request,
      );
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
