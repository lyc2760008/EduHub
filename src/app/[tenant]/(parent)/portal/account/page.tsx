"use client";

// Account page surfaces read-only identity data from the portal /me endpoint.
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";

export default function PortalAccountPage() {
  const t = useTranslations();
  const { data, isLoading, error, reload } = usePortalMe();

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-account-loading">
        <PortalSkeletonBlock className="h-8 w-32" />
        <PortalSkeletonBlock className="h-4 w-64" />
        <PortalSkeletonBlock className="h-28" />
        <PortalSkeletonBlock className="h-36" />
        <PortalSkeletonBlock className="h-20" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-account-error">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.account.error.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.account.error.body")}
          </p>
          <button
            type="button"
            onClick={() => reload()}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.common.tryAgain")}
          </button>
        </div>
      </Card>
    );
  }

  const tenantDisplay =
    data.tenant.displayName?.trim() || data.tenant.slug?.trim() || "";

  return (
    <div className="space-y-6" data-testid="portal-account-page">
      <PageHeader
        titleKey="portal.account.title"
        subtitleKey="portal.account.helper"
      />

      <Card>
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.account.section.info")}
          </h2>
          <div className="grid gap-3 text-sm">
            <div className="grid gap-1">
              <span className="text-xs font-semibold text-[var(--muted)]">
                {t("portal.account.field.email")}
              </span>
              <span className="text-sm text-[var(--text)]">{data.parent.email}</span>
            </div>
            {tenantDisplay ? (
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-[var(--muted)]">
                  {t("portal.account.field.tenant")}
                </span>
                <span className="text-sm text-[var(--text)]">{tenantDisplay}</span>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.account.section.students")}
          </h2>
          {data.students.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              {t("portal.account.students.empty")}
            </p>
          ) : (
            <div className="grid gap-2">
              {data.students.map((student) => {
                const statusKey = student.isActive
                  ? "portal.student.status.active"
                  : "portal.student.status.inactive";
                const statusToneClassName = student.isActive
                  ? "border-[var(--success)] text-[var(--success)]"
                  : "border-[var(--border)] text-[var(--muted)]";

                return (
                  <div
                    key={student.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-[var(--text)]">
                      {student.displayName}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${statusToneClassName}`}
                    >
                      {t(statusKey)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card variant="subtle">
        <div className="space-y-2 text-sm text-[var(--muted)]">
          <p>{t("portal.account.guidance.missingStudents")}</p>
          <p>{t("portal.account.guidance.securityTip")}</p>
        </div>
      </Card>
    </div>
  );
}
