// Admin audit log client uses URL-backed table state and redacted APIs for support-safe triage.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { inputBase, primaryButton, secondaryButton } from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";
import { AUDIT_ACTIONS } from "@/lib/audit/constants";

type AuditActorType = "PARENT" | "USER" | "SYSTEM";
type AuditResult = "SUCCESS" | "FAILURE";

type AuditEventRecord = {
  id: string;
  occurredAt: string;
  actorType: AuditActorType;
  actorId: string | null;
  actorDisplay: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityDisplay: string | null;
  result: AuditResult;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
};

type AuditListResponse = {
  items: AuditEventRecord[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type AuditDetailResponse = {
  item: AuditEventRecord;
};

type ActionTypeFilter =
  | "all"
  | "auth"
  | "sessions"
  | "people"
  | "requests"
  | "catalog"
  | "system";

type ResultFilter = "all" | AuditResult;
type ExportToastTone = "success" | "error";

type ExportToast = {
  tone: ExportToastTone;
  title: string;
  body: string;
};

const ACTION_TYPE_OPTIONS: Array<{ value: ActionTypeFilter; labelKey: string }> = [
  { value: "all", labelKey: "adminAudit.actionType.all" },
  { value: "auth", labelKey: "adminAudit.actionType.auth" },
  { value: "sessions", labelKey: "adminAudit.actionType.sessions" },
  { value: "people", labelKey: "adminAudit.actionType.people" },
  { value: "requests", labelKey: "adminAudit.actionType.requests" },
  { value: "catalog", labelKey: "adminAudit.actionType.catalog" },
  { value: "system", labelKey: "adminAudit.actionType.system" },
];

const ENTITY_TYPE_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "all", labelKey: "adminAudit.entity.all" },
  { value: "REQUEST", labelKey: "adminAudit.entity.request" },
  { value: "SESSION", labelKey: "adminAudit.entity.session" },
  { value: "ATTENDANCE", labelKey: "adminAudit.entity.attendance" },
  { value: "GROUP", labelKey: "adminAudit.entity.group" },
  { value: "STUDENT", labelKey: "adminAudit.entity.student" },
  { value: "PARENT", labelKey: "adminAudit.entity.parent" },
  { value: "REPORT", labelKey: "adminAudit.entity.report" },
  { value: "ACCESS_CODE", labelKey: "adminAudit.entity.accessCode" },
  { value: "SYSTEM", labelKey: "adminAudit.entity.system" },
];

const RESULT_OPTIONS: Array<{ value: ResultFilter; labelKey: string }> = [
  { value: "all", labelKey: "adminAudit.result.all" },
  { value: "SUCCESS", labelKey: "adminAudit.result.success" },
  { value: "FAILURE", labelKey: "adminAudit.result.failure" },
];

const ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.REQUEST_RESOLVED]: "adminAudit.actions.requestResolved",
  [AUDIT_ACTIONS.SESSIONS_GENERATED]: "adminAudit.actions.sessionsGenerated",
  [AUDIT_ACTIONS.GROUP_FUTURE_SESSIONS_SYNCED]:
    "adminAudit.actions.groupFutureSessionsSynced",
  [AUDIT_ACTIONS.ATTENDANCE_UPDATED]: "adminAudit.actions.attendanceUpdated",
  [AUDIT_ACTIONS.NOTES_UPDATED]: "adminAudit.actions.notesUpdated",
  [AUDIT_ACTIONS.PARENT_INVITE_SENT]: "adminAudit.actions.parentInviteSent",
  [AUDIT_ACTIONS.PARENT_INVITE_RESENT]: "adminAudit.actions.parentInviteResent",
  [AUDIT_ACTIONS.PARENT_INVITE_COPIED]: "adminAudit.actions.parentInviteCopied",
  [AUDIT_ACTIONS.PARENT_LOGIN_SUCCEEDED]: "adminAudit.actions.parentLoginSucceeded",
  [AUDIT_ACTIONS.PARENT_LOGIN_FAILED]: "adminAudit.actions.parentLoginFailed",
  [AUDIT_ACTIONS.PARENT_LOGIN_THROTTLED]: "adminAudit.actions.parentLoginThrottled",
  [AUDIT_ACTIONS.PARENT_ACCESS_CODE_RESET]: "adminAudit.actions.parentAccessCodeReset",
  [AUDIT_ACTIONS.ABSENCE_REQUEST_CREATED]: "adminAudit.actions.absenceRequestCreated",
  [AUDIT_ACTIONS.ABSENCE_REQUEST_WITHDRAWN]:
    "adminAudit.actions.absenceRequestWithdrawn",
  [AUDIT_ACTIONS.ABSENCE_REQUEST_RESUBMITTED]:
    "adminAudit.actions.absenceRequestResubmitted",
  [AUDIT_ACTIONS.ABSENCE_REQUEST_RESOLVED]: "adminAudit.actions.absenceRequestResolved",
};

