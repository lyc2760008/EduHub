"use client";

// Admin audit log client provides filtering, list rendering, and detail drawer UI.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import {
  inputBase,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { AUDIT_ACTIONS } from "@/lib/audit/constants";

type AuditActorType = "PARENT" | "USER" | "SYSTEM";

type AuditEventRecord = {
  id: string;
  occurredAt: string;
  actorType: AuditActorType;
  actorDisplay: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
};

type AuditResponse = {
  items: AuditEventRecord[];
  page: {
    take: number;
    skip: number;
    total: number;
  };
};

type RangePreset = "today" | "7d" | "30d" | "all";
type CategoryFilter = "all" | "auth" | "requests" | "attendance" | "admin";
type ActorFilter = "all" | "parent" | "admin" | "tutor";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TAKE = 50;

const RANGE_OPTIONS: Array<{ value: RangePreset; labelKey: string }> = [
  { value: "today", labelKey: "admin.audit.filter.range.today" },
  { value: "7d", labelKey: "admin.audit.filter.range.7d" },
  { value: "30d", labelKey: "admin.audit.filter.range.30d" },
  { value: "all", labelKey: "admin.audit.filter.range.all" },
];

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; labelKey: string }> = [
  { value: "all", labelKey: "admin.audit.filter.category.all" },
  { value: "auth", labelKey: "admin.audit.filter.category.auth" },
  { value: "requests", labelKey: "admin.audit.filter.category.requests" },
  { value: "attendance", labelKey: "admin.audit.filter.category.attendance" },
  { value: "admin", labelKey: "admin.audit.filter.category.admin" },
];

const ACTOR_OPTIONS: Array<{ value: ActorFilter; labelKey: string }> = [
  { value: "all", labelKey: "admin.audit.filter.actorType.all" },
  { value: "parent", labelKey: "admin.audit.filter.actorType.parent" },
  { value: "admin", labelKey: "admin.audit.filter.actorType.admin" },
  { value: "tutor", labelKey: "admin.audit.filter.actorType.tutor" },
];

const ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.PARENT_LOGIN_SUCCEEDED]:
    "admin.audit.event.parentLoginSucceeded",
  [AUDIT_ACTIONS.PARENT_LOGIN_FAILED]: "admin.audit.event.parentLoginFailed",
  [AUDIT_ACTIONS.PARENT_LOGIN_THROTTLED]:
    "admin.audit.event.parentLoginThrottled",
  PARENT_LOGIN_LOCKED: "admin.audit.event.parentLoginLocked",
  [AUDIT_ACTIONS.PARENT_ACCESS_CODE_RESET]:
    "admin.audit.event.parentAccessCodeResetByAdmin",
  [AUDIT_ACTIONS.ABSENCE_REQUEST_CREATED]:
    "admin.audit.event.absenceRequestCreated",
  [AUDIT_ACTIONS.ABSENCE_REQUEST_WITHDRAWN]:
    "admin.audit.event.absenceRequestWithdrawn",
  [AUDIT_ACTIONS.ABSENCE_REQUEST_RESUBMITTED]:
    "admin.audit.event.absenceRequestResubmitted",
  ABSENCE_REQUEST_APPROVED: "admin.audit.event.absenceRequestApproved",
  ABSENCE_REQUEST_DECLINED: "admin.audit.event.absenceRequestDeclined",
  ATTENDANCE_MARKED: "admin.audit.event.attendanceMarked",
  ATTENDANCE_UPDATED: "admin.audit.event.attendanceUpdated",
  [AUDIT_ACTIONS.ATTENDANCE_PARENT_VISIBLE_NOTE_UPDATED]:
    "admin.audit.event.parentVisibleNoteUpdated",
  STUDENT_LINKED_TO_PARENT: "admin.audit.event.studentLinkedToParent",
  STUDENT_UNLINKED_FROM_PARENT: "admin.audit.event.studentUnlinkedFromParent",
};

// Guard against exposing sensitive metadata fields (access codes, secrets, hashes).
const SENSITIVE_METADATA_KEY = /(access|code|token|secret|password|hash)/i;

function buildDateRange(preset: RangePreset) {
  if (preset === "all") return { from: null, to: null };

  const now = new Date();
  if (preset === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: start, to: now };
  }

  const offsetDays = preset === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - offsetDays * DAY_MS);
  return { from, to: now };
}

