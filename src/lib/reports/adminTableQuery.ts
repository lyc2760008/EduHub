import "server-only";

import { z } from "zod";

import { ReportApiError } from "@/lib/reports/adminReportErrors";
import { REPORT_LIMITS, type ReportSortDir } from "@/lib/reports/reportConfigs";

// Shared top-level query parser used by all admin reporting endpoints.
const baseQuerySchema = z.object({
  search: z.string().trim().max(REPORT_LIMITS.maxSearchLength).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortField: z.string().trim().min(1).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  filters: z.string().trim().optional(),
});

type TableQueryConfig<TFilters, TSortField extends string, TWhere, TDbRow, TApiRow> = {
  filterSchema: z.ZodType<TFilters>;
  allowedSortFields: readonly TSortField[];
  defaultSort: { field: TSortField; dir: ReportSortDir };
  defaultPageSize?: number;
  maxPageSize?: number;
  maxExportRows?: number;
  buildWhere: (args: {
    tenantId: string;
    search?: string;
    filters: TFilters;
  }) => TWhere;
  buildOrderBy: (field: TSortField, dir: ReportSortDir) => unknown;
  count: (where: TWhere) => Promise<number>;
  findMany: (args: {
    where: TWhere;
    orderBy: unknown;
    skip: number;
    take: number;
  }) => Promise<TDbRow[]>;
  mapRow: (row: TDbRow) => TApiRow;
};

export type ParsedAdminTableQuery<TFilters, TSortField extends string> = {
  search: string | undefined;
  filters: TFilters;
  appliedFilters: Record<string, unknown>;
  page: number;
  pageSize: number;
  sort: {
    field: TSortField;
    dir: ReportSortDir;
  };
};

export type AdminTableQueryResult<TApiRow, TSortField extends string> = {
  rows: TApiRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: {
    field: TSortField;
    dir: ReportSortDir;
  };
  appliedFilters: Record<string, unknown>;
  exportTruncated?: boolean;
};

// Parses filters JSON and validates it against a strict report-level allowlist schema.
function parseFilters<TFilters>(
  rawFilters: string | undefined,
  schema: z.ZodType<TFilters>,
) {
  if (!rawFilters) {
    const parsed = schema.safeParse({});
    if (!parsed.success) {
      throw new ReportApiError(400, "INVALID_QUERY", { field: "filters" });
    }
    return parsed.data;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawFilters);
  } catch {
    throw new ReportApiError(400, "INVALID_QUERY", {
      field: "filters",
      reason: "INVALID_JSON",
    });
  }

  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new ReportApiError(400, "INVALID_QUERY", {
      field: "filters",
      reason: "INVALID_OBJECT",
    });
  }

  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new ReportApiError(400, "INVALID_QUERY", {
      field: "filters",
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
      })),
    });
  }

  return parsed.data;
}

// Ensures date-only ranges are valid when reports provide {from,to} filter keys.
function assertDateRangeIfPresent(filters: Record<string, unknown>) {
  const from = typeof filters.from === "string" ? filters.from : undefined;
  const to = typeof filters.to === "string" ? filters.to : undefined;
  if (from && to && from > to) {
    throw new ReportApiError(400, "INVALID_QUERY", {
      field: "filters",
      reason: "INVALID_RANGE",
    });
  }
}

// Removes empty filter values so API responses expose only active filters.
function toAppliedFilters(filters: Record<string, unknown>) {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
  return Object.fromEntries(entries);
}

// Converts request search params into a typed, validated query contract.
export function parseAdminTableQuery<
  TFilters extends Record<string, unknown>,
  TSortField extends string,
