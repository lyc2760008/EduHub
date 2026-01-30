"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

type PageHeaderProps = {
  titleKey: string;
  subtitleKey?: string;
  actions?: ReactNode;
};

export default function PageHeader({
  titleKey,
  subtitleKey,
  actions,
}: PageHeaderProps) {
  const t = useTranslations();

  return (
    <div className="mb-4 md:mb-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold leading-tight text-[var(--text)] md:text-2xl">
            {t(titleKey)}
          </h1>
          {subtitleKey ? (
            <p className="text-xs text-[var(--muted)] md:text-sm">
              {t(subtitleKey)}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {/* Placeholder: introduce a lightweight loading state here if the header becomes async. */}
    </div>
  );
}
