/**
 * @state.route /[tenant]/admin/sessions/[id]
 * @state.area admin
 * @state.capabilities view:detail, report_absence:create_request
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Session detail page with roster display and RBAC via AdminAccessGate.
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import type { Role } from "@/generated/prisma/client";
import SessionAttendanceSection from "@/components/admin/sessions/SessionAttendanceSection";
import SessionNotesSection from "@/components/admin/sessions/SessionNotesSection";
import SessionZoomLinkSection from "@/components/admin/sessions/SessionZoomLinkSection";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

type PageProps = {
  params: Promise<{
    tenant: string;
    id: string;
  }>;
};

export default async function SessionDetailPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  const locale = await getLocale();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant, id } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={READ_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const tenantId = access.tenant.tenantId;
        const isTutor = access.membership.role === "Tutor";
        const canEditZoomLink =
          access.membership.role === "Owner" || access.membership.role === "Admin";
        // Pass viewer identity to client sections that resolve absence requests.
        const viewerName = access.user.name ?? null;
        const viewerEmail = access.user.email ?? "";

        const session = await prisma.session.findFirst({
          where: {
            id,
            tenantId,
            ...(isTutor ? { tutorId: access.user.id } : {}),
          },
          select: {
            id: true,
            centerId: true,
            center: { select: { name: true } },
            tutorId: true,
            tutor: { select: { name: true, email: true } },
            sessionType: true,
            groupId: true,
            group: { select: { name: true, type: true } },
            startAt: true,
            endAt: true,
            timezone: true,
            zoomLink: true,
            sessionStudents: {
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

        if (!session) {
          return (
            <AdminPageShell
              title={t("admin.sessions.title")}
              maxWidth="max-w-6xl"
              testId="session-detail-missing"
              actions={
                <Link
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                  href={`/${tenant}/admin/sessions`}
                >
                  {t("admin.sessions.actions.back")}
                </Link>
              }
            >
              <p className="text-sm text-slate-600">
                {t("admin.sessions.messages.notFound")}
              </p>
            </AdminPageShell>
          );
        }

        let roster = session.sessionStudents.map((entry) => entry.student);
        if (!roster.length && session.groupId) {
          // If session roster is missing, fall back to the current group roster.
          const groupRoster = await prisma.groupStudent.findMany({
            where: { tenantId, groupId: session.groupId },
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
          });
          roster = groupRoster.map((entry) => entry.student);
        }
        const tutorLabel = session.tutor.name ?? session.tutor.email;
        const formatDateTime = (date: Date) =>
          new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: session.timezone,
          }).format(date);

        return (
          <AdminPageShell
            title={t("admin.sessions.detailTitle")}
            subtitle={`${session.center.name} · ${formatDateTime(session.startAt)}`}
            maxWidth="max-w-6xl"
            testId="session-detail-page"
            actions={
              <Link
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                href={`/${tenant}/admin/sessions`}
              >
                {t("admin.sessions.actions.back")}
              </Link>
            }
          >
            <section className="rounded border border-slate-200 bg-white p-5">
              <h2
                className="text-lg font-semibold text-slate-900"
                data-testid="session-detail-title"
              >
                {t("admin.sessions.sections.overview")}
              </h2>
              <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                <div>
                  <span className="text-xs uppercase text-slate-500">
                    {t("admin.sessions.fields.center")}
                  </span>
                  <p className="mt-1 font-medium">{session.center.name}</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500">
                    {t("admin.sessions.fields.tutor")}
                  </span>
                  <p className="mt-1 font-medium">{tutorLabel}</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500">
                    {t("admin.sessions.fields.type")}
                  </span>
                  <p className="mt-1 font-medium">
                    {t(
                      session.sessionType === "ONE_ON_ONE"
                        ? "admin.sessions.types.oneOnOne"
                        : session.sessionType === "GROUP"
                          ? "admin.sessions.types.group"
                          : "admin.sessions.types.class",
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500">
                    {t("admin.sessions.fields.group")}
                  </span>
                  <p className="mt-1 font-medium">
                    {session.group?.name ??
                      t("admin.sessions.messages.noGroup")}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500">
                    {t("admin.sessions.fields.startAt")}
                  </span>
                  <p className="mt-1 font-medium">
                    {formatDateTime(session.startAt)}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500">
                    {t("admin.sessions.fields.endAt")}
                  </span>
                  <p className="mt-1 font-medium">
                    {formatDateTime(session.endAt)}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500">
                    {t("session.zoomLink.label")}
                  </span>
                  <p className="mt-1 font-medium">
                    {session.zoomLink?.trim()
                      ? t("session.zoomLink.open")
                      : t("generic.dash")}
                  </p>
                </div>
              </div>
            </section>

            {/* Zoom link editing is restricted to admin-owner roles on the server. */}
            <SessionZoomLinkSection
              canEdit={canEditZoomLink}
              initialZoomLink={session.zoomLink}
              sessionId={session.id}
              tenant={tenant}
            />

            {/* Attendance section uses client-side fetch to keep page load minimal. */}
            <SessionAttendanceSection
              sessionId={session.id}
              tenant={tenant}
              viewerRole={access.membership.role}
              viewerName={viewerName}
              viewerEmail={viewerEmail}
            />

            {/* Notes section stays client-side to fetch and save session notes. */}
            <SessionNotesSection sessionId={session.id} tenant={tenant} />

            <section className="rounded border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("admin.sessions.sections.roster")}
                </h2>
                <span className="text-sm text-slate-500">
                  {t("admin.sessions.fields.studentsCount", {
                    count: roster.length,
                  })}
                </span>
              </div>
              <div className="mt-4" data-testid="session-detail-roster">
                {roster.length ? (
                  <ul className="grid gap-2 text-sm text-slate-700">
                    {roster.map((student) => (
                      <li
                        key={student.id}
                        className="rounded border border-slate-200 px-3 py-2"
                      >
                        {student.preferredName?.trim().length
                          ? `${student.preferredName} ${student.lastName}`
                          : `${student.firstName} ${student.lastName}`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    {t("admin.sessions.messages.noRoster")}
                  </p>
                )}
              </div>
            </section>
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
