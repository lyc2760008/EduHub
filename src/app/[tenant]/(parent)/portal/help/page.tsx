"use client";

// Help page provides static guidance and trust messaging for the parent portal.
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";

type HelpItem = {
  questionKey: string;
  answerKey: string;
};

const HELP_ITEMS: HelpItem[] = [
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
  const { isLoading, error, reload } = usePortalMe();

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
        <div className="space-y-3">
          {HELP_ITEMS.map((item) => (
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
      </Card>
    </div>
  );
}
