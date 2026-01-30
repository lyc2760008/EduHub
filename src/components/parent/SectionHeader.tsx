"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type SectionHeaderProps = {
  titleKey: string;
  actionLabelKey?: string;
  onAction?: () => void;
  href?: string;
};

export default function SectionHeader({
  titleKey,
  actionLabelKey = "generic.viewAll",
  onAction,
  href,
}: SectionHeaderProps) {
  const t = useTranslations();
  const shouldRenderAction = Boolean(onAction || href);

  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-[var(--text)] md:text-lg">
        {t(titleKey)}
      </h2>
      {shouldRenderAction ? (
        href ? (
          <Link
            href={href}
            className="inline-flex h-11 items-center rounded-lg px-2 text-sm text-[var(--primary)] transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            {t(actionLabelKey)}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex h-11 items-center rounded-lg px-2 text-sm text-[var(--primary)] transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            {t(actionLabelKey)}
          </button>
        )
      ) : null}
      {/* Action slot remains optional to keep sections lightweight on mobile. */}
    </div>
  );
}
