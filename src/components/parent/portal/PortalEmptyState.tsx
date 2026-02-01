"use client";

// Portal-specific empty state wrapper to keep copy consistent across pages.
import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";

type PortalEmptyStateVariant = "noStudents" | "noUpcomingSessions" | "noAttendance";

type PortalEmptyStateProps = {
  variant: PortalEmptyStateVariant;
  testId?: string;
  actionLabelKey?: string;
  actionHref?: string;
  onAction?: () => void;
  hintKey?: string;
  icon?: ReactNode;
};

const VARIANT_COPY: Record<PortalEmptyStateVariant, { titleKey: string; bodyKey: string }> = {
  noStudents: {
    titleKey: "portal.empty.noStudents.title",
    bodyKey: "portal.empty.noStudents.body",
  },
  noUpcomingSessions: {
    titleKey: "portal.empty.noUpcomingSessions.title",
    bodyKey: "portal.empty.noUpcomingSessions.body",
  },
  noAttendance: {
    titleKey: "portal.empty.noAttendance.title",
    bodyKey: "portal.empty.noAttendance.body",
  },
};

export default function PortalEmptyState({
  variant,
  testId,
  actionLabelKey,
  actionHref,
  onAction,
  hintKey,
  icon,
}: PortalEmptyStateProps) {
  const t = useTranslations();
  const { titleKey, bodyKey } = VARIANT_COPY[variant];
  const showAction = Boolean(actionLabelKey && (actionHref || onAction));
  const resolvedTestId = testId ?? `portal-empty-${variant}`;

  return (
    <Card>
      <div
        className="mx-auto flex max-w-md flex-col items-center gap-3 py-8 text-center"
        // data-testid keeps empty state assertions stable across locales.
        data-testid={resolvedTestId}
      >
        {icon ? <div className="text-[var(--muted)]">{icon}</div> : null}
        <h3 className="text-base font-semibold text-[var(--text)] md:text-lg">
          {t(titleKey)}
        </h3>
        <p className="text-sm text-[var(--muted)]">{t(bodyKey)}</p>
        {hintKey ? (
          <p className="text-xs text-[var(--muted-2)]">{t(hintKey)}</p>
        ) : null}
        {showAction ? (
          actionHref ? (
            <Link
              href={actionHref}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              {t(actionLabelKey ?? "")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              {t(actionLabelKey ?? "")}
            </button>
          )
        ) : null}
      </div>
    </Card>
  );
}