function mapActorFilterToApi(filter: ActorFilter) {
  // Backend audit events only differentiate PARENT vs USER; admin/tutor both map to USER.
  if (filter === "parent") return "PARENT";
  if (filter === "admin" || filter === "tutor") return "USER";
  return null;
}

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function truncateId(value: string | null) {
  if (!value) return null;
  if (value.length <= 8) return value;
  return `${value.slice(0, 8)}...`;
}

function normalizeMetadata(metadata: AuditEventRecord["metadata"]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata;
}

function getCategoryLabelKey(action: string) {
  if (
    action.startsWith("PARENT_LOGIN") ||
    action.includes("ACCESS_CODE")
  ) {
    return "admin.audit.filter.category.auth";
  }
  if (action.startsWith("ABSENCE_REQUEST")) {
    return "admin.audit.filter.category.requests";
  }
  if (action.startsWith("ATTENDANCE")) {
    return "admin.audit.filter.category.attendance";
  }
  return "admin.audit.filter.category.admin";
}

function getActionLabelKey(record: AuditEventRecord) {
  if (record.action === AUDIT_ACTIONS.ABSENCE_REQUEST_RESOLVED) {
    const metadata = normalizeMetadata(record.metadata);
    const status = metadata?.resolvedStatus;
    if (status === "APPROVED") {
      return "admin.audit.event.absenceRequestApproved";
    }
    if (status === "DECLINED") {
      return "admin.audit.event.absenceRequestDeclined";
    }
  }
  return ACTION_LABELS[record.action] ?? "generic.dash";
}

function getActorRoleLabelKey(record: AuditEventRecord) {
  if (record.actorType === "PARENT") {
    return "admin.audit.filter.actorType.parent";
  }
  if (record.actorType === "USER") {
    // Heuristic mapping: attendance events are tutor-heavy; other staff actions default to admin.
    return record.action.startsWith("ATTENDANCE")
      ? "admin.audit.filter.actorType.tutor"
      : "admin.audit.filter.actorType.admin";
  }
  return "admin.audit.filter.actorType.admin";
}

function formatActorLabel(record: AuditEventRecord, t: (key: string) => string) {
  const roleLabel = t(getActorRoleLabelKey(record));
  const actorLabel = record.actorDisplay?.trim() || t("generic.dash");
  const dash = t("generic.dash");
  return `${roleLabel} ${dash} ${actorLabel}`;
}

function formatEntitySummary(record: AuditEventRecord, t: (key: string) => string) {
  if (!record.entityType && !record.entityId) {
    return t("generic.dash");
  }
  // Use the entity type + truncated ID when richer context isn't available.
  const entityLabel = record.entityType ?? t("generic.dash");
  const truncatedId = truncateId(record.entityId);
  if (!truncatedId) return entityLabel;
  const dash = t("generic.dash");
  return `${entityLabel} ${dash} ${truncatedId}`;
}

function getMetadataEntries(metadata: Record<string, unknown>) {
  return Object.entries(metadata)
    .filter(([key, value]) => {
      if (SENSITIVE_METADATA_KEY.test(key)) return false;
      if (value === null || value === undefined) return false;
      if (typeof value === "string" && !value.trim()) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>).length > 0;
      }
      return true;
    })
    .map(([key, value]) => {
      if (typeof value === "object") {
        return { key, value: JSON.stringify(value, null, 2) };
      }
      return { key, value: String(value) };
    });
}

type AuditLogClientProps = {
  tenant: string;
};