const FAILURE_REASON_KEY_BY_CODE: Record<string, string> = {
  validation_error: "adminAudit.failure.validation",
  rate_limited: "adminAudit.failure.rateLimited",
  internal_error: "adminAudit.failure.generic",
  send_failed: "adminAudit.failure.generic",
};

const DISALLOWED_METADATA_KEY_PATTERN =
  /(token|access[_-]?code|cookie|authorization|password|secret|api[_-]?key|set-cookie)/i;

function toDateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultDateRange() {
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 7);
  return {
    from: toDateOnly(fromDate),
    to: toDateOnly(now),
  };
}

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getActionLabelKey(action: string) {
  return ACTION_LABELS[action] ?? "adminAudit.actions.unknown";
}

function getEntityLabelKey(entityType: string | null) {
  if (!entityType) return "generic.dash";
  const option = ENTITY_TYPE_OPTIONS.find((entry) => entry.value === entityType);
  return option?.labelKey ?? "adminAudit.entity.unknown";
}

function getPrimaryEntityValue(record: AuditEventRecord) {
  const display = record.entityDisplay?.trim();
  if (display) return display;
  const entityId = record.entityId?.trim();
  return entityId || null;
}

function buildSafeMetadataEntries(metadata: AuditEventRecord["metadata"]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  // Defense in depth: suppress sensitive-looking keys even if backend redaction regresses.
  return Object.entries(metadata)
    .filter(([key, value]) => {
      if (DISALLOWED_METADATA_KEY_PATTERN.test(key)) return false;
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") {
        return Object.keys(value as Record<string, unknown>).length > 0;
      }
      return true;
    })
    .slice(0, 30);
}

function formatMetadataValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

type AuditLogClientProps = {
  tenant: string;
};

