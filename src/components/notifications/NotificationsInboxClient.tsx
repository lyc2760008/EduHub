// Shared notifications inbox client powers parent+tutor routes using the same tenant-safe API contract.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { publishUnreadCount } from "@/components/notifications/unreadCountBus";
import { useUnreadNotificationsCount } from "@/components/notifications/useUnreadNotificationsCount";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

type InboxType = "ANNOUNCEMENT" | "HOMEWORK" | "REQUEST";
type InboxStatus = "all" | "unread";
type InboxTypeFilter = "all" | "announcement" | "homework" | "request";

type InboxItem = {
  id: string;
  type: InboxType;
  title: string;
  bodyPreview: string | null;
  createdAt: string;
  readAt: string | null;
  targetType: string | null;
  targetId: string | null;
  targetUrl: string | null;
};

type InboxResponse = {
  items: InboxItem[];
  pageInfo?: {
    nextCursor?: string | null;
  };
};

type MarkReadResponse = {
  ok: boolean;
  readAt: string | null;
};

type MarkAllResponse = {
  ok: boolean;
  markedReadCount: number;
};

type NotificationsInboxClientProps = {
  tenant: string;
  surface: "portal" | "tutor";
};

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getTypeFilterValue(type: InboxTypeFilter) {
  return type;
}

function getTypeLabelKey(type: InboxType) {
  if (type === "HOMEWORK") return "notifications.type.homework";
  if (type === "REQUEST") return "notifications.type.request";
  return "notifications.type.announcement";
}

function getSafePreview(t: ReturnType<typeof useTranslations>, item: InboxItem) {
  if (item.type === "ANNOUNCEMENT") {
    return item.bodyPreview || item.title || t("notifications.type.announcement");
  }
  if (item.type === "HOMEWORK") {
    return t("notifications.preview.homework");
  }
  return t("notifications.preview.request");
}

