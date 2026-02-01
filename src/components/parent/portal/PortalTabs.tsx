"use client";

// Lightweight segmented tabs for the parent portal (two-tab layout in v1).
import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";

type PortalTabOption = {
  key: string;
  labelKey: string;
};

type PortalTabsProps = {
  options: PortalTabOption[];
  activeKey: string;
  onChange: (key: string) => void;
};

export default function PortalTabs({
  options,
  activeKey,
  onChange,
}: PortalTabsProps) {
  const t = useTranslations();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const nextKey = event.currentTarget.value;
    if (nextKey !== activeKey) {
      onChange(nextKey);
    }
  }

  return (
    <div className="inline-flex rounded-full bg-[var(--surface-2)] p-1">
      {options.map((option) => {
        const isActive = option.key === activeKey;
        const className = isActive
          ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
          : "text-[var(--muted)] hover:text-[var(--text)]";

        return (
          <button
            key={option.key}
            type="button"
            value={option.key}
            onClick={handleClick}
            className={`h-9 rounded-full px-4 text-sm font-medium transition ${className}`}
            aria-pressed={isActive}
            // data-testid keeps tab toggles stable for portal E2E selectors.
            data-testid={`portal-tab-${option.key}`}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

