/**
 * @state.route /api/portal/students/[id]/progress-notes
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.3 parent student progress-notes timeline (read-only).
 */
import { NextRequest, NextResponse } from "next/server";

import { buildPortalError, assertParentLinkedToStudent, requirePortalParent } from "@/lib/portal/parent";
import {
  listPortalStudentProgressNotes,
  parseProgressNotesCursor,
  parseProgressNotesLimit,
} from "@/lib/portal/progressNotes";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const studentId = id?.trim();

    if (!studentId) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        field: "id",
      });
    }

    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    // Return 404 when the parent is not linked to avoid ID-guessing leakage.
    const linkError = await assertParentLinkedToStudent(
      tenantId,
      ctx.parentId,
      studentId,
    );
    if (linkError) return linkError;

    const url = new URL(req.url);
    const cursorParam = url.searchParams.get("cursor")?.trim() || null;
    const parsedCursor = parseProgressNotesCursor(cursorParam);
    if (cursorParam && !parsedCursor) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        field: "cursor",
      });
    }

    const page = await listPortalStudentProgressNotes({
      tenantId,
      studentId,
      limit: parseProgressNotesLimit(url.searchParams.get("limit")),
      cursor: cursorParam,
    });

    if (!page) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        field: "cursor",
      });
    }

    return NextResponse.json(page);
  } catch (error) {
    console.error("GET /api/portal/students/[id]/progress-notes failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}

