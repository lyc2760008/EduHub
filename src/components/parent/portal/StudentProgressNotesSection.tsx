"use client";

// Progress-notes timeline for parent student detail (Step 22.3, read-only).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import { fetchJson } from "@/lib/api/fetchJson";
import { formatPortalDateTime, getSessionTypeLabelKey } from "@/lib/portal/format";

type ProgressNoteItem = {
  id: string;
  occurredAt: string;
  sessionId: string;
  sessionType: string;
  sessionTitle?: string | null;
  timezone?: string | null;
  tutorName?: string | null;
  note: string;
};

type ProgressNotesResponse = {
  items: ProgressNoteItem[];
  nextCursor: string | null;
};

type StudentProgressNotesSectionProps = {
  tenant: string;
  studentId: string;
};

const PROGRESS_NOTES_PAGE_SIZE = 10;

function buildProgressNotesUrl(
  tenant: string,
  studentId: string,
  cursor?: string | null,
) {
  const params = new URLSearchParams({
    limit: String(PROGRESS_NOTES_PAGE_SIZE),
  });
  if (cursor) {
    params.set("cursor", cursor);
  }

  const base = tenant
    ? `/t/${tenant}/api/portal/students/${studentId}/progress-notes`
    : `/api/portal/students/${studentId}/progress-notes`;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function normalizeProgressNotes(items: ProgressNoteItem[]) {
  return items
    .map((item) => ({
      ...item,
      note: item.note?.trim() ?? "",
      tutorName: item.tutorName?.trim() || null,
      sessionTitle: item.sessionTitle?.trim() || null,
    }))
    .filter((item) => item.note.length > 0);
}

export default function StudentProgressNotesSection({
  tenant,
  studentId,
}: StudentProgressNotesSectionProps) {
  const t = useTranslations();
  const locale = useLocale();
  // Keep timeline timestamps aligned with the shared portal timezone behavior.
  const { data: portalMe } = usePortalMe();

  const [items, setItems] = useState<ProgressNoteItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadMoreLoading, setIsLoadMoreLoading] = useState(false);
  const [isInitialError, setIsInitialError] = useState(false);
  const [isLoadMoreError, setIsLoadMoreError] = useState(false);

  const appendUniqueItems = useCallback(
    (incomingItems: ProgressNoteItem[]) => {
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        const merged = [...current];

        for (const item of incomingItems) {
          if (seen.has(item.id)) {
            continue;
          }
          seen.add(item.id);
          merged.push(item);
        }

        return merged;
      });
    },
    [],
  );

  const loadPage = useCallback(
    async (cursor?: string | null) => {
      const result = await fetchJson<ProgressNotesResponse>(
        buildProgressNotesUrl(tenant, studentId, cursor),
      );

      if (!result.ok) {
        return false;
      }

      const normalizedItems = normalizeProgressNotes(result.data.items ?? []);
      if (cursor) {
        appendUniqueItems(normalizedItems);
      } else {
        setItems(normalizedItems);
      }

      setNextCursor(result.data.nextCursor ?? null);
      return true;
    },
    [appendUniqueItems, studentId, tenant],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!tenant || !studentId) {
        setIsInitialLoading(false);
        setIsInitialError(true);
        return;
      }

      setIsInitialLoading(true);
      setIsInitialError(false);
      setIsLoadMoreError(false);
      setNextCursor(null);

      const ok = await loadPage(null);
      if (cancelled) {
        return;
      }

      setIsInitialLoading(false);
      if (!ok) {
        setIsInitialError(true);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadPage, studentId, tenant]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadMoreLoading) {
      return;
    }

    setIsLoadMoreLoading(true);
    setIsLoadMoreError(false);
    const ok = await loadPage(nextCursor);
    setIsLoadMoreLoading(false);

    if (!ok) {
      setIsLoadMoreError(true);
    }
  }, [isLoadMoreLoading, loadPage, nextCursor]);

  const loadMoreLabel = isLoadMoreLoading
    ? t("parentStudentProgress.loadMore.loading")
    : t("parentStudentProgress.loadMore.default");

  const skeletonRows = useMemo(() => Array.from({ length: 3 }), []);

  return (
    <section className="space-y-3" data-testid="portal-student-progress-notes">
      <Card>
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {t("parentStudentProgress.section.title")}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {t("parentStudentProgress.section.subtitle")}
            </p>
          </div>

          {isInitialLoading ? (
            <div className="space-y-3" data-testid="portal-progress-notes-loading">
              <p className="sr-only" aria-live="polite">
                {t("parentStudentProgress.loading")}
              </p>
              {skeletonRows.map((_, index) => (
                <div key={index} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                  <PortalSkeletonBlock className="h-3 w-44" />
                  <PortalSkeletonBlock className="h-4 w-full" />
                  <PortalSkeletonBlock className="h-4 w-5/6" />
                  <PortalSkeletonBlock className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : null}

          {!isInitialLoading && isInitialError ? (
            <div
              className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
              data-testid="portal-progress-notes-error"
            >
              <p className="text-sm font-semibold text-[var(--text)]">
                {t("parentStudentProgress.error.title")}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {t("parentStudentProgress.error.body")}
              </p>
            </div>
          ) : null}

          {!isInitialLoading && !isInitialError && items.length === 0 ? (
            <div
              className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-center"
              data-testid="portal-progress-notes-empty"
            >
              <p className="text-sm font-semibold text-[var(--text)]">
                {t("parentStudentProgress.empty.title")}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {t("parentStudentProgress.empty.body")}
              </p>
            </div>
          ) : null}

          {!isInitialLoading && !isInitialError && items.length > 0 ? (
            <div className="space-y-3" data-testid="portal-progress-notes-list">
              {items.map((item) => {
                const timeZone = item.timezone ?? portalMe?.tenant?.timeZone ?? undefined;
                const dateTimeLabel =
                  formatPortalDateTime(item.occurredAt, locale, timeZone) ||
                  t("generic.dash");
                const metaParts = [dateTimeLabel];

                if (item.tutorName) {
                  metaParts.push(
                    t("parentStudentProgress.meta.sharedBy", {
                      name: item.tutorName,
                    }),
                  );
                }

                const sessionTypeLabelKey = getSessionTypeLabelKey(item.sessionType);
                const sessionLabel = item.sessionTitle
                  ? item.sessionTitle
                  : sessionTypeLabelKey
                    ? t(sessionTypeLabelKey)
                    : t("generic.dash");

                return (
                  <article
                    key={item.id}
                    className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                    data-testid={`portal-progress-note-${item.id}`}
                  >
                    <p className="text-xs text-[var(--muted)]">{metaParts.join(" • ")}</p>
                    <p className="text-sm font-medium text-[var(--muted)]">
                      {t("parentStudentProgress.meta.sessionLabel")}: {sessionLabel}
                    </p>
                    <p className="whitespace-pre-line text-sm text-[var(--text)]">{item.note}</p>
                    {item.sessionId ? (
                      <div>
                        <Link
                          href={
                            tenant
                              ? `/${tenant}/portal/sessions/${item.sessionId}`
                              : `/portal/sessions/${item.sessionId}`
                          }
                          className="text-sm font-semibold text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                        >
                          {t("parentStudentProgress.link.viewSession")}
                        </Link>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}

          {!isInitialLoading && !isInitialError && isLoadMoreError ? (
            <div
              className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
              data-testid="portal-progress-notes-load-more-error"
            >
              <p className="text-sm font-semibold text-[var(--text)]">
                {t("parentStudentProgress.error.title")}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {t("parentStudentProgress.error.body")}
              </p>
            </div>
          ) : null}

          {!isInitialLoading && !isInitialError && items.length > 0 && nextCursor ? (
            <div className="pt-1" data-testid="portal-progress-notes-load-more-row">
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
                onClick={() => void handleLoadMore()}
                disabled={isLoadMoreLoading}
                data-testid="portal-progress-notes-load-more"
              >
                {loadMoreLabel}
              </button>
            </div>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

