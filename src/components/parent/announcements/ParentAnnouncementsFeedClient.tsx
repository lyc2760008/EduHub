// Parent announcements feed loads published tenant announcements and highlights unread items.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
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

type ParentAnnouncementsFeedClientProps = {
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

export default function ParentAnnouncementsFeedClient({
  tenant,
}: ParentAnnouncementsFeedClientProps) {
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
      <div className="space-y-6" data-testid="parent-announcements-loading">
        <PageHeader titleKey="portalAnnouncements.feed.title" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <PortalSkeletonBlock key={`announcement-skeleton-${index}`} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6" data-testid="parent-announcements-error">
        <PageHeader titleKey="portalAnnouncements.feed.title" />
        <Card>
          <div className="space-y-3 text-center">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {t("portalAnnouncements.error.title")}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {t("portalAnnouncements.error.body")}
            </p>
            <button
              type="button"
              onClick={() => void loadFeed("reset")}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
            >
              {t("portal.common.tryAgain")}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="parent-announcements-feed">
      <PageHeader titleKey="portalAnnouncements.feed.title" />

      {items.length === 0 ? (
        <Card>
          <div className="space-y-2 text-center">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {t("portalAnnouncements.empty.title")}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {t("portalAnnouncements.empty.body")}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="parent-announcements-list">
          {items.map((item) => {
            const publishedLabel = t("portalAnnouncements.detail.publishedAt", {
              date: formatDateTime(item.publishedAt, locale) ?? t("generic.dash"),
            });
            return (
              <Link
                key={item.id}
                href={`/${tenant}/portal/announcements/${item.id}`}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-2)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="line-clamp-2 text-sm font-semibold text-[var(--text)]">
                      {item.title}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{publishedLabel}</p>
                  </div>
                  {item.unread ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-xs font-semibold text-[var(--text)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
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
            className="inline-flex h-11 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
          >
            {isLoadingMore
              ? t("portalAnnouncements.loadingMore")
              : t("portalAnnouncements.loadMore")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
