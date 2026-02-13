/**
 * @state.route /api/admin/audit/export
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.6 audit CSV export endpoint (tenant-scoped and redacted).
 */
// Audit CSV export reuses the same query parser/redaction as the list endpoint for filter parity.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import {
  parseAuditEventQuery,
  queryAuditEventsExport,
} from "@/lib/audit/queryAuditEvents";
import {
  redactAuditEvent,
  summarizeAuditMetadata,
} from "@/lib/audit/redactAuditEvent";
import { requireRole } from "@/lib/rbac";
import { toCsv, type CsvColumn } from "@/lib/reports/adminReportCsv";
import {
  ReportApiError,
  normalizeRoleError,
  toReportErrorResponse,
} from "@/lib/reports/adminReportErrors";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type AuditExportRow = ReturnType<typeof redactAuditEvent>;

const csvColumns: CsvColumn<AuditExportRow>[] = [
  {
    key: "timestamp",
    header: "timestamp",
    getValue: (row) => row.occurredAt,
  },
  {
    key: "action",
    header: "action",
    getValue: (row) => row.action,
  },
  {
    key: "result",
    header: "result",
    getValue: (row) => row.result,
  },
  {
    key: "entityType",
    header: "entityType",
    getValue: (row) => row.entityType ?? "",
  },
  {
    key: "entityId",
    header: "entityId",
    getValue: (row) => row.entityId ?? "",
  },
  {
    key: "actorId",
    header: "actorId",
    getValue: (row) => row.actorId ?? (row.actorType === "SYSTEM" ? "system" : ""),
  },
  {
    key: "correlationId",
    header: "correlationId",
    getValue: (row) => row.correlationId ?? "",
  },
  {
    key: "metadataSummary",
    header: "metadata_summary",
    getValue: (row) => summarizeAuditMetadata(row.metadata),
  },
];

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first so only Owner/Admin can export tenant audit data.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const parsedQuery = parseAuditEventQuery(new URL(req.url).searchParams);
    const exportResult = await queryAuditEventsExport({
      tenantId,
      parsedQuery,
    });

    const rows = exportResult.items.map((item) => redactAuditEvent(item));
    const csv = toCsv(csvColumns, rows);

    const headers = new Headers({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-export.csv"',
      "Cache-Control": "no-store",
    });

    // Signal truncation to callers when export row count hits the server-side cap.
    if (exportResult.truncated) {
      headers.set("X-Export-Truncated", "true");
    }

    return new NextResponse(csv, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/audit/export failed", error);
    }
    return toReportErrorResponse(error);
  }
}
