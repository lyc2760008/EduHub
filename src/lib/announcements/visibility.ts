// Server-only visibility rules centralize tenant + published gating for portal announcement reads.
import "server-only";

import type { Prisma, Role } from "@/generated/prisma/client";

type AnnouncementVisibilityInput = {
  tenantId: string;
  role: Role;
  userId: string;
};

export function getAnnouncementVisibilityFilter({
  tenantId,
}: AnnouncementVisibilityInput): Prisma.AnnouncementWhereInput {
  // Step 22.8 v1: center-scoped targeting is intentionally not enabled unless PO approves it later.
  return {
    tenantId,
    status: "PUBLISHED",
    publishedAt: {
      not: null,
    },
  };
}
