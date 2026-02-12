"use client";

// Tutor My Sessions page uses server-side filtered pagination from /api/tutor/sessions.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { fetchJson } from "@/lib/api/fetchJson";
import { formatPortalDateTimeRange, getSessionTypeLabelKey } from "@/lib/portal/format";

type TutorSessionListItem = {
  sessionId: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  label: string;
  locationLabel: string | null;
  sessionType: string;
  zoomLink: string | null;
};

type TutorSessionsResponse = {
  items: TutorSessionListItem[];
  nextCursor: string | null;
  requestId?: string;
};

type TutorSessionsPageClientProps = {
  tenant: string;
};

// --- DESIGNER UI CONTRACT PLACEHOLDER ---
// [PASTE DESIGNER UI CONTRACT HERE]
// --- END DESIGNER UI CONTRACT PLACEHOLDER ---

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange() {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);

  return {
    start: formatDateInput(now),
    end: formatDateInput(end),
  };
}

export default function TutorSessionsPageClient({
  tenant,
}: TutorSessionsPageClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);

  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [items, setItems] = useState<TutorSessionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError, setHasError] = useState(false);

  const hasInvalidDateRange = useMemo(() => {
    if (!startDate || !endDate) return false;
    return startDate > endDate;
  }, [startDate, endDate]);

  const loadSessions = useCallback(
    async (mode: "reset" | "append") => {
      if (hasInvalidDateRange) {
        setItems([]);
        setNextCursor(null);
        setHasError(false);
        setIsInitialLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (mode === "reset") {
        setIsInitialLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setHasError(false);

      const params = new URLSearchParams({
        from: startDate,
        to: endDate,
        limit: "20",
      });
      if (mode === "append" && nextCursor) {
        params.set("cursor", nextCursor);
      }

      const result = await fetchJson<TutorSessionsResponse>(
        `/${tenant}/api/tutor/sessions?${params.toString()}`,
      );

      if (!result.ok) {
        setHasError(true);
        setIsInitialLoading(false);
        setIsLoadingMore(false);
        return;
      }

      setItems((current) =>
        mode === "reset" ? result.data.items : [...current, ...result.data.items],
      );
      setNextCursor(result.data.nextCursor ?? null);
      setIsInitialLoading(false);
      setIsLoadingMore(false);
    },
    [endDate, hasInvalidDateRange, nextCursor, startDate, tenant],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSessions("reset");
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSessions]);

  return (
    <section className="space-y-6" data-testid="tutor-sessions-page">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("tutorSessions.page.title")}
        </h1>
        <p className="text-sm text-slate-600">{t("tutorSessions.page.subtitle")}</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("tutorSessions.filters.dateRange.label")}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-slate-600">
              {t("tutorSessions.filters.startDate.label")}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              data-testid="tutor-sessions-filter-start"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-slate-600">
              {t("tutorSessions.filters.endDate.label")}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              data-testid="tutor-sessions-filter-end"
            />
          </label>
        </div>
        {hasInvalidDateRange ? (
          <p className="mt-3 text-sm text-red-600" data-testid="tutor-sessions-invalid-range">
            {t("tutorSessions.validation.invalidDateRange")}
          </p>
        ) : null}
      </section>

      <section className="space-y-3" aria-live="polite">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("tutorSessions.list.sectionTitle")}
        </h2>

        {isInitialLoading ? (
          <div className="space-y-3" data-testid="tutor-sessions-loading">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`tutor-sessions-skeleton-${index}`}
                className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : null}

        {!isInitialLoading && hasError ? (
          <div
            className="rounded-lg border border-slate-200 bg-white p-5"
            data-testid="tutor-sessions-error"
          >
            <p className="text-base font-semibold text-slate-900">
              {t("tutorSessions.error.title")}
            </p>
            <p className="mt-1 text-sm text-slate-600">{t("tutorSessions.error.body")}</p>
            <button
              type="button"
              onClick={() => void loadSessions("reset")}
              className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
              data-testid="tutor-sessions-retry"
            >
              {t("tutorSessions.error.retry")}
            </button>
          </div>
        ) : null}

        {!isInitialLoading && !hasError && items.length === 0 ? (
          <div
            className="rounded-lg border border-slate-200 bg-white p-5"
            data-testid="tutor-sessions-empty"
          >
            <p className="text-base font-semibold text-slate-900">
              {t("tutorSessions.empty.title")}
            </p>
            <p className="mt-1 text-sm text-slate-600">{t("tutorSessions.empty.body")}</p>
          </div>
        ) : null}

        {!isInitialLoading && !hasError && items.length > 0 ? (
          <div className="space-y-3" data-testid="tutor-sessions-list">
            {items.map((item) => {
              const dateTimeLabel =
                formatPortalDateTimeRange(
                  item.startDateTime,
                  item.endDateTime,
                  locale,
                  item.timezone,
                ) || "";
              const locationLabel =
                item.locationLabel?.trim() || t("tutorSessions.list.location.online");
              const typeLabelKey = getSessionTypeLabelKey(item.sessionType);
              const displayLabel =
                item.label?.trim() ||
                (typeLabelKey ? t(typeLabelKey) : t("generic.dash"));

              return (
                <article
                  key={item.sessionId}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                  data-testid={`tutor-session-row-${item.sessionId}`}
                >
                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{dateTimeLabel}</p>
                      <p className="text-sm text-slate-700">{displayLabel}</p>
                      <p className="text-xs text-slate-500">{locationLabel}</p>
                      {item.zoomLink?.trim() ? (
                        <a
                          className="text-xs font-semibold text-slate-700 underline"
                          href={item.zoomLink}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("session.zoomLink.open")}
                        </a>
                      ) : null}
                    </div>
                    <div>
                      <Link
                        href={`/${tenant}/tutor/sessions/${item.sessionId}`}
                        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white md:w-auto"
                        data-testid={`tutor-run-session-link-${item.sessionId}`}
                      >
                        {t("tutorSessions.list.runSession")}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}

            {nextCursor ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => void loadSessions("append")}
                  disabled={isLoadingMore}
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-60"
                  data-testid="tutor-sessions-load-more"
                >
                  {isLoadingMore
                    ? t("tutorSessions.list.loadingMore")
                    : t("tutorSessions.list.loadMore")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
