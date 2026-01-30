"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type EmptyStateProps = {
  titleKey: string;
  bodyKey?: string;
  actionLabelKey?: string;
  onAction?: () => void;
  href?: string;
  icon?: ReactNode;
};

export default function EmptyState({
  titleKey,
  bodyKey,
  actionLabelKey,
  onAction,
  href,
  icon,
}: EmptyStateProps) {
  const t = useTranslations();
  const shouldRenderAction = Boolean(actionLabelKey && (onAction || href));

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
      {/* Optional icon slot keeps empty states friendly without extra text. */}
      {icon ? <div className="text-[var(--muted)]">{icon}</div> : null}
      <h3 className="text-base font-semibold text-[var(--text)] md:text-lg">
        {t(titleKey)}
      </h3>
      {bodyKey ? (
        <p className="text-sm text-[var(--muted)]">{t(bodyKey)}</p>
      ) : null}
      {shouldRenderAction ? (
        href ? (
          <Link
            href={href}
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
  );
}
