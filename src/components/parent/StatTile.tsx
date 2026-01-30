"use client";

import { useTranslations } from "next-intl";

import Card from "./Card";

type StatTileProps = {
  labelKey: string;
  value?: string | number | null;
  subtextKey?: string;
  status?: "neutral" | "success" | "warning";
};

export default function StatTile({
  labelKey,
  value,
  subtextKey,
  status = "neutral",
}: StatTileProps) {
  const t = useTranslations();
  const displayValue = value ?? t("generic.dash");
  const valueToneClassName =
    status === "success"
      ? "text-[var(--success)]"
      : status === "warning"
        ? "text-[var(--warning)]"
        : "text-[var(--text)]";

  return (
    <Card variant="subtle" padding="normal">
      {/* Lightweight stats omit skeletons; add a loader here when data becomes async. */}
      <div className="space-y-1">
        <p className="text-xs text-[var(--muted)] md:text-sm">
          {t(labelKey)}
        </p>
        <p className={`text-xl font-semibold ${valueToneClassName}`}>
          {displayValue}
        </p>
        {subtextKey ? (
          <p className="text-xs text-[var(--muted-2)]">{t(subtextKey)}</p>
        ) : null}
      </div>
    </Card>
  );
}
