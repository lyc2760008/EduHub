// Server-only query builder for the Step 22.9 missing-resources report and CSV export.
import "server-only";

import { z } from "zod";

import { SessionType, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  parseAdminTableQuery,
  type ParsedAdminTableQuery,
} from "@/lib/reports/adminTableQuery";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const optionalIdSchema = z.string().trim().min(1).optional();

const missingResourcesFilterSchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    centerId: optionalIdSchema,
    tutorId: optionalIdSchema,
    sessionType: z.nativeEnum(SessionType).optional(),
  })
  .strict();

const MISSING_RESOURCES_SORT_FIELDS = [
  "startAt",
  "tutorName",
  "centerName",
  "context",
] as const;

type MissingResourcesSortField = (typeof MISSING_RESOURCES_SORT_FIELDS)[number];

type MissingResourcesFilters = z.infer<typeof missingResourcesFilterSchema>;

type MissingResourcesParsedQuery = ParsedAdminTableQuery<
  MissingResourcesFilters,
  MissingResourcesSortField
>;

type MissingResourcesDbRow = Prisma.SessionGetPayload<{
  select: {
    id: true;
    startAt: true;
    endAt: true;
    sessionType: true;
    center: { select: { name: true } };
    tutor: { select: { name: true; email: true } };
    group: { select: { name: true } };
  };
}>;

export type MissingResourcesReportRow = {
  sessionId: string;
  startDateTime: string;
  endDateTime: string;
  contextLabel: string | null;
  tutorName: string;
  centerName: string;
  sessionType: SessionType;
  hasResources: boolean;
  resourceCount: number;
};

function toDateOnlyUtc(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function toDateOnlyString(date: Date) {
  return toDateOnlyUtc(date).toISOString().slice(0, 10);
}

function parseDateStart(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function parseDateEndExclusive(value: string) {
  return new Date(parseDateStart(value).getTime() + MS_PER_DAY);
}

function getDefaultDateRange() {
  const start = toDateOnlyUtc(new Date());
  const endInclusive = new Date(start.getTime() + 13 * MS_PER_DAY);
  return {
    from: toDateOnlyString(start),
    to: toDateOnlyString(endInclusive),
  };
}

function withDefaultDateFilters(filters: MissingResourcesFilters) {
  const defaults = getDefaultDateRange();
  return {
    ...filters,
    from: filters.from ?? defaults.from,
    to: filters.to ?? defaults.to,
  };
}

function buildOrderBy(
  field: MissingResourcesSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.SessionOrderByWithRelationInput> {
  if (field === "tutorName") {
    return [{ tutor: { name: dir } }, { startAt: "asc" }, { id: "asc" }];
  }
  if (field === "centerName") {
    return [{ center: { name: dir } }, { startAt: "asc" }, { id: "asc" }];
  }
  if (field === "context") {
    return [{ group: { name: dir } }, { startAt: "asc" }, { id: "asc" }];
  }
  return [{ startAt: dir }, { id: "asc" }];
}

function buildWhere(args: {
  tenantId: string;
  search: string | undefined;
  filters: MissingResourcesFilters;
}) {
  const filters = withDefaultDateFilters(args.filters);
  const andFilters: Prisma.SessionWhereInput[] = [
    {
      tenantId: args.tenantId,
      canceledAt: null,
      resources: {
        none: {},
      },
      startAt: {
        gte: parseDateStart(filters.from),
        lt: parseDateEndExclusive(filters.to),
      },
    },
  ];

  if (args.search) {
    andFilters.push({
      OR: [
        { center: { name: { contains: args.search, mode: "insensitive" } } },
        { tutor: { name: { contains: args.search, mode: "insensitive" } } },
        { tutor: { email: { contains: args.search, mode: "insensitive" } } },
        { group: { name: { contains: args.search, mode: "insensitive" } } },
      ],
    });
  }

  if (filters.centerId) {
    andFilters.push({ centerId: filters.centerId });
  }
  if (filters.tutorId) {
    andFilters.push({ tutorId: filters.tutorId });
  }
  if (filters.sessionType) {
    andFilters.push({ sessionType: filters.sessionType });
  }

  return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
}

function mapRow(row: MissingResourcesDbRow): MissingResourcesReportRow {
  return {
    sessionId: row.id,
    startDateTime: row.startAt.toISOString(),
    endDateTime: row.endAt.toISOString(),
    contextLabel: row.group?.name ?? null,
    tutorName: row.tutor.name?.trim() || row.tutor.email,
    centerName: row.center.name,
    sessionType: row.sessionType,
    hasResources: false,
    resourceCount: 0,
  };
}

export function parseMissingResourcesReportQuery(searchParams: URLSearchParams) {
  const parsed = parseAdminTableQuery(searchParams, {
    filterSchema: missingResourcesFilterSchema,
    allowedSortFields: MISSING_RESOURCES_SORT_FIELDS,
    defaultSort: { field: "startAt", dir: "asc" },
    defaultPageSize: 25,
    maxPageSize: 100,
  });

  const filtersWithDefaults = withDefaultDateFilters(parsed.filters);
  return {
    ...parsed,
    filters: filtersWithDefaults,
    appliedFilters: {
      ...parsed.appliedFilters,
      from: filtersWithDefaults.from,
      to: filtersWithDefaults.to,
    },
  } satisfies MissingResourcesParsedQuery;
}

export async function queryMissingResourcesReport(args: {
  tenantId: string;
  parsedQuery: MissingResourcesParsedQuery;
}) {
  const where = buildWhere({
    tenantId: args.tenantId,
    search: args.parsedQuery.search,
    filters: args.parsedQuery.filters,
  });
  const orderBy = buildOrderBy(
    args.parsedQuery.sort.field,
    args.parsedQuery.sort.dir,
  );
  const skip = (args.parsedQuery.page - 1) * args.parsedQuery.pageSize;
  const take = args.parsedQuery.pageSize;

  const [totalCount, rows] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        sessionType: true,
        center: { select: { name: true } },
        tutor: { select: { name: true, email: true } },
        group: { select: { name: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((row) => mapRow(row)),
    totalCount,
    page: args.parsedQuery.page,
    pageSize: args.parsedQuery.pageSize,
    sort: args.parsedQuery.sort,
    appliedFilters: args.parsedQuery.appliedFilters,
  };
}

export async function exportMissingResourcesReport(args: {
  tenantId: string;
  parsedQuery: MissingResourcesParsedQuery;
  maxRows: number;
}) {
  const where = buildWhere({
    tenantId: args.tenantId,
    search: args.parsedQuery.search,
    filters: args.parsedQuery.filters,
  });
  const orderBy = buildOrderBy(
    args.parsedQuery.sort.field,
    args.parsedQuery.sort.dir,
  );

  const totalCount = await prisma.session.count({ where });
  const rows = await prisma.session.findMany({
    where,
    orderBy,
    skip: 0,
    take: args.maxRows,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      sessionType: true,
      center: { select: { name: true } },
      tutor: { select: { name: true, email: true } },
      group: { select: { name: true } },
    },
  });

  return {
    rows: rows.map((row) => mapRow(row)),
    totalCount,
    exportTruncated: totalCount > args.maxRows,
    sort: args.parsedQuery.sort,
    appliedFilters: args.parsedQuery.appliedFilters,
  };
}
