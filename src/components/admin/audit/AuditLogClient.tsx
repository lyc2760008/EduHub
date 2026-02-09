// Admin audit log client now uses the shared table toolkit + query contract for consistency.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import AdminDataTable, {
  type AdminDataTableColumn,
} from "@/components/admin/shared/AdminDataTable";
import AdminFiltersSheet from "@/components/admin/shared/AdminFiltersSheet";
import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminPagination from "@/components/admin/shared/AdminPagination";
import AdminTableToolbar, {
  type AdminFilterChip,
} from "@/components/admin/shared/AdminTableToolbar";
import {
  AdminErrorPanel,
  type AdminEmptyState,
} from "@/components/admin/shared/AdminTableStatePanels";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";
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
  rows: AuditEventRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type RangePreset = "today" | "7d" | "30d" | "all";
type CategoryFilter = "all" | "auth" | "requests" | "attendance" | "admin";
type ActorFilter = "all" | "parent" | "admin" | "tutor";

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

function toDateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildRangeFilters(preset: RangePreset) {
  if (preset === "all") return {};
  const now = new Date();
  const to = toDateOnly(now);
  if (preset === "today") {
    return { from: to, to };
  }
  const offsetDays = preset === "7d" ? 7 : 30;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - offsetDays);
  return { from: toDateOnly(fromDate), to };
}

function resolveRangePreset(filters: Record<string, unknown>) {
  const from = typeof filters.from === "string" ? filters.from : "";
  const to = typeof filters.to === "string" ? filters.to : "";
  if (!from && !to) return "all";
  const todayRange = buildRangeFilters("today");
  if (from === todayRange.from && to === todayRange.to) return "today";
  const weekRange = buildRangeFilters("7d");
  if (from === weekRange.from && to === weekRange.to) return "7d";
  const monthRange = buildRangeFilters("30d");
  if (from === monthRange.from && to === monthRange.to) return "30d";
  return "custom";
}

function mapActorFilterToApi(filter: ActorFilter) {
  if (filter === "parent") return "PARENT";
  if (filter === "admin") return "ADMIN";
  if (filter === "tutor") return "TUTOR";
  return null;
}

