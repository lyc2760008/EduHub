// Shared unread-count hook powers parent/tutor/admin nav badges with tenant-scoped API counts.
"use client";

import { useCallback, useEffect, useState } from "react";

import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import {
  requestUnreadCountRefresh,
  subscribeUnreadCount,
} from "@/components/notifications/unreadCountBus";

type UnreadCountResponse = {
  unreadCount: number;
  countsByType?: {
    announcement?: number;
    homework?: number;
    request?: number;
  };
};

type UseUnreadNotificationsCountOptions = {
  scope?: "portal" | "admin";
};

function toCount(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function useUnreadNotificationsCount(
  tenant: string,
  options?: UseUnreadNotificationsCountOptions,
) {
  const scope = options?.scope ?? "portal";
  const [unreadCount, setUnreadCount] = useState(0);
  const [countsByType, setCountsByType] = useState({
    announcement: 0,
    homework: 0,
    request: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tenant) return;
    const result = await fetchJson<UnreadCountResponse>(
      buildTenantApiUrl(tenant, `/${scope}/notifications/unread-count`),
      { cache: "no-store" },
    );
    if (result.ok) {
      const nextCountsByType = {
        announcement: toCount(result.data.countsByType?.announcement),
        homework: toCount(result.data.countsByType?.homework),
        request: toCount(result.data.countsByType?.request),
      };
      setCountsByType(nextCountsByType);
      const fallbackTotal =
        nextCountsByType.announcement +
        nextCountsByType.homework +
        nextCountsByType.request;
      setUnreadCount(
        toCount(result.data.unreadCount) || fallbackTotal,
      );
    }
    setIsLoading(false);
  }, [scope, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void reload();
    }, 0);
    return () => clearTimeout(handle);
  }, [reload]);

  useEffect(() => {
    return subscribeUnreadCount((detail) => {
      if (typeof detail.count === "number") {
        setUnreadCount(Math.max(0, detail.count));
      }
      if (detail.refresh) {
        void reload();
      }
    });
  }, [reload]);

  return {
    unreadCount,
    countsByType,
    isLoading,
    reload,
    requestRefresh: requestUnreadCountRefresh,
  };
}