export default function AuditLogClient({ tenant }: AuditLogClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const didInitializeDateRangeRef = useRef(false);

  const [events, setEvents] = useState<AuditEventRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<AuditEventRecord | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState<ExportToast | null>(null);

  const { state, setSearch, setFilter, setFilters, setSort, setPage, setPageSize, resetAll } =
    useAdminTableQueryState({
      defaultSortField: "occurredAt",
      defaultSortDir: "desc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["from", "to", "actor", "actionType", "entityType", "result"],
    });

  useEffect(() => {
    if (didInitializeDateRangeRef.current) return;
    didInitializeDateRangeRef.current = true;

    const hasFrom = typeof state.filters.from === "string" && state.filters.from.length > 0;
    const hasTo = typeof state.filters.to === "string" && state.filters.to.length > 0;
    if (hasFrom || hasTo) return;

    // Initialize default range to the last 7 days unless URL filters already provide a range.
    setFilters({
      ...state.filters,
      ...buildDefaultDateRange(),
    });
  }, [setFilters, state.filters]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  useEffect(() => {
    setSearchInput(state.search);
  }, [state.search]);

  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    const params = buildAdminTableParams(state);

    try {
      const result = await fetchJson<AuditListResponse>(
        buildTenantApiUrl(tenant, `/admin/audit?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok) {
        setListError(t("adminAudit.error.body"));
        setEvents([]);
        setTotalCount(0);
        return;
      }

      setEvents(result.data.items ?? []);
      setTotalCount(result.data.pageInfo?.totalCount ?? 0);
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadEvents();
      setSelectedEvent(null);
      setSelectedEventId(null);
      setIsDrawerOpen(false);
      setDetailError(null);
    }, 0);
    return () => clearTimeout(handle);
  }, [loadEvents, reloadNonce]);

  const loadDetail = useCallback(
    async (eventId: string) => {
      setIsDrawerOpen(true);
      setSelectedEventId(eventId);
      setSelectedEvent(null);
      setDetailError(null);
      setIsDetailLoading(true);

      const result = await fetchJson<AuditDetailResponse>(
        buildTenantApiUrl(tenant, `/admin/audit/${eventId}`),
        { cache: "no-store" },
      );

      if (!result.ok) {
        setDetailError(t("adminAudit.error.body"));
        setIsDetailLoading(false);
        return;
      }

      setSelectedEvent(result.data.item ?? null);
      setIsDetailLoading(false);
    },
    [t, tenant],
  );

  const handleRowClick = useCallback(
    (record: AuditEventRecord) => {
      void loadDetail(record.id);
    },
    [loadDetail],
  );

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedEventId(null);
    setSelectedEvent(null);
    setDetailError(null);
  }, []);

  const updateDateRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      if (nextFrom && nextTo && nextTo < nextFrom) {
        setDateRangeError(t("adminAudit.filters.dateRangeInvalid"));
        return;
      }
      setDateRangeError(null);
      const nextFilters = { ...state.filters };
      if (nextFrom) nextFilters.from = nextFrom;
      else delete nextFilters.from;
      if (nextTo) nextFilters.to = nextTo;
      else delete nextFilters.to;
      setFilters(nextFilters);
    },
    [setFilters, state.filters, t],
  );

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    setExportToast(null);

    try {
      const params = buildAdminTableParams(state, { includePaging: false });
      const query = params.toString();
      const response = await fetch(
        buildTenantApiUrl(
          tenant,
          `/admin/audit/export${query ? `?${query}` : ""}`,
        ),
        {
          method: "GET",
        },
      );

      if (!response.ok) {
        setExportToast({
          tone: "error",
          title: t("adminAudit.export.toast.error.title"),
          body: t("adminAudit.export.toast.error.body"),
        });
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-export.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportToast({
        tone: "success",
        title: t("adminAudit.export.toast.success.title"),
        body: t("adminAudit.export.toast.success.body"),
      });
    } catch {
      setExportToast({
        tone: "error",
        title: t("adminAudit.export.toast.error.title"),
        body: t("adminAudit.export.toast.error.body"),
      });
    } finally {
      setIsExporting(false);
    }
  }, [state, t, tenant]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    const actor = typeof state.filters.actor === "string" ? state.filters.actor : "";
    const actionType =
      typeof state.filters.actionType === "string" ? state.filters.actionType : "all";
    const entityType =
      typeof state.filters.entityType === "string" ? state.filters.entityType : "all";
    const result = typeof state.filters.result === "string" ? state.filters.result : "all";

    if (from || to) {
      chips.push({
        key: "dateRange",
        label: t("adminAudit.filters.dateRange"),
        value: `${from || t("generic.dash")} -> ${to || t("generic.dash")}`,
        onRemove: () => updateDateRange("", ""),
      });
    }

    if (actor.trim()) {
      chips.push({
        key: "actor",
        label: t("adminAudit.filters.actor"),
        value: actor.trim(),
        onRemove: () => setFilter("actor", null),
      });
    }

    if (actionType !== "all") {
      chips.push({
        key: "actionType",
        label: t("adminAudit.filters.actionType"),
        value: t(`adminAudit.actionType.${actionType}`),
        onRemove: () => setFilter("actionType", null),
      });
    }

    if (entityType !== "all") {
      chips.push({
        key: "entityType",
        label: t("adminAudit.filters.entityType"),
        value: t(getEntityLabelKey(entityType)),
        onRemove: () => setFilter("entityType", null),
      });
    }

    if (result !== "all") {
      const normalizedResult = result.toLowerCase();
      chips.push({
        key: "result",
        label: t("adminAudit.filters.result"),
        value: t(`adminAudit.result.${normalizedResult}`),
        onRemove: () => setFilter("result", null),
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
  }, [setFilter, setSearch, state.filters, state.search, t, updateDateRange]);

  const clearAll = useCallback(() => {
    const defaultRange = buildDefaultDateRange();
    setDateRangeError(null);
    setSearchInput("");
    resetAll({
      search: "",
      sortField: "occurredAt",
      sortDir: "desc",
      filters: {
        from: defaultRange.from,
        to: defaultRange.to,
      },
    });
  }, [resetAll]);

  const columns: AdminDataTableColumn<AuditEventRecord>[] = useMemo(
    () => [
      {
        key: "timestamp",
        label: t("adminAudit.table.timestamp"),
        sortable: true,
        sortField: "occurredAt",
        renderCell: (record) => (
          <span>{formatDateTime(record.occurredAt, locale)}</span>
        ),
      },
      {
        key: "actor",
        label: t("adminAudit.table.actor"),
        sortable: true,
        sortField: "actorDisplay",
        renderCell: (record) => {
          const actorLabel =
            record.actorType === "SYSTEM"
              ? t("adminAudit.systemActor")
              : record.actorDisplay?.trim() || t("adminAudit.actor.userFallback");
          return (
            <div className="flex flex-col">
              <span className="text-sm text-slate-900">{actorLabel}</span>
              <span className="text-xs text-slate-500">
                {record.actorId ?? t("generic.dash")}
              </span>
            </div>
          );
        },
      },
      {
        key: "action",
        label: t("adminAudit.table.action"),
        sortable: true,
        sortField: "action",
        renderCell: (record) => <span>{t(getActionLabelKey(record.action))}</span>,
      },
      {
        key: "entity",
        label: t("adminAudit.table.entity"),
        sortable: true,
        sortField: "entityType",
        renderCell: (record) => {
          const entityLabel = t(getEntityLabelKey(record.entityType));
          const primaryEntityValue = getPrimaryEntityValue(record);
          if (!primaryEntityValue) return <span>{entityLabel}</span>;
          const shouldShowRawId =
            Boolean(record.entityDisplay?.trim()) && Boolean(record.entityId?.trim());
          if (!shouldShowRawId) {
            return <span>{`${entityLabel} - ${primaryEntityValue}`}</span>;
          }
          return (
            <div className="flex flex-col">
              <span>{`${entityLabel} - ${primaryEntityValue}`}</span>
              <span className="text-xs text-slate-500">{record.entityId}</span>
            </div>
          );
        },
      },
      {
        key: "result",
        label: t("adminAudit.table.result"),
        sortable: true,
        sortField: "result",
        renderCell: (record) => {
          const isSuccess = record.result === "SUCCESS";
          return (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                isSuccess
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {isSuccess ? t("adminAudit.result.success") : t("adminAudit.result.failure")}
            </span>
          );
        },
      },
    ],
    [locale, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("adminAudit.empty.title"),
      body: t("adminAudit.empty.body"),
    }),
    [t],
  );

  const fromFilter = typeof state.filters.from === "string" ? state.filters.from : "";
  const toFilter = typeof state.filters.to === "string" ? state.filters.to : "";
  const actorFilter = typeof state.filters.actor === "string" ? state.filters.actor : "";
  const actionTypeFilter =
    typeof state.filters.actionType === "string" ? state.filters.actionType : "all";
  const entityTypeFilter =
    typeof state.filters.entityType === "string" ? state.filters.entityType : "all";
  const resultFilter = typeof state.filters.result === "string" ? state.filters.result : "all";

  const selectedMetadataEntries = useMemo(
    () => buildSafeMetadataEntries(selectedEvent?.metadata ?? null),
    [selectedEvent?.metadata],
  );

  const exportDisabled = isLoading || Boolean(listError) || totalCount === 0;
  const selectedFailureCode =
    selectedEvent?.result === "FAILURE" &&
    selectedEvent.metadata &&
    typeof selectedEvent.metadata.errorCode === "string"
      ? selectedEvent.metadata.errorCode
      : null;

  return (
    <div className="flex flex-col gap-6" data-testid="audit-log">
      <AdminTableToolbar
        searchId="audit-log-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        searchPlaceholder={t("adminAudit.search.placeholder")}
        filtersLabel={t("adminAudit.filters.label")}
        clearAllLabel={t("admin.table.filters.clearAll")}
        rightSlot={(
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className={primaryButton}
              onClick={() => void handleExportCsv()}
              disabled={exportDisabled || isExporting}
              data-testid="audit-log-export-csv"
            >
              {isExporting ? t("adminAudit.export.exporting") : t("adminAudit.export.csv")}
            </button>
            <p className="max-w-[320px] text-right text-xs text-slate-500">
              {exportDisabled
                ? t("adminAudit.export.disabledNoData")
                : t("adminAudit.export.helper")}
            </p>
          </div>
        )}
      />

      {exportToast ? (
        <section
          className={`rounded border px-3 py-2 ${
            exportToast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          data-testid="audit-export-toast"
        >
          <p className="text-sm font-semibold">{exportToast.title}</p>
          <p className="text-xs">{exportToast.body}</p>
        </section>
      ) : null}

      {listError ? (
        <AdminErrorPanel
          title={t("adminAudit.error.title")}
          body={t("adminAudit.error.body")}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
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
        <AdminFormField label={t("adminAudit.filters.startDate")} htmlFor="audit-filter-start-date">
          <input
            id="audit-filter-start-date"
            type="date"
            className={inputBase}
            value={fromFilter}
            onChange={(event) => updateDateRange(event.target.value, toFilter)}
            data-testid="audit-filter-start-date"
          />
        </AdminFormField>

        <AdminFormField label={t("adminAudit.filters.endDate")} htmlFor="audit-filter-end-date">
          <input
            id="audit-filter-end-date"
            type="date"
            className={inputBase}
            value={toFilter}
            onChange={(event) => updateDateRange(fromFilter, event.target.value)}
            data-testid="audit-filter-end-date"
          />
        </AdminFormField>

        {dateRangeError ? (
          <p className="text-xs text-red-600">{dateRangeError}</p>
        ) : null}

        <AdminFormField label={t("adminAudit.filters.actor")} htmlFor="audit-filter-actor">
          <input
            id="audit-filter-actor"
            className={inputBase}
            value={actorFilter}
            placeholder={t("adminAudit.filters.actorPlaceholder")}
            onChange={(event) => setFilter("actor", event.target.value)}
            data-testid="audit-filter-actor"
          />
        </AdminFormField>

        <AdminFormField label={t("adminAudit.filters.actionType")} htmlFor="audit-filter-action-type">
          <select
            id="audit-filter-action-type"
            className={inputBase}
            value={actionTypeFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (!nextValue || nextValue === "all") {
                setFilter("actionType", null);
                return;
              }
              setFilter("actionType", nextValue);
            }}
            data-testid="audit-filter-action-type"
          >
            {ACTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </AdminFormField>

        <AdminFormField label={t("adminAudit.filters.entityType")} htmlFor="audit-filter-entity-type">
          <select
            id="audit-filter-entity-type"
            className={inputBase}
            value={entityTypeFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (!nextValue || nextValue === "all") {
                setFilter("entityType", null);
                return;
              }
              setFilter("entityType", nextValue);
            }}
            data-testid="audit-filter-entity-type"
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </AdminFormField>

        <AdminFormField label={t("adminAudit.filters.result")} htmlFor="audit-filter-result">
          <select
            id="audit-filter-result"
            className={inputBase}
            value={resultFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (!nextValue || nextValue === "all") {
                setFilter("result", null);
                return;
              }
              setFilter("result", nextValue);
            }}
            data-testid="audit-filter-result"
          >
            {RESULT_OPTIONS.map((option) => (
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
          <div className="h-full w-full max-w-full overflow-y-auto bg-white p-6 shadow-xl md:w-[500px]">
            {isDetailLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {t("adminAudit.loading")}
              </div>
            ) : detailError ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-red-700">
                  {t("adminAudit.error.title")}
                </p>
                <p className="text-sm text-red-700">{detailError}</p>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    if (!selectedEventId) return;
                    void loadDetail(selectedEventId);
                  }}
                >
                  {t("admin.table.state.error.retry")}
                </button>
              </div>
            ) : selectedEvent ? (
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {t("adminAudit.detail.title")}
                  </h2>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={closeDrawer}
                    data-testid="audit-detail-close"
                  >
                    {t("actions.close")}
                  </button>
                </div>

                <section className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("adminAudit.table.timestamp")}
                    </span>
                    <span>{formatDateTime(selectedEvent.occurredAt, locale)}</span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("adminAudit.table.actor")}
                    </span>
                    <span>
                      {selectedEvent.actorType === "SYSTEM"
                        ? t("adminAudit.systemActor")
                        : selectedEvent.actorDisplay?.trim() ||
                          t("adminAudit.actor.userFallback")}
                    </span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("adminAudit.table.action")}
                    </span>
                    <span>{t(getActionLabelKey(selectedEvent.action))}</span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("adminAudit.table.entity")}
                    </span>
                    {(() => {
                      const entityLabel = t(getEntityLabelKey(selectedEvent.entityType));
                      const primaryEntityValue = getPrimaryEntityValue(selectedEvent);
                      const shouldShowRawId =
                        Boolean(selectedEvent.entityDisplay?.trim()) &&
                        Boolean(selectedEvent.entityId?.trim());
                      if (!primaryEntityValue) return <span>{entityLabel}</span>;
                      if (!shouldShowRawId) {
                        return <span>{`${entityLabel} - ${primaryEntityValue}`}</span>;
                      }
                      return (
                        <div className="flex flex-col gap-1">
                          <span>{`${entityLabel} - ${primaryEntityValue}`}</span>
                          <span className="text-xs text-slate-500">
                            {selectedEvent.entityId}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("adminAudit.table.result")}
                    </span>
                    <span>
                      {selectedEvent.result === "SUCCESS"
                        ? t("adminAudit.result.success")
                        : t("adminAudit.result.failure")}
                    </span>
                  </div>
                </section>

                {selectedEvent.correlationId ? (
                  <section className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("adminAudit.detail.correlationId")}
                    </span>
                    <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {selectedEvent.correlationId}
                    </code>
                  </section>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("adminAudit.detail.detailsSection")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("adminAudit.detail.safeMetadataNote")}
                  </p>

                  {selectedMetadataEntries.length === 0 ? (
                    <p className="text-sm text-slate-600">{t("generic.dash")}</p>
                  ) : (
                    <div className="grid gap-3">
                      {selectedMetadataEntries.map(([key, value]) => {
                        const formatted = formatMetadataValue(value);
                        return (
                          <div key={key} className="grid gap-1">
                            <span className="text-xs font-semibold text-slate-500">{key}</span>
                            {formatted.includes("\n") ? (
                              <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">
                                {formatted}
                              </pre>
                            ) : (
                              <span className="text-sm text-slate-700">{formatted}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {selectedEvent.result === "FAILURE" ? (
                  <section className="rounded border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-xs font-semibold text-red-700">
                      {t("adminAudit.detail.failureReason")}
                    </p>
                    <p className="text-sm text-red-700">
                      {selectedFailureCode
                        ? t(
                            FAILURE_REASON_KEY_BY_CODE[selectedFailureCode] ??
                              "adminAudit.failure.generic",
                          )
                        : t("adminAudit.failure.generic")}
                    </p>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