function mapActorFilterFromApi(value: string | null) {
  if (value === "PARENT") return "parent";
  if (value === "ADMIN") return "admin";
  if (value === "TUTOR") return "tutor";
  if (value === "USER") return "admin";
  return "all";
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
  if (action.startsWith("PARENT_LOGIN") || action.includes("ACCESS_CODE")) {
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
  const [totalCount, setTotalCount] = useState(0);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [selected, setSelected] = useState<AuditEventRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { state, setSearch, setFilter, setFilters, setSort, setPage, setPageSize, resetAll } =
    useAdminTableQueryState({
      defaultSortField: "occurredAt",
      defaultSortDir: "desc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["from", "to", "category", "actorType"],
    });

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const resolvedRangePreset = useMemo(() => resolveRangePreset(state.filters), [state.filters]);
  const rangePreset = resolvedRangePreset === "custom" ? "all" : resolvedRangePreset;

  useEffect(() => {
    if (resolvedRangePreset !== "custom") return;
    // Remove unsupported range filters so the preset UI stays in sync with the URL state.
    const nextFilters = { ...state.filters };
    delete nextFilters.from;
    delete nextFilters.to;
    setFilters(nextFilters);
  }, [resolvedRangePreset, setFilters, state.filters]);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    // Step 21.3 Admin Table query contract keeps audit list params consistent.
    const params = buildAdminTableParams(state);

    try {
      const result = await fetchJson<AuditResponse>(
        buildTenantApiUrl(tenant, `/admin/audit?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.audit.error.body"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load audit events", result.details);
        setListError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setListError(t("admin.audit.error.body"));
        return false;
      }

      setEvents(result.data.rows ?? []);
      setTotalCount(result.data.totalCount ?? 0);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadEvents();
      setSelected(null);
      setIsDrawerOpen(false);
    }, 0);
    return () => clearTimeout(handle);
  }, [loadEvents, reloadNonce]);

  const handleRowClick = useCallback((record: AuditEventRecord) => {
    setSelected(record);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelected(null);
  }, []);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];

    const actorFilter =
      typeof state.filters.actorType === "string"
        ? mapActorFilterFromApi(state.filters.actorType)
        : "all";
    if (actorFilter !== "all") {
      chips.push({
        key: "actorType",
        label: t("admin.audit.filter.actorType.label"),
        value:
          ACTOR_OPTIONS.find((option) => option.value === actorFilter)?.labelKey
            ? t(
                ACTOR_OPTIONS.find((option) => option.value === actorFilter)!
                  .labelKey,
              )
            : t("admin.audit.filter.actorType.all"),
        onRemove: () => setFilter("actorType", null),
      });
    }

    const categoryFilter =
      typeof state.filters.category === "string" ? state.filters.category : "all";
    if (categoryFilter && categoryFilter !== "all") {
      const categoryOption = CATEGORY_OPTIONS.find(
        (option) => option.value === categoryFilter,
      );
      chips.push({
        key: "category",
        label: t("admin.audit.filter.category.label"),
        value: categoryOption ? t(categoryOption.labelKey) : String(categoryFilter),
        onRemove: () => setFilter("category", null),
      });
    }

    if (rangePreset !== "all") {
      const rangeOption = RANGE_OPTIONS.find(
        (option) => option.value === rangePreset,
      );
      chips.push({
        key: "range",
        label: t("admin.audit.filter.range.label"),
        value: rangeOption ? t(rangeOption.labelKey) : t("admin.audit.filter.range.all"),
        onRemove: () => {
          const nextFilters = { ...state.filters };
          delete nextFilters.from;
          delete nextFilters.to;
          setFilters(nextFilters);
        },
      });
    }

    if (state.search.trim()) {
      chips.unshift({
        key: "search",
        label: t("admin.table.search.label"),
        value: state.search.trim(),
        onRemove: () => setSearch(""),
      });
    }

    return chips;
  }, [rangePreset, setFilter, setFilters, setSearch, state.filters, state.search, t]);

  const clearAll = () => {
    setSearchInput("");
    resetAll({ sortField: "occurredAt", sortDir: "desc" });
  };

  const columns: AdminDataTableColumn<AuditEventRecord>[] = useMemo(
    () => [
      {
        key: "time",
        label: t("admin.audit.col.time"),
        sortable: true,
        sortField: "occurredAt",
        renderCell: (record) => (
          <span data-testid="audit-row-time" data-time={record.occurredAt}>
            {formatDateTime(record.occurredAt, locale) || t("generic.dash")}
          </span>
        ),
      },
      {
        key: "actor",
        label: t("admin.audit.col.actor"),
        sortable: true,
        sortField: "actorType",
        renderCell: (record) => (
          <div
            className="flex flex-col"
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
      },
      {
        key: "action",
        label: t("admin.audit.col.action"),
        sortable: true,
        sortField: "action",
        renderCell: (record) => (
          <span data-testid="audit-row-action" data-action={record.action}>
            {t(getActionLabelKey(record))}
          </span>
        ),
      },
      {
        key: "entity",
        label: t("admin.audit.col.entity"),
        sortable: true,
        sortField: "entityType",
        renderCell: (record) => (
          <span
            data-testid="audit-row-entity"
            data-entity-type={record.entityType ?? ""}
          >
            {formatEntitySummary(record, t)}
          </span>
        ),
      },
    ],
    [locale, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.audit.empty.title"),
      body: t("admin.audit.empty.body"),
    }),
    [t],
  );

  const actorFilterValue = mapActorFilterFromApi(
    typeof state.filters.actorType === "string" ? state.filters.actorType : null,
  );
  const categoryFilterValue =
    typeof state.filters.category === "string" ? state.filters.category : "all";

  return (
    <div className="flex flex-col gap-6" data-testid="audit-log">
      <AdminTableToolbar
        searchId="audit-log-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
      />

      {listError ? (
        <AdminErrorPanel onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!listError ? (
        <>
          <AdminDataTable<AuditEventRecord>
            columns={columns}
            rows={events}
            rowKey={(record) => `audit-row-${record.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={handleRowClick}
            testId="audit-table"
          />
          <AdminPagination
            page={state.page}
            pageSize={state.pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : null}

      <AdminFiltersSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        onReset={clearAll}
      >
        <AdminFormField label={t("admin.audit.filter.range.label")} htmlFor="audit-filter-range">
          <select
            id="audit-filter-range"
            className="rounded border border-slate-300 px-3 py-2"
            value={rangePreset}
            onChange={(event) => {
              const preset = event.target.value as RangePreset;
              const nextFilters = { ...state.filters };
              const range = buildRangeFilters(preset);
              if (range.from) {
                nextFilters.from = range.from;
              } else {
                delete nextFilters.from;
              }
              if (range.to) {
                nextFilters.to = range.to;
              } else {
                delete nextFilters.to;
              }
              setFilters(nextFilters);
            }}
            data-testid="audit-range-filter"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("admin.audit.filter.category.label")}
          htmlFor="audit-filter-category"
        >
          <select
            id="audit-filter-category"
            className="rounded border border-slate-300 px-3 py-2"
            value={categoryFilterValue}
            onChange={(event) => {
              const value = event.target.value as CategoryFilter;
              if (!value || value === "all") {
                setFilter("category", null);
              } else {
                setFilter("category", value);
              }
            }}
            data-testid="audit-category-filter"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("admin.audit.filter.actorType.label")}
          htmlFor="audit-filter-actor"
        >
          <select
            id="audit-filter-actor"
            className="rounded border border-slate-300 px-3 py-2"
            value={actorFilterValue}
            onChange={(event) => {
              const value = event.target.value as ActorFilter;
              const mapped = mapActorFilterToApi(value);
              if (!mapped) {
                setFilter("actorType", null);
              } else {
                setFilter("actorType", mapped);
              }
            }}
            data-testid="audit-actor-filter"
          >
            {ACTOR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </AdminFormField>
      </AdminFiltersSheet>

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
                    {t(getActionLabelKey(selected))} {t("generic.dash")} {" "}
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
                    className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
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
