// Server-only DTO mappers keep API payloads stable and avoid leaking internal-only announcement fields.
import "server-only";

import type { AnnouncementReadRole } from "@/generated/prisma/client";

type AdminAnnouncementSource = {
  id: string;
  title: string;
  body: string;
  status: string;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  createdByUserId: string | null;
  createdByUser?: {
    id: string;
    name: string | null;
  } | null;
  _count?: {
    reads: number;
  };
};

type PortalAnnouncementSource = {
  id: string;
  title: string;
  body?: string;
  createdAt: Date;
  publishedAt: Date | null;
};

type AnnouncementRoleCounts = {
  parent: number;
  tutor: number;
  admin: number;
};

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function resolveAuthorName(source: AdminAnnouncementSource) {
  const userName = source.createdByUser?.name?.trim();
  return userName || null;
}

function getReadCount(counts: Record<AnnouncementReadRole, number>, role: AnnouncementReadRole) {
  return counts[role] ?? 0;
}

export function toAdminListDTO(source: AdminAnnouncementSource) {
  return {
    id: source.id,
    title: source.title,
    status: source.status,
    scope: source.scope,
    publishedAt: toIso(source.publishedAt),
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    createdByUserId: source.createdByUserId,
    authorName: resolveAuthorName(source),
    totalReads: source._count?.reads ?? 0,
  };
}

export function toAdminDetailDTO(source: AdminAnnouncementSource) {
  return {
    ...toAdminListDTO(source),
    body: source.body,
  };
}

export function toPortalListDTO(
  source: PortalAnnouncementSource,
  unread: boolean,
) {
  return {
    id: source.id,
    title: source.title,
    publishedAt: toIso(source.publishedAt ?? source.createdAt),
    unread,
  };
}

export function toPortalDetailDTO(
  source: PortalAnnouncementSource,
  unread: boolean,
) {
  return {
    id: source.id,
    title: source.title,
    body: source.body ?? "",
    publishedAt: toIso(source.publishedAt ?? source.createdAt),
    unread,
  };
}

export function toEngagementRowDTO(input: {
  announcement: AdminAnnouncementSource;
  roleCounts: Record<AnnouncementReadRole, number>;
  eligibleCount: number | null;
}) {
  const readsParent = getReadCount(input.roleCounts, "Parent");
  const readsTutor = getReadCount(input.roleCounts, "Tutor");
  const readsAdmin = getReadCount(input.roleCounts, "Admin");
  const totalReads = readsParent + readsTutor + readsAdmin;
  const eligibleCount = input.eligibleCount;
  const readRate =
    eligibleCount && eligibleCount > 0
      ? Number(((totalReads / eligibleCount) * 100).toFixed(2))
      : null;

  return {
    announcementId: input.announcement.id,
    title: input.announcement.title,
    publishedAt: toIso(input.announcement.publishedAt),
    status: input.announcement.status,
    totalReads,
    readsByRole: {
      parent: readsParent,
      tutor: readsTutor,
      admin: readsAdmin,
    } satisfies AnnouncementRoleCounts,
    eligibleCount,
    readRate,
  };
}