>(
  searchParams: URLSearchParams,
  config: Pick<
    TableQueryConfig<TFilters, TSortField, unknown, unknown, unknown>,
    | "filterSchema"
    | "allowedSortFields"
    | "defaultSort"
    | "defaultPageSize"
    | "maxPageSize"
  >,
): ParsedAdminTableQuery<TFilters, TSortField> {
  const parsedBase = baseQuerySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    sortField: searchParams.get("sortField") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined,
    filters: searchParams.get("filters") ?? undefined,
  });

  if (!parsedBase.success) {
    throw new ReportApiError(400, "INVALID_QUERY", {
      field: "query",
      issues: parsedBase.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
      })),
    });
  }

  const pageSizeCap = config.maxPageSize ?? REPORT_LIMITS.maxPageSize;
  const defaultPageSize = config.defaultPageSize ?? REPORT_LIMITS.defaultPageSize;
  const pageSize = Math.min(parsedBase.data.pageSize ?? defaultPageSize, pageSizeCap);
  const page = parsedBase.data.page ?? 1;

  const sortField = (parsedBase.data.sortField ??
    config.defaultSort.field) as TSortField;
  if (!config.allowedSortFields.includes(sortField)) {
    throw new ReportApiError(400, "INVALID_QUERY", {
      field: "sortField",
      allowed: config.allowedSortFields,
    });
  }
  const sortDir = parsedBase.data.sortDir ?? config.defaultSort.dir;

  const filters = parseFilters(parsedBase.data.filters, config.filterSchema);
  assertDateRangeIfPresent(filters as Record<string, unknown>);

  return {
    search: parsedBase.data.search,
    filters,
    appliedFilters: toAppliedFilters(filters),
    page,
    pageSize,
    sort: {
      field: sortField,
      dir: sortDir,
    },
  };
}

// Runs a server-side paginated report query using the shared config contract.
export async function runAdminTableQuery<
  TFilters extends Record<string, unknown>,
  TSortField extends string,
  TWhere,
  TDbRow,
  TApiRow,
>(
  config: TableQueryConfig<TFilters, TSortField, TWhere, TDbRow, TApiRow>,
  args: {
    tenantId: string;
    parsedQuery: ParsedAdminTableQuery<TFilters, TSortField>;
  },
): Promise<AdminTableQueryResult<TApiRow, TSortField>> {
  const { tenantId, parsedQuery } = args;
  const where = config.buildWhere({
    tenantId,
    search: parsedQuery.search,
    filters: parsedQuery.filters,
  });
  const orderBy = config.buildOrderBy(parsedQuery.sort.field, parsedQuery.sort.dir);
  const skip = (parsedQuery.page - 1) * parsedQuery.pageSize;
  const take = parsedQuery.pageSize;

  const [totalCount, dbRows] = await Promise.all([
    config.count(where),
    config.findMany({ where, orderBy, skip, take }),
  ]);

  return {
    rows: dbRows.map((row) => config.mapRow(row)),
    totalCount,
    page: parsedQuery.page,
    pageSize: parsedQuery.pageSize,
    sort: parsedQuery.sort,
    appliedFilters: parsedQuery.appliedFilters,
  };
}

// Runs an export query that reuses identical filters/sort while enforcing row caps.
export async function runAdminTableExportQuery<
  TFilters extends Record<string, unknown>,
  TSortField extends string,
  TWhere,
  TDbRow,
  TApiRow,
>(
  config: TableQueryConfig<TFilters, TSortField, TWhere, TDbRow, TApiRow>,
  args: {
    tenantId: string;
    parsedQuery: ParsedAdminTableQuery<TFilters, TSortField>;
  },
): Promise<AdminTableQueryResult<TApiRow, TSortField>> {
  const { tenantId, parsedQuery } = args;
  const maxExportRows = config.maxExportRows ?? REPORT_LIMITS.maxExportRows;
  const where = config.buildWhere({
    tenantId,
    search: parsedQuery.search,
    filters: parsedQuery.filters,
  });
  const orderBy = config.buildOrderBy(parsedQuery.sort.field, parsedQuery.sort.dir);

  const totalCount = await config.count(where);
  const dbRows = await config.findMany({
    where,
    orderBy,
    skip: 0,
    take: maxExportRows,
  });

  return {
    rows: dbRows.map((row) => config.mapRow(row)),
    totalCount,
    page: 1,
    pageSize: maxExportRows,
    sort: parsedQuery.sort,
    appliedFilters: parsedQuery.appliedFilters,
    exportTruncated: totalCount > maxExportRows,
  };
}
