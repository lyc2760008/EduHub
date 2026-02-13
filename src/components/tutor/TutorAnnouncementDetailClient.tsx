// Tutor announcement detail fetches a single announcement and records an idempotent read receipt on open.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

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

type TutorAnnouncementDetailClientProps = {
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

export default function TutorAnnouncementDetailClient({
  tenant,
  announcementId,
}: TutorAnnouncementDetailClientProps) {
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
    // Read receipt writes are idempotent and can run each time this view opens.
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
      <section className="space-y-4" data-testid="tutor-announcement-detail-loading">
        <div className="h-7 w-40 animate-pulse rounded bg-slate-100" />
        <div className="h-7 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-48 w-full animate-pulse rounded bg-slate-100" />
      </section>
    );
  }

  if (hasError || !item) {
    return (
      <section className="space-y-4" data-testid="tutor-announcement-detail-error">
        <Link
          href={`/${tenant}/tutor/announcements`}
          className="inline-flex text-sm font-semibold text-slate-700 underline"
        >
          {t("portalAnnouncements.backToFeed")}
        </Link>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-base font-semibold text-slate-900">
            {t("portalAnnouncements.error.title")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {t("portalAnnouncements.error.body")}
          </p>
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            {t("portal.common.tryAgain")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="tutor-announcement-detail">
      <Link
        href={`/${tenant}/tutor/announcements`}
        className="inline-flex text-sm font-semibold text-slate-700 underline"
      >
        {t("portalAnnouncements.backToFeed")}
      </Link>

      <article className="rounded-lg border border-slate-200 bg-white p-5">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">{item.title}</h1>
          <p className="text-xs text-slate-600">{publishedLabel}</p>
        </header>
        <p className="mt-4 whitespace-pre-line break-words text-sm text-slate-800">
          {item.body}
        </p>
      </article>
    </section>
  );
}