export default function AuditLogClient({ tenant }: AuditLogClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [events, setEvents] = useState<AuditEventRecord[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");
  const [page, setPage] = useState({ take: DEFAULT_TAKE, skip: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEventRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const dateRange = useMemo(() => buildDateRange(rangePreset), [rangePreset]);

  const loadEvents = useCallback(
    async (options: { append?: boolean; offset?: number } = {}) => {
      const append = options.append ?? false;
      setError(null);

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const params = new URLSearchParams();
      const nextSkip = append ? (options.offset ?? 0) : 0;
      params.set("take", String(page.take));
      params.set("skip", String(nextSkip));

      if (dateRange.from) {
        params.set("from", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        params.set("to", dateRange.to.toISOString());
      }
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      const actorType = mapActorFilterToApi(actorFilter);
      if (actorType) {
        params.set("actorType", actorType);
      }

      const result = await fetchJson<AuditResponse>(
        buildTenantApiUrl(tenant, `/admin/audit?${params.toString()}`),
      );

      if (!result.ok) {
        setError(t("admin.audit.error.body"));
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      const items = result.data.items ?? [];
      setEvents((prev) => (append ? [...prev, ...items] : items));
      setPage(result.data.page ?? { take: DEFAULT_TAKE, skip: 0, total: 0 });
      setIsLoading(false);
      setIsLoadingMore(false);
    },
    [actorFilter, categoryFilter, dateRange, page.take, t, tenant],
  );

  useEffect(() => {
    // Defer load to avoid setState directly inside the effect body.
    const handle = setTimeout(() => {
      void loadEvents({ append: false });
      setSelected(null);
      setIsDrawerOpen(false);
    }, 0);
    return () => clearTimeout(handle);
  }, [loadEvents]);

  const handleRowClick = useCallback((record: AuditEventRecord) => {
    setSelected(record);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelected(null);
  }, []);

  const canLoadMore = events.length < page.total;

  const columns: AdminTableColumn<AuditEventRecord>[] = [
    {
      header: t("admin.audit.col.time"),
      cell: (record) => (
        // data-testid + data-time keep audit time assertions stable in E2E.
        <span data-testid="audit-row-time" data-time={record.occurredAt}>
          {formatDateTime(record.occurredAt, locale) || t("generic.dash")}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.audit.col.actor"),
      cell: (record) => (
        <div
          className="flex flex-col"
          // data-actor-display aids tenant isolation assertions without coupling to i18n.
          data-testid="audit-row-actor"
          data-actor-type={record.actorType}
          data-actor-display={record.actorDisplay ?? ""}
        >
          <span className="text-sm text-slate-900">
            {formatActorLabel(record, t)}
          </span>
          <span className="text-xs text-slate-500">
            {t(getCategoryLabelKey(record.action))}
          </span>
        </div>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.audit.col.action"),
      cell: (record) => (
        // data-action lets tests find specific audit events without relying on labels.
        <span data-testid="audit-row-action" data-action={record.action}>
          {t(getActionLabelKey(record))}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.audit.col.entity"),
      cell: (record) => (
        // data-entity-type keeps entity assertions stable for audit rows.
        <span
          data-testid="audit-row-entity"
          data-entity-type={record.entityType ?? ""}
        >
          {formatEntitySummary(record, t)}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
  ];

  const emptyState = (
    <div
      className="flex flex-col items-center gap-1"
      // data-testid keeps empty-state checks stable across breakpoints.
      data-testid="audit-empty-state"
    >
      <p className="text-sm font-semibold text-slate-900">
        {t("admin.audit.empty.title")}
      </p>
      <p className="text-xs text-slate-500">{t("admin.audit.empty.body")}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="audit-log">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t("admin.audit.filter.range.label")}
            <select
              className={inputBase}
              value={rangePreset}
              onChange={(event) => setRangePreset(event.target.value as RangePreset)}
              data-testid="audit-range-filter"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t("admin.audit.filter.category.label")}
            <select
              className={inputBase}
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as CategoryFilter)
              }
              data-testid="audit-category-filter"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t("admin.audit.filter.actorType.label")}
            <select
              className={inputBase}
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value as ActorFilter)}
              data-testid="audit-actor-filter"
            >
              {ACTOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canLoadMore ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => void loadEvents({ append: true, offset: events.length })}
            disabled={isLoadingMore}
            data-testid="audit-load-more"
          >
            {isLoadingMore ? t("common.loading") : t("admin.audit.action.loadMore")}
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded border border-red-200 bg-red-50 px-3 py-2"
          // data-testid keeps error state assertions stable in E2E.
          data-testid="audit-error-state"
        >
          <p className="text-sm font-semibold text-red-700">
            {t("admin.audit.error.title")}
          </p>
          <p className="text-xs text-red-700">{error}</p>
          <button
            type="button"
            className={`${secondaryButton} mt-3`}
            onClick={() => void loadEvents({ append: false })}
          >
            {t("admin.audit.error.tryAgain")}
          </button>
        </div>
      ) : (
        <>
          {/* Only render table/empty states when there is no error. */}
          <div className="hidden md:block">
            <AdminTable
              rows={events}
              columns={columns}
              rowKey={(record) => `audit-row-${record.id}`}
              testId="audit-table"
              isLoading={isLoading}
              loadingState={t("common.loading")}
              emptyState={emptyState}
              onRowClick={handleRowClick}
            />
          </div>

          <div className="grid gap-3 md:hidden">
            {isLoading && events.length === 0 ? (
              <>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`audit-skeleton-${index}`}
                    className="rounded border border-slate-200 bg-white p-4"
                  >
                    <div className="h-4 w-32 rounded bg-slate-100" />
                    <div className="mt-3 h-3 w-24 rounded bg-slate-100" />
                    <div className="mt-3 h-3 w-40 rounded bg-slate-100" />
                  </div>
                ))}
              </>
            ) : null}
            {!isLoading && events.length === 0 ? (
              <div className="rounded border border-slate-200 bg-white p-4 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  {t("admin.audit.empty.title")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("admin.audit.empty.body")}
                </p>
              </div>
            ) : null}
            {events.map((record) => (
              <button
                key={record.id}
                type="button"
                className="rounded border border-slate-200 bg-white p-4 text-left shadow-sm"
                onClick={() => handleRowClick(record)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {t(getActionLabelKey(record))}
                  </span>
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    {t(getCategoryLabelKey(record.action))}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {formatDateTime(record.occurredAt, locale) || t("generic.dash")}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {formatActorLabel(record, t)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {formatEntitySummary(record, t)}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      {isDrawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
          role="dialog"
          aria-modal="true"
          data-testid="audit-detail-drawer"
        >
          <div className="h-full w-full max-w-full overflow-y-auto bg-white p-6 shadow-xl md:w-[480px]">
            {selected ? (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {t("admin.audit.detail.title")}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {t(getActionLabelKey(selected))} {t("generic.dash")}{" "}
                    {formatDateTime(selected.occurredAt, locale)}
                  </p>
                </div>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("admin.audit.detail.section.summary")}
                  </h3>
                  <div className="grid gap-3 text-sm text-slate-700">
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-500">
                        {t("admin.audit.col.time")}
                      </span>
                      <span>
                        {formatDateTime(selected.occurredAt, locale) ||
                          t("generic.dash")}
                      </span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-500">
                        {t("admin.audit.detail.field.category")}
                      </span>
                      <span>{t(getCategoryLabelKey(selected.action))}</span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-500">
                        {t("admin.audit.col.actor")}
                      </span>
                      <span>{formatActorLabel(selected, t)}</span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-500">
                        {t("admin.audit.col.action")}
                      </span>
                      <span>{t(getActionLabelKey(selected))}</span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-500">
                        {t("admin.audit.col.entity")}
                      </span>
                      <span>{formatEntitySummary(selected, t)}</span>
                    </div>
                  </div>
                </section>

                {(() => {
                  const metadata = normalizeMetadata(selected.metadata);
                  const entries = metadata ? getMetadataEntries(metadata) : [];
                  const showIp = Boolean(selected.ip);
                  const showUserAgent = Boolean(selected.userAgent);

                  if (!entries.length && !showIp && !showUserAgent) return null;

                  return (
                    <details className="rounded border border-slate-200 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                        {t("admin.audit.detail.section.metadata")}
                      </summary>
                      <div className="mt-3 grid gap-3 text-sm text-slate-700">
                        {entries.map((entry) => (
                          <div key={entry.key} className="grid gap-1">
                            <span className="text-xs font-semibold text-slate-500">
                              {entry.key}
                            </span>
                            {entry.value.includes("\n") ? (
                              <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">
                                {entry.value}
                              </pre>
                            ) : (
                              <span className="break-words">{entry.value}</span>
                            )}
                          </div>
                        ))}
                        {showIp ? (
                          <div className="grid gap-1">
                            <span className="text-xs font-semibold text-slate-500">
                              {t("admin.audit.detail.field.ip")}
                            </span>
                            <span className="break-words">{selected.ip}</span>
                          </div>
                        ) : null}
                        {showUserAgent ? (
                          <div className="grid gap-1">
                            <span className="text-xs font-semibold text-slate-500">
                              {t("admin.audit.detail.field.userAgent")}
                            </span>
                            {selected.userAgent && selected.userAgent.length > 120 ? (
                              <details className="rounded border border-slate-200 px-2 py-1">
                                <summary className="cursor-pointer text-xs text-slate-700">
                                  {`${selected.userAgent.slice(0, 120)}...`}
                                </summary>
                                <p className="mt-2 break-words text-xs text-slate-700">
                                  {selected.userAgent}
                                </p>
                              </details>
                            ) : (
                              <span className="break-words">{selected.userAgent}</span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  );
                })()}

                <div className="mt-auto flex justify-end">
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={closeDrawer}
                  >
                    {t("actions.close")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {t("common.loading")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
