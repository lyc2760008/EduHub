"use client";

// Student summary card used by the parent portal list + dashboard preview.
import Link from "next/link";
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";

type StudentCardProps = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    level?: { id: string; name: string } | null;
    isActive: boolean;
  };
  href: string;
};

export default function StudentCard({ student, href }: StudentCardProps) {
  const t = useTranslations();
  const statusLabelKey = student.isActive
    ? "portal.student.status.active"
    : "portal.student.status.inactive";
  const statusToneClassName = student.isActive
    ? "border-[var(--success)] text-[var(--success)]"
    : "border-[var(--border)] text-[var(--muted)]";

  return (
    <Link
      href={href}
      // data-testid binds the rendered card to the student id for deterministic tests.
      data-testid={`portal-student-card-${student.id}`}
      className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
    >
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-base font-semibold text-[var(--text)]">
              {student.firstName} {student.lastName}
            </p>
            {student.level?.name ? (
              <p className="text-xs text-[var(--muted)]">
                {t("portal.student.level.label")}: {student.level.name}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full border px-2 py-1 text-xs font-medium ${statusToneClassName}`}
            >
              {t(statusLabelKey)}
            </span>
            <span className="text-sm text-[var(--muted)]">
              {t("portal.common.open")}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

