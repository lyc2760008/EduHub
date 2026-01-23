// Shared centers query helper for admin pages and future session forms.
import { prisma } from "@/lib/db/prisma";

// Minimal center shape for UI rendering and editing (no Date serialization).
export type CenterRecord = {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
};

export type GetCentersOptions = {
  includeInactive?: boolean;
};

export async function getCenters(
  tenantId: string,
  options: GetCentersOptions = {}
): Promise<CenterRecord[]> {
  const includeInactive = options.includeInactive ?? false;

  // TenantId is explicit to enforce tenant isolation at the call site.
  return prisma.center.findMany({
    where: {
      tenantId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      timezone: true,
      isActive: true,
      address1: true,
      address2: true,
      city: true,
      province: true,
      postalCode: true,
      country: true,
    },
  });
}
