// Parent announcement detail view fetches one announcement and marks it as read idempotently on open.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

type AnnouncementDetail = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  unread: boolean;
};

type AnnouncementDetailResponse = {
  item: AnnouncementDetail;
};

type ParentAnnouncementDetailClientProps = {
  tenant: string;
  announcementId: string;
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

export default function ParentAnnouncementDetailClient({
  tenant,
  announcementId,
}: ParentAnnouncementDetailClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [item, setItem] = useState<AnnouncementDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const markRead = useCallback(async () => {
    if (!tenant || !announcementId) return;
    await fetchJson<{ ok: boolean }>(
      buildTenantApiUrl(tenant, `/portal/announcements/${announcementId}/read`),
      { method: "POST" },
    );
  }, [announcementId, tenant]);

  const loadDetail = useCallback(async () => {
    if (!tenant || !announcementId) return;
    setIsLoading(true);
    setHasError(false);

    const result = await fetchJson<AnnouncementDetailResponse>(
      buildTenantApiUrl(tenant, `/portal/announcements/${announcementId}`),
      { cache: "no-store" },
    );

    if (!result.ok) {
      setHasError(true);
      setItem(null);
      setIsLoading(false);
      return;
    }

    setItem(result.data.item ?? null);
    setIsLoading(false);
  }, [announcementId, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadDetail]);

  useEffect(() => {
    if (!item) return;
    // Read receipt writes are idempotent and safe to trigger on every detail open.
    void markRead();
  }, [item, markRead]);

  const publishedLabel = useMemo(
    () =>
      t("portalAnnouncements.detail.publishedAt", {
        date: formatDateTime(item?.publishedAt ?? null, locale) ?? t("generic.dash"),
      }),
    [item?.publishedAt, locale, t],
  );

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="parent-announcement-detail-loading">
        <PortalSkeletonBlock className="h-8 w-40" />
        <PortalSkeletonBlock className="h-8 w-3/4" />
        <PortalSkeletonBlock className="h-48 w-full" />
      </div>
    );
  }

  if (hasError || !item) {
    return (
      <div className="space-y-4" data-testid="parent-announcement-detail-error">
        <Link
          href={`/${tenant}/portal/announcements`}
          className="inline-flex text-sm font-semibold text-[var(--primary)]"
        >
          {t("portalAnnouncements.backToFeed")}
        </Link>
        <Card>
          <div className="space-y-2 text-center">
            <h1 className="text-base font-semibold text-[var(--text)]">
              {t("portalAnnouncements.error.title")}
            </h1>
            <p className="text-sm text-[var(--muted)]">
              {t("portalAnnouncements.error.body")}
            </p>
            <button
              type="button"
              onClick={() => void loadDetail()}
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
    <div className="space-y-4" data-testid="parent-announcement-detail">
      <Link
        href={`/${tenant}/portal/announcements`}
        className="inline-flex text-sm font-semibold text-[var(--primary)]"
      >
        {t("portalAnnouncements.backToFeed")}
      </Link>

      <Card>
        <article className="space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold text-[var(--text)]">{item.title}</h1>
            <p className="text-xs text-[var(--muted)]">{publishedLabel}</p>
          </header>
          <p className="whitespace-pre-line break-words text-sm text-[var(--text)]">
            {item.body}
          </p>
        </article>
      </Card>
    </div>
  );
}