export default function NotificationsInboxClient({
  tenant,
  surface,
}: NotificationsInboxClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { unreadCount } = useUnreadNotificationsCount(tenant);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<InboxStatus>("unread");
  const [typeFilter, setTypeFilter] = useState<InboxTypeFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const cardClassName =
    surface === "portal"
      ? "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      : "rounded-lg border border-slate-200 bg-white p-4";
  const textMutedClassName =
    surface === "portal" ? "text-[var(--muted)]" : "text-slate-600";
  const textStrongClassName =
    surface === "portal" ? "text-[var(--text)]" : "text-slate-900";
  const sectionClassName =
    surface === "portal" ? "space-y-6" : "space-y-4";

  const loadItems = useCallback(
    async (mode: "reset" | "append", cursorValue?: string | null) => {
      if (!tenant) return;
      setInfoMessage(null);
      setError(null);
      if (mode === "reset") {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const params = new URLSearchParams({
        status,
        type: getTypeFilterValue(typeFilter),
        limit: "20",
      });
      if (mode === "append" && cursorValue) {
        params.set("cursor", cursorValue);
      }

      const result = await fetchJson<InboxResponse>(
        buildTenantApiUrl(tenant, `/portal/notifications?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok) {
        setError(t("notifications.error.body"));
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      const loaded = result.data.items ?? [];
      setItems((current) =>
        mode === "reset" ? loaded : [...current, ...loaded],
      );
      setNextCursor(result.data.pageInfo?.nextCursor ?? null);
      setIsLoading(false);
      setIsLoadingMore(false);
    },
    [status, t, tenant, typeFilter],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadItems("reset");
    }, 0);
    return () => clearTimeout(handle);
  }, [loadItems]);

  const updateItemReadState = useCallback((notificationId: string, readAt: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === notificationId && !item.readAt
          ? { ...item, readAt }
          : item,
      ),
    );
  }, []);

  const markOneRead = useCallback(
    async (item: InboxItem, navigateAfterRead: boolean) => {
      setInfoMessage(null);
      const wasUnread = !item.readAt;
      const readAtValue =
        item.readAt ??
        (new Date().toISOString());

      if (wasUnread) {
        const result = await fetchJson<MarkReadResponse>(
          buildTenantApiUrl(tenant, `/portal/notifications/${item.id}/read`),
          { method: "POST" },
        );
        if (!result.ok) {
          setInfoMessage(t("notifications.toast.errorGeneric"));
          return;
        }
        updateItemReadState(item.id, result.data.readAt ?? readAtValue);
        publishUnreadCount(Math.max(0, unreadCount - 1));
      }

      if (!navigateAfterRead) {
        setInfoMessage(t("notifications.toast.markedOneSuccess"));
        return;
      }

      if (item.targetUrl) {
        router.push(item.targetUrl);
        return;
      }
      setInfoMessage(t("notifications.link.unavailable"));
    },
    [router, t, tenant, unreadCount, updateItemReadState],
  );

  const markAllAsRead = useCallback(async () => {
    setInfoMessage(null);
    setIsMarkingAll(true);

    const result = await fetchJson<MarkAllResponse>(
      buildTenantApiUrl(tenant, "/portal/notifications/mark-all-read"),
      { method: "POST" },
    );

    setIsMarkingAll(false);
    if (!result.ok) {
      setInfoMessage(t("notifications.toast.errorGeneric"));
      return;
    }

    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: now })),
    );
    publishUnreadCount(Math.max(0, unreadCount - (result.data.markedReadCount ?? 0)));
    setInfoMessage(t("notifications.toast.markAllSuccess"));
  }, [t, tenant, unreadCount]);

  const hasUnreadItems = useMemo(
    () => items.some((item) => !item.readAt),
    [items],
  );

  if (isLoading) {
    return (
      <section className={sectionClassName} data-testid={`notifications-loading-${surface}`}>
        <h1 className={`text-2xl font-semibold ${textStrongClassName}`}>
          {t("notifications.page.title")}
        </h1>
        <p className={`text-sm ${textMutedClassName}`}>{t("notifications.loading")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={sectionClassName} data-testid={`notifications-error-${surface}`}>
        <h1 className={`text-2xl font-semibold ${textStrongClassName}`}>
          {t("notifications.page.title")}
        </h1>
        <div className={cardClassName}>
          <h2 className={`text-base font-semibold ${textStrongClassName}`}>
            {t("notifications.error.title")}
          </h2>
          <p className={`mt-1 text-sm ${textMutedClassName}`}>{error}</p>
          <button
            type="button"
            onClick={() => void loadItems("reset")}
            className="mt-3 inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800"
          >
            {t("notifications.action.retry")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={sectionClassName} data-testid={`notifications-inbox-${surface}`}>
      <h1 className={`text-2xl font-semibold ${textStrongClassName}`}>
        {t("notifications.page.title")}
      </h1>

      <div className={cardClassName}>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`notifications-status-${surface}`} className="sr-only">
            {t("notifications.filter.status")}
          </label>
          <select
            id={`notifications-status-${surface}`}
            value={status}
            onChange={(event) => setStatus(event.target.value as InboxStatus)}
            className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="unread">{t("notifications.unread")}</option>
            <option value="all">{t("notifications.type.all")}</option>
          </select>

          <label htmlFor={`notifications-type-${surface}`} className="sr-only">
            {t("notifications.filter.type")}
          </label>
          <select
            id={`notifications-type-${surface}`}
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as InboxTypeFilter)
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="all">{t("notifications.type.all")}</option>
            <option value="announcement">{t("notifications.type.announcement")}</option>
            <option value="homework">{t("notifications.type.homework")}</option>
            <option value="request">{t("notifications.type.request")}</option>
          </select>

          <button
            type="button"
            onClick={() => void markAllAsRead()}
            disabled={isMarkingAll || unreadCount <= 0}
            className="ml-auto inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-60"
          >
            {isMarkingAll
              ? t("notifications.action.marking")
              : t("notifications.action.markAllRead")}
          </button>
        </div>

        {infoMessage ? (
          <p className={`mt-3 text-sm ${textMutedClassName}`}>{infoMessage}</p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className={cardClassName}>
          <h2 className={`text-base font-semibold ${textStrongClassName}`}>
            {t("notifications.empty.title")}
          </h2>
          <p className={`mt-1 text-sm ${textMutedClassName}`}>
            {t("notifications.empty.body")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3" data-testid={`notifications-list-${surface}`}>
          {items.map((item) => {
            const isUnread = !item.readAt;
            const typeLabel = t(getTypeLabelKey(item.type));
            const preview = getSafePreview(t, item);
            return (
              <li key={item.id} className={cardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void markOneRead(item, true)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {typeLabel}
                      </span>
                      {isUnread ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                          <span className="h-2 w-2 rounded-full bg-slate-900" />
                          {t("notifications.unread")}
                        </span>
                      ) : null}
                    </div>
                    <p className={`mt-2 line-clamp-1 text-sm font-semibold ${textStrongClassName}`}>
                      {typeLabel}
                    </p>
                    <p className={`mt-1 line-clamp-2 text-sm ${textMutedClassName}`}>
                      {preview}
                    </p>
                    <p className={`mt-2 text-xs ${textMutedClassName}`}>
                      {formatDateTime(item.createdAt, locale)}
                    </p>
                  </button>
                  {isUnread ? (
                    <button
                      type="button"
                      onClick={() => void markOneRead(item, false)}
                      className="inline-flex h-9 items-center rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700"
                    >
                      {t("notifications.action.markRead")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <button
          type="button"
          onClick={() => void loadItems("append", nextCursor)}
          disabled={isLoadingMore}
          className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-60"
        >
          {isLoadingMore
            ? t("notifications.loadMore.loading")
            : t("notifications.loadMore.label")}
        </button>
      ) : null}

      {status === "unread" && !hasUnreadItems && items.length > 0 ? (
        <p className={`text-sm ${textMutedClassName}`}>
          {t("notifications.empty.title")}
        </p>
      ) : null}
    </section>
  );
}
