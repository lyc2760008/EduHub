"use client";

// Portal time hint keeps timezone messaging consistent on time-based pages.
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";

type PortalTimeHintProps = {
  className?: string;
  timeZones?: Array<string | null | undefined>;
};

export default function PortalTimeHint({
  className = "",
  timeZones = [],
}: PortalTimeHintProps) {
  const t = useTranslations();
  const { data } = usePortalMe();

  const { labelKey, timeZone } = useMemo(() => {
    // Deduplicate provided timezones so the hint can reflect per-center display.
    const uniqueTimeZones = Array.from(
      new Set(
        timeZones
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const tenantTimeZone = data?.tenant?.timeZone?.trim() ?? "";
    const localTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const resolvedTimeZone = tenantTimeZone || localTimeZone;
    const useLocal = !tenantTimeZone && Boolean(localTimeZone);
    if (uniqueTimeZones.length > 1) {
      return { labelKey: "portal.timeHint.multiple", timeZone: "" };
    }
    if (uniqueTimeZones.length === 1) {
      return { labelKey: "portal.timeHint.label", timeZone: uniqueTimeZones[0] };
    }

    return {
      labelKey: useLocal ? "portal.timeHint.local" : "portal.timeHint.label",
      timeZone: resolvedTimeZone,
    };
  }, [data?.tenant?.timeZone, timeZones]);

  if (!labelKey) return null;

  return (
    <p className={`text-xs text-[var(--muted)] ${className}`}>
      {labelKey === "portal.timeHint.multiple"
        ? t(labelKey)
        : t(labelKey, { tz: timeZone })}
    </p>
  );
}
