"use client";

// Session row shared by dashboard, student overview, and sessions list.
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import { formatPortalDateTime, getSessionTypeLabelKey } from "@/lib/portal/format";

type SessionRowProps = {
  session: {
    id: string;
    startAt: string;
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
  const sessionTypeKey = getSessionTypeLabelKey(session.sessionType);
  const sessionTitle = session.groupName?.trim()
    ? session.groupName
    : sessionTypeKey
      ? t(sessionTypeKey)
      : t("generic.dash");

  const body = (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--text)]">
          {formatPortalDateTime(session.startAt, locale)}
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
        // data-testid ties the session row to its id for reliable assertions.
        data-testid={`portal-session-row-${session.id}`}
        className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        <Card padding="normal">{body}</Card>
      </Link>
    );
  }

  return (
    <div data-testid={`portal-session-row-${session.id}`}>
      <Card padding="normal">{body}</Card>
    </div>
  );
}

