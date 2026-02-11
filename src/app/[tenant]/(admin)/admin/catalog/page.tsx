/**
 * @state.route /[tenant]/admin/catalog
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Catalog hub page that groups academic modules for faster admin navigation.
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { Role } from "@/generated/prisma/client";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function CatalogHubPage({ params }: PageProps) {
  // i18n: resolve localized copy on the server to keep admin pages consistent.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  const catalogLinks = [
    {
      key: "subjects",
      href: `/${tenant}/admin/subjects`,
      titleKey: "catalog.subjects",
      descriptionKey: "catalog.subjectsDesc",
    },
    {
      key: "levels",
      href: `/${tenant}/admin/levels`,
      titleKey: "catalog.levels",
      descriptionKey: "catalog.levelsDesc",
    },
    {
      key: "programs",
      href: `/${tenant}/admin/programs`,
      titleKey: "catalog.programs",
      descriptionKey: "catalog.programsDesc",
    },
  ] as const;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {() => (
        <AdminPageShell
          title={t("catalog.title")}
          maxWidth="max-w-5xl"
          testId="catalog-page"
        >
          {/* Catalog hub keeps academic modules discoverable and consistent. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {catalogLinks.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                // Full-card link keeps navigation simple without extra buttons.
                className="rounded border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                data-testid={`catalog-card-${link.key}`}
              >
                <div className="flex flex-col gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    {t(link.titleKey)}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {t(link.descriptionKey)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
