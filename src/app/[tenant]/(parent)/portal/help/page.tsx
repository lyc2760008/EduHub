/**
 * @state.route /[tenant]/portal/help
 * @state.area parent
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
"use client";

// Help page provides static guidance and trust messaging for the parent portal.
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import { buildPortalSupportLine } from "@/components/parent/portal/support";

type HelpItem = {
  questionKey: string;
  answerKey: string;
};

const QUICK_START_ITEMS: HelpItem[] = [
  {
    questionKey: "portal.help.q.login",
    answerKey: "portal.help.a.login",
  },
  {
    questionKey: "portal.help.q.pages",
    answerKey: "portal.help.a.pages",
  },
  {
    questionKey: "portal.help.q.scheduleAttendance",
    answerKey: "portal.help.a.scheduleAttendance",
  },
  {
    questionKey: "portal.help.q.incorrectInfo",
    answerKey: "portal.help.a.incorrectInfo",
  },
  {
    questionKey: "portal.help.q.contactSupport",
    answerKey: "portal.help.a.contactSupport",
  },
];

const FAQ_ITEMS: HelpItem[] = [
  {
    questionKey: "portal.help.q.gettingStarted",
    answerKey: "portal.help.a.gettingStarted",
  },
  {
    questionKey: "portal.help.q.missingStudents",
    answerKey: "portal.help.a.missingStudents",
  },
  {
    questionKey: "portal.help.q.timezone",
    answerKey: "portal.help.a.timezone",
  },
  {
    questionKey: "portal.help.q.attendanceStatuses",
    answerKey: "portal.help.a.attendanceStatuses",
  },
  {
    questionKey: "portal.help.q.absenceRequests",
    answerKey: "portal.help.a.absenceRequests",
  },
  {
    questionKey: "portal.help.q.troubleshooting",
    answerKey: "portal.help.a.troubleshooting",
  },
];

export default function PortalHelpPage() {
  const t = useTranslations();
  const { data, isLoading, error, reload } = usePortalMe();
  // Precompute the support line so the contact FAQ can inject tenant-aware copy.
  const supportContactLine = buildPortalSupportLine({
    t,
    centerName: data?.tenant.displayName ?? data?.tenant.slug ?? null,
    supportEmail: data?.tenant.supportEmail ?? null,
    supportPhone: data?.tenant.supportPhone ?? null,
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-help-loading">
        <PortalSkeletonBlock className="h-8 w-28" />
        <PortalSkeletonBlock className="h-4 w-72" />
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <PortalSkeletonBlock key={index} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-help-error">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.help.error.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.help.error.body")}
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

  return (
    <div className="space-y-6" data-testid="portal-help-page">
      <PageHeader titleKey="portal.help.title" subtitleKey="portal.help.helper" />

      <Card>
        <div
          className="space-y-6"
          // Data-testid keeps the help accordion stable for E2E smoke coverage.
          data-testid="portal-help-accordion"
        >
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              {t("portal.help.section.quickStart")}
            </h2>
            {QUICK_START_ITEMS.map((item) => (
              <details
                key={item.questionKey}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                  {t(item.questionKey)}
                  <span
                    aria-hidden="true"
                    className="text-lg text-[var(--muted)] transition group-open:rotate-180"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {item.answerKey === "portal.help.a.contactSupport"
                    ? t(item.answerKey, { supportContactLine })
                    : t(item.answerKey)}
                </p>
              </details>
            ))}
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              {t("portal.help.section.moreHelp")}
            </h2>
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.questionKey}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                  {t(item.questionKey)}
                  <span
                    aria-hidden="true"
                    className="text-lg text-[var(--muted)] transition group-open:rotate-180"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {t(item.answerKey)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
