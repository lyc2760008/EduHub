// Server-only engagement helpers keep announcement read aggregation consistent across JSON and CSV endpoints.
import "server-only";

import type {
  AnnouncementReadRole,
  AnnouncementStatus,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { toEngagementRowDTO } from "@/lib/announcements/dto";
import {
  buildAnnouncementEngagementOrderBy,
  buildAnnouncementEngagementWhere,
  type ParsedAnnouncementEngagementQuery,
} from "@/lib/announcements/query";

type AnnouncementEngagementSource = {
  id: string;
  title: string;
  status: AnnouncementStatus;
  scope: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  createdByUserId: string | null;
};

const ZERO_ROLE_COUNTS: Record<AnnouncementReadRole, number> = {
  Parent: 0,
  Tutor: 0,
  Admin: 0,
};

export type AnnouncementEngagementRow = ReturnType<typeof toEngagementRowDTO>;

type QueryAnnouncementEngagementArgs = {
  tenantId: string;
  parsedQuery: ParsedAnnouncementEngagementQuery;
  takeOverride?: number;
};

function buildEmptyRoleCounts() {
  return { ...ZERO_ROLE_COUNTS };
}

async function getRoleCountsByAnnouncement(args: {
  tenantId: string;
  announcementIds: string[];
}) {
  if (!args.announcementIds.length) {
    return new Map<string, Record<AnnouncementReadRole, number>>();
  }

  const grouped = await prisma.announcementRead.groupBy({
    by: ["announcementId", "roleAtRead"],
    where: {
      tenantId: args.tenantId,
      announcementId: {
        in: args.announcementIds,
      },
    },
    _count: {
      _all: true,
    },
  });

  const map = new Map<string, Record<AnnouncementReadRole, number>>();
  for (const row of grouped) {
    const current = map.get(row.announcementId) ?? buildEmptyRoleCounts();
    current[row.roleAtRead] = row._count._all;
    map.set(row.announcementId, current);
  }
  return map;
}

export async function queryAnnouncementEngagementRows({
  tenantId,
  parsedQuery,
  takeOverride,
}: QueryAnnouncementEngagementArgs) {
  const where = buildAnnouncementEngagementWhere({
    tenantId,
    search: parsedQuery.search,
    filters: parsedQuery.filters,
  });
  const orderBy = buildAnnouncementEngagementOrderBy(
    parsedQuery.sort.field,
    parsedQuery.sort.dir,
  );
  const skip = takeOverride ? 0 : (parsedQuery.page - 1) * parsedQuery.pageSize;
  const take = takeOverride ?? parsedQuery.pageSize;

  const [totalCount, announcements] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      orderBy: orderBy as Prisma.Enumerable<Prisma.AnnouncementOrderByWithRelationInput>,
      skip,
      take,
      select: {
        id: true,
        title: true,
        status: true,
        scope: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        createdByUserId: true,
      },
    }),
  ]);

  const announcementIds = announcements.map((announcement) => announcement.id);
  const roleCountsByAnnouncement = await getRoleCountsByAnnouncement({
    tenantId,
    announcementIds,
  });

  const rows = announcements.map((announcement) =>
    toEngagementRowDTO({
      announcement: announcement as AnnouncementEngagementSource,
      roleCounts:
        roleCountsByAnnouncement.get(announcement.id) ?? buildEmptyRoleCounts(),
      // Audience denominator is intentionally null in v1 until a policy-safe definition is approved.
      eligibleCount: null,
    }),
  );

  return {
    rows,
    totalCount,
    page: parsedQuery.page,
    pageSize: parsedQuery.pageSize,
    sort: parsedQuery.sort,
    appliedFilters: parsedQuery.appliedFilters,
  };
}
