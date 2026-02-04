"use client";

// Portal time hint keeps timezone messaging consistent on time-based pages.
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";

type PortalTimeHintProps = {
  className?: string;
};

export default function PortalTimeHint({ className = "" }: PortalTimeHintProps) {
  const t = useTranslations();
  const { data } = usePortalMe();

  const { labelKey, timeZone } = useMemo(() => {
    const tenantTimeZone = data?.tenant?.timeZone?.trim() ?? "";
    const localTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const resolvedTimeZone = tenantTimeZone || localTimeZone;
    const useLocal = !tenantTimeZone && Boolean(localTimeZone);

    return {
      labelKey: useLocal ? "portal.timeHint.local" : "portal.timeHint.label",
      timeZone: resolvedTimeZone,
    };
  }, [data?.tenant?.timeZone]);

  if (!timeZone) return null;

  return (
    <p className={`text-xs text-[var(--muted)] ${className}`}>
      {t(labelKey, { tz: timeZone })}
    </p>
  );
}
