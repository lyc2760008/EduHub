/**
 * @state.route /[tenant]/admin/groups/[id]
 * @state.area admin
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Group detail page with roster/tutor management using shared RBAC gate + shell.
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { Role } from "@/generated/prisma/client";
import GroupDetailClient from "@/components/admin/groups/GroupDetailClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { prisma } from "@/lib/db/prisma";
import { getUsersForTenant } from "@/lib/users/data";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
    id: string;
  }>;
};

export default async function GroupDetailPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant, id } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const tenantId = access.tenant.tenantId;

        const group = await prisma.group.findFirst({
          where: { id, tenantId },
          select: {
            id: true,
            name: true,
            type: true,
            centerId: true,
            programId: true,
            levelId: true,
            isActive: true,
            capacity: true,
            notes: true,
            center: { select: { name: true } },
            program: { select: { name: true } },
            level: { select: { name: true } },
            tutors: {
              select: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
            students: {
              select: {
                student: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    preferredName: true,
                  },
                },
              },
            },
          },
        });

        if (!group) {
          return (
            <AdminPageShell
              title={t("admin.groups.title")}
              maxWidth="max-w-6xl"
              testId="group-detail-missing"
              actions={
                <Link
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                  href={`/${tenant}/admin/groups`}
                >
                  {t("admin.groups.actions.back")}
                </Link>
              }
            >
              <p className="text-sm text-slate-600">
                {t("admin.groups.messages.notFound")}
              </p>
            </AdminPageShell>
          );
        }

        const [students, users] = await Promise.all([
          prisma.student.findMany({
            where: { tenantId },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          }),
          getUsersForTenant(prisma, tenantId),
        ]);

        const eligibleTutors = users
          .filter(
            (user) =>
              user.role === "Tutor" &&
              user.centers.some((center) => center.id === group.centerId),
          )
          .map((user) => ({ id: user.id, name: user.name, email: user.email }));

        const tutorMap = new Map<
          string,
          { id: string; name: string | null; email: string }
        >();
        for (const tutor of eligibleTutors) {
          tutorMap.set(tutor.id, tutor);
        }
        for (const link of group.tutors) {
          const tutor = link.user;
          tutorMap.set(tutor.id, tutor);
        }

        const tutorOptions = Array.from(tutorMap.values()).sort((a, b) => {
          const aKey = (a.name ?? a.email).toLowerCase();
          const bKey = (b.name ?? b.email).toLowerCase();
          return aKey.localeCompare(bKey);
        });

        const initialGroup = {
          id: group.id,
          name: group.name,
          type: group.type,
          centerId: group.centerId,
          centerName: group.center.name,
          programId: group.programId,
          programName: group.program.name,
          levelId: group.levelId,
          levelName: group.level?.name ?? null,
          isActive: group.isActive,
          capacity: group.capacity,
          notes: group.notes,
          tutors: group.tutors.map((link) => link.user),
          students: group.students.map((link) => link.student),
        };

        return (
          <AdminPageShell
            title={t("admin.groups.detailTitle")}
            subtitle={group.name}
            maxWidth="max-w-6xl"
            testId="group-detail-page"
            actions={
              <Link
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                href={`/${tenant}/admin/groups`}
              >
                {t("admin.groups.actions.back")}
              </Link>
            }
          >
            <GroupDetailClient
              group={initialGroup}
              tutors={tutorOptions}
              students={students}
              tenant={tenant}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
