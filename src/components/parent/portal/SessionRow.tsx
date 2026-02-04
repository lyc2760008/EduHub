"use client";

// Session row shared by dashboard, student overview, and sessions list.
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import {
  formatPortalDateTime,
  formatPortalDateTimeRange,
  getSessionTypeLabelKey,
} from "@/lib/portal/format";

type SessionRowProps = {
  session: {
    id: string;
    startAt: string;
    endAt?: string | null;
    timezone?: string | null;
    sessionType: string;
    groupName?: string | null;
    studentName?: string | null;
  };
  href?: string;
  showStudentName?: boolean;
};

export default function SessionRow({
  session,
  href,
  showStudentName = true,
}: SessionRowProps) {
  const t = useTranslations();
  const locale = useLocale();
  // Use the portal time zone so session times match the trust hint on each page.
  const { data: portalMe } = usePortalMe();
  // Prefer per-session timezone so parent times align with admin display.
  const timeZone = session.timezone ?? portalMe?.tenant?.timeZone ?? undefined;
  const sessionTypeKey = getSessionTypeLabelKey(session.sessionType);
  const sessionTitle = session.groupName?.trim()
    ? session.groupName
    : sessionTypeKey
      ? t(sessionTypeKey)
      : t("generic.dash");
  const dateTimeLabel =
    formatPortalDateTimeRange(session.startAt, session.endAt, locale, timeZone) ||
    formatPortalDateTime(session.startAt, locale, timeZone);

  const body = (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--text)]">
          {dateTimeLabel}
        </p>
        <p className="text-sm text-[var(--muted)]">{sessionTitle}</p>
        {showStudentName && session.studentName ? (
          <p className="text-xs text-[var(--muted-2)]">{session.studentName}</p>
        ) : null}
      </div>
      <span className="text-sm text-[var(--muted)]">{t("portal.common.open")}</span>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        // data-testid and timestamps keep session list sorting assertions stable in E2E.
        data-testid={`portal-session-row-${session.id}`}
        data-start-at={session.startAt}
        data-end-at={session.endAt ?? ""}
        className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        <Card padding="normal">{body}</Card>
      </Link>
    );
  }

  return (
    <div
      data-testid={`portal-session-row-${session.id}`}
      data-start-at={session.startAt}
      data-end-at={session.endAt ?? ""}
    >
      <Card padding="normal">{body}</Card>
    </div>
  );
}

