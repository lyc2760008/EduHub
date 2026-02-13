// Tutor announcements feed reuses portal announcements APIs while keeping tutor-specific layout styling.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

type AnnouncementListItem = {
  id: string;
  title: string;
  publishedAt: string | null;
  unread: boolean;
};

type AnnouncementsFeedResponse = {
  items: AnnouncementListItem[];
  nextCursor: string | null;
};

type TutorAnnouncementsFeedClientProps = {
  tenant: string;
};

function formatDateTime(value: string | null, locale: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function TutorAnnouncementsFeedClient({
  tenant,
}: TutorAnnouncementsFeedClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [items, setItems] = useState<AnnouncementListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadFeed = useCallback(
    async (mode: "reset" | "append", cursorOverride?: string | null) => {
      if (!tenant) return;
      if (mode === "reset") {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setHasError(false);

      const params = new URLSearchParams({ limit: "20" });
      if (mode === "append" && cursorOverride) {
        params.set("cursor", cursorOverride);
      }

      const result = await fetchJson<AnnouncementsFeedResponse>(
        buildTenantApiUrl(tenant, `/portal/announcements?${params.toString()}`),
      );

      if (!result.ok) {
        setHasError(true);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      setItems((current) =>
        mode === "reset"
          ? (result.data.items ?? [])
          : [...current, ...(result.data.items ?? [])],
      );
      setNextCursor(result.data.nextCursor ?? null);
      setIsLoading(false);
      setIsLoadingMore(false);
    },
    [tenant],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadFeed("reset");
    }, 0);
    return () => clearTimeout(handle);
  }, [loadFeed]);

  if (isLoading) {
    return (
      <section className="space-y-4" data-testid="tutor-announcements-loading">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            {t("portalAnnouncements.feed.title")}
          </h1>
        </header>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`tutor-announcement-skeleton-${index}`}
              className="h-20 animate-pulse rounded-lg border border-slate-200 bg-white"
            />
          ))}
        </div>
      </section>
    );
  }

  if (hasError) {
    return (
      <section className="space-y-4" data-testid="tutor-announcements-error">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            {t("portalAnnouncements.feed.title")}
          </h1>
        </header>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-base font-semibold text-slate-900">
            {t("portalAnnouncements.error.title")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {t("portalAnnouncements.error.body")}
          </p>
          <button
            type="button"
            onClick={() => void loadFeed("reset")}
            className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            {t("portal.common.tryAgain")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="tutor-announcements-feed">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("portalAnnouncements.feed.title")}
        </h1>
      </header>

      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-base font-semibold text-slate-900">
            {t("portalAnnouncements.empty.title")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {t("portalAnnouncements.empty.body")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const publishedLabel = t("portalAnnouncements.detail.publishedAt", {
              date: formatDateTime(item.publishedAt, locale) ?? t("generic.dash"),
            });
            return (
              <Link
                key={item.id}
                href={`/${tenant}/tutor/announcements/${item.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-600">{publishedLabel}</p>
                  </div>
                  {item.unread ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      <span className="h-2 w-2 rounded-full bg-slate-900" />
                      {t("portalAnnouncements.unread")}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {nextCursor ? (
        <div>
          <button
            type="button"
            onClick={() => void loadFeed("append", nextCursor)}
            disabled={isLoadingMore}
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-60"
          >
            {isLoadingMore
              ? t("portalAnnouncements.loadingMore")
              : t("portalAnnouncements.loadMore")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
