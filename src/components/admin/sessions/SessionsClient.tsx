// Sessions list keeps existing scheduling actions while adopting shared admin table toolkit primitives.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import type { Role } from "@/generated/prisma/client";
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
import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import SessionGeneratorModal from "@/components/admin/sessions/SessionGeneratorModal";
import SessionOneOffModal from "@/components/admin/sessions/SessionOneOffModal";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import { useAdminTableQueryState, useDebouncedValue } from "@/lib/admin-table/useAdminTableQueryState";

type RoleValue = Role;

type CenterOption = {
  id: string;
  name: string;
  timezone: string;
  isActive?: boolean;
};

type TutorOption = {
  id: string;
  name: string | null;
  email: string;
  role: RoleValue;
  centers: CenterOption[];
};

type StudentOption = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

type GroupOption = {
  id: string;
  name: string;
  type: "GROUP" | "CLASS";
  centerId: string;
};

type SessionListItem = {
  id: string;
  centerId: string;
  centerName: string;
  tutorId: string;
  tutorName: string | null;
  sessionType: "ONE_ON_ONE" | "GROUP" | "CLASS";
  groupId: string | null;
  groupName: string | null;
  groupType: "GROUP" | "CLASS" | null;
  startAt: string;
  endAt: string;
  timezone: string;
  pendingAbsenceCount: number;
};

type SessionsClientProps = {
  tenant: string;
  viewerRole: RoleValue;
  viewerId: string;
  viewerLabel: string;
};

type SessionsResponse = {
  rows: SessionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type BulkCancelReasonCode =
  | "WEATHER"
  | "TUTOR_UNAVAILABLE"
  | "HOLIDAY"
  | "LOW_ENROLLMENT"
  | "OTHER";

type StudentsResponse = {
  rows: StudentOption[];
  totalCount: number;
};

type GroupsResponse = {
  rows: GroupOption[];
  totalCount: number;
};

type TutorsResponse = {
  rows: TutorOption[];
  totalCount: number;
};

const DEFAULT_TIMEZONE = "America/Edmonton";
const BULK_CANCEL_REASON_CODES: BulkCancelReasonCode[] = [
  "WEATHER",
  "TUTOR_UNAVAILABLE",
  "HOLIDAY",
  "LOW_ENROLLMENT",
  "OTHER",
];

function sessionTypeLabelKey(type: SessionListItem["sessionType"]) {
  if (type === "ONE_ON_ONE") return "admin.sessions.types.oneOnOne";
  if (type === "GROUP") return "admin.sessions.types.group";
  return "admin.sessions.types.class";
}

function formatSessionDateTime(iso: string, timezone: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export default function SessionsClient({
  tenant,
  viewerRole,
  viewerId,
  viewerLabel,
}: SessionsClientProps) {
  const t = useTranslations();
  const isAdmin = viewerRole === "Owner" || viewerRole === "Admin";
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [centers, setCenters] = useState<CenterOption[]>([]);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [isOneOffOpen, setIsOneOffOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isBulkCancelOpen, setIsBulkCancelOpen] = useState(false);
  const [bulkCancelReasonCode, setBulkCancelReasonCode] = useState("");
  const [bulkCancelError, setBulkCancelError] = useState<string | null>(null);
  const [isBulkCanceling, setIsBulkCanceling] = useState(false);

  const { state, setSearch, setFilter, clearFilters, setSort, setPage, setPageSize } =
    useAdminTableQueryState({
      defaultSortField: "startAt",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["centerId", "tutorId", "from", "to"],
    });

  // Tutor lock prevents URL edits from escaping role-scoped visibility for non-admin users.
  useEffect(() => {
    if (isAdmin) return;
    const tutorId =
      typeof state.filters.tutorId === "string" ? state.filters.tutorId : "";
    if (tutorId !== viewerId) {
      setFilter("tutorId", viewerId);
    }
  }, [isAdmin, setFilter, state.filters.tutorId, viewerId]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Step 21.3 Admin Table query contract keeps session list params consistent.
    const params = buildAdminTableParams(state);
    const url = buildTenantApiUrl(tenant, `/sessions?${params.toString()}`);
    const result = await fetchJson<SessionsResponse>(url, { cache: "no-store" });

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        setError(t("admin.sessions.messages.forbidden"));
      } else if (result.status === 400) {
        setError(t("admin.sessions.messages.validationError"));
      } else {
        setError(t("admin.sessions.messages.loadError"));
      }
      setIsLoading(false);
      return;
    }

    setSessions(result.data.rows ?? []);
    const visibleIds = new Set((result.data.rows ?? []).map((session) => session.id));
    setSelectedSessionIds((current) =>
      current.filter((sessionId) => visibleIds.has(sessionId)),
    );
    setTotalCount(result.data.totalCount ?? 0);
    setIsLoading(false);
  }, [state, t, tenant]);

  const loadAdminOptions = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingOptions(true);

    const [centerResult, usersResult, studentsResult, groupsResult] =
      await Promise.all([
        fetchJson<CenterOption[]>(
          buildTenantApiUrl(tenant, "/centers?includeInactive=true"),
        ),
        fetchJson<TutorsResponse>(
          buildTenantApiUrl(
            tenant,
            `/users?${new URLSearchParams({
              page: "1",
              pageSize: "100",
              sortField: "name",
              sortDir: "asc",
              filters: JSON.stringify({ role: "Tutor" }),
            }).toString()}`,
          ),
        ),
        fetchJson<StudentsResponse>(
          // Keep modal option lists fresh and biased to most recently created students for admin flows.
          buildTenantApiUrl(
            tenant,
            `/students?${new URLSearchParams({
              page: "1",
              pageSize: "100",
              sortField: "createdAt",
              sortDir: "desc",
            }).toString()}`,
          ),
          { cache: "no-store" },
        ),
        fetchJson<GroupsResponse>(
          buildTenantApiUrl(
            tenant,
            `/groups?${new URLSearchParams({
              page: "1",
              pageSize: "100",
              sortField: "name",
              sortDir: "asc",
            }).toString()}`,
          ),
        ),
      ]);

    if (centerResult.ok) setCenters(centerResult.data);
    if (usersResult.ok) setTutors(usersResult.data.rows);
    if (studentsResult.ok) setStudents(studentsResult.data.rows);
    if (groupsResult.ok) setGroups(groupsResult.data.rows);

    if (
      !centerResult.ok ||
      !usersResult.ok ||
      !studentsResult.ok ||
      !groupsResult.ok
    ) {
      setError(t("admin.sessions.messages.loadError"));
    }

    setIsLoadingOptions(false);
  }, [isAdmin, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSessions();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSessions, reloadNonce]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadAdminOptions();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadAdminOptions]);

  const derivedCenters = useMemo(() => {
    if (isAdmin) return centers;
    const map = new Map<string, CenterOption>();
    for (const session of sessions) {
      map.set(session.centerId, {
        id: session.centerId,
        name: session.centerName,
        timezone: session.timezone,
      });
    }
    return Array.from(map.values());
  }, [centers, isAdmin, sessions]);

  const availableTutors = useMemo(() => {
    if (!isAdmin) return [];
    const centerId =
      typeof state.filters.centerId === "string" ? state.filters.centerId : "";
    if (!centerId) {
      return tutors.filter((user) => user.role === "Tutor");
    }
    return tutors.filter(
      (user) =>
        user.role === "Tutor" &&
        user.centers.some((center) => center.id === centerId),
    );
  }, [isAdmin, state.filters.centerId, tutors]);

  const timezoneOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const center of centers) {
      if (center.timezone) unique.add(center.timezone);
    }
    unique.add(DEFAULT_TIMEZONE);
    return Array.from(unique);
  }, [centers]);

  const defaultTimezone = useMemo(() => {
    const centerId =
      typeof state.filters.centerId === "string" ? state.filters.centerId : "";
    if (centerId) {
      const center = centers.find((option) => option.id === centerId);
      if (center?.timezone) return center.timezone;
    }
    return timezoneOptions[0] ?? DEFAULT_TIMEZONE;
  }, [centers, state.filters.centerId, timezoneOptions]);

  const openOneOffModal = () => {
    setIsOneOffOpen(true);
    setMessage(null);
  };

  const openGeneratorModal = () => {
    setIsGeneratorOpen(true);
    setMessage(null);
  };

  const selectedIdSet = useMemo(
    () => new Set(selectedSessionIds),
    [selectedSessionIds],
  );

  const selectedCount = selectedSessionIds.length;
  const isAllVisibleSelected =
    sessions.length > 0 && sessions.every((session) => selectedIdSet.has(session.id));

  const toggleSessionSelection = useCallback((sessionId: string, checked: boolean) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return Array.from(next);
    });
  }, []);

  const toggleSelectAllVisible = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedSessionIds(sessions.map((session) => session.id));
        return;
      }
      setSelectedSessionIds([]);
    },
    [sessions],
  );

  async function submitBulkCancel() {
    setBulkCancelError(null);
    if (!bulkCancelReasonCode) {
      setBulkCancelError(t("admin.sessions.bulkCancel.reasonRequired"));
      return;
    }
    if (!selectedSessionIds.length) {
      setBulkCancelError(t("admin.sessions.bulkCancel.failure"));
      return;
    }

    setIsBulkCanceling(true);
    const result = await fetchJson<{ ok: true; canceledCount: number }>(
      buildTenantApiUrl(tenant, "/sessions/bulk-cancel"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIds: selectedSessionIds,
          reasonCode: bulkCancelReasonCode,
        }),
      },
    );
    setIsBulkCanceling(false);

    if (!result.ok) {
      setBulkCancelError(t("admin.sessions.bulkCancel.failure"));
      return;
    }

    setMessage(
      t("admin.sessions.bulkCancel.success", {
        count: result.data.canceledCount,
      }),
    );
    setSelectedSessionIds([]);
    setBulkCancelReasonCode("");
    setBulkCancelError(null);
    setIsBulkCancelOpen(false);
    setReloadNonce((current) => current + 1);
  }

  const clearAll = () => {
    clearFilters();
    setSearch("");
    setSearchInput("");
    if (!isAdmin) {
      setFilter("tutorId", viewerId);
    }
  };

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const centerId =
      typeof state.filters.centerId === "string" ? state.filters.centerId : "";
    const tutorId =
      typeof state.filters.tutorId === "string" ? state.filters.tutorId : "";
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";

    if (centerId) {
      chips.push({
        key: "centerId",
        label: t("admin.sessions.filters.center"),
        value: derivedCenters.find((center) => center.id === centerId)?.name ?? centerId,
        onRemove: () => setFilter("centerId", ""),
      });
    }
    if (tutorId && isAdmin) {
      chips.push({
        key: "tutorId",
        label: t("admin.sessions.filters.tutor"),
        value: tutors.find((user) => user.id === tutorId)?.name ?? tutorId,
        onRemove: () => setFilter("tutorId", ""),
      });
    }
    if (from) {
      chips.push({
        key: "from",
        label: t("admin.sessions.filters.from"),
        value: from,
        onRemove: () => setFilter("from", ""),
      });
    }
    if (to) {
      chips.push({
        key: "to",
        label: t("admin.sessions.filters.to"),
        value: to,
        onRemove: () => setFilter("to", ""),
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
  }, [derivedCenters, isAdmin, setFilter, setSearch, state.filters, state.search, t, tutors]);

  const columns: AdminDataTableColumn<SessionListItem>[] = useMemo(
    () => {
      const baseColumns: AdminDataTableColumn<SessionListItem>[] = [
        ...(isAdmin
          ? [
              {
                key: "select",
                label: (
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={(event) =>
                      toggleSelectAllVisible(event.target.checked)
                    }
                    aria-label={t("admin.sessions.bulkCancel.selectAll")}
                  />
                ),
                renderCell: (session) => (
                  <input
                    type="checkbox"
                    checked={selectedIdSet.has(session.id)}
                    onChange={(event) =>
                      toggleSessionSelection(session.id, event.target.checked)
                    }
                    aria-label={t("admin.sessions.bulkCancel.selectRow")}
                  />
                ),
              } satisfies AdminDataTableColumn<SessionListItem>,
            ]
          : []),
        {
          key: "centerName",
        label: t("admin.sessions.fields.center"),
        sortable: true,
        sortField: "centerName",
        renderCell: (session) => (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-900">{session.centerName}</span>
            <span className="text-xs text-slate-500">{session.centerId}</span>
          </div>
        ),
      },
      {
        key: "tutorName",
        label: t("admin.sessions.fields.tutor"),
        sortable: true,
        sortField: "tutorName",
        renderCell: (session) => (
          <div className="flex flex-col gap-1 text-slate-700">
            <span>{session.tutorName ?? t("admin.sessions.messages.noTutor")}</span>
            <span className="text-xs text-slate-500">{session.tutorId}</span>
          </div>
        ),
      },
      {
        key: "sessionType",
        label: t("admin.sessions.fields.type"),
        renderCell: (session) => t(sessionTypeLabelKey(session.sessionType)),
      },
      {
        key: "groupName",
        label: t("admin.sessions.fields.group"),
        renderCell: (session) =>
          session.groupName ? session.groupName : t("admin.sessions.messages.noGroup"),
      },
      {
        key: "startAt",
        label: t("admin.sessions.fields.startAt"),
        sortable: true,
        sortField: "startAt",
        renderCell: (session) => (
          <div className="flex flex-col gap-1">
            <span>{formatSessionDateTime(session.startAt, session.timezone, locale)}</span>
            {session.pendingAbsenceCount > 0 ? (
              <span
                className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                data-testid={`absence-badge-${session.id}`}
              >
                {t("staff.absence.badge.pending")}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "endAt",
        label: t("admin.sessions.fields.endAt"),
        sortable: true,
        sortField: "endAt",
        renderCell: (session) =>
          formatSessionDateTime(session.endAt, session.timezone, locale),
      },
        {
          key: "actions",
          label: t("admin.sessions.fields.actions"),
          renderCell: (session) => (
            <Link
              className={`${secondaryButton} px-3 py-1 text-xs`}
              href={`/${tenant}/admin/sessions/${session.id}`}
              data-testid="sessions-open-detail"
            >
              {t("admin.sessions.actions.view")}
            </Link>
          ),
        },
      ];
      return baseColumns;
    },
    [
      isAdmin,
      isAllVisibleSelected,
      locale,
      selectedIdSet,
      t,
      tenant,
      toggleSelectAllVisible,
      toggleSessionSelection,
    ],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.sessions.messages.empty"),
      body: t("admin.reports.upcoming.empty.body"),
    }),
    [t],
  );

  const rightSlot = isAdmin ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={primaryButton}
        data-testid="sessions-create-button"
        disabled={isLoadingOptions}
        onClick={openOneOffModal}
        type="button"
      >
        {t("admin.sessions.actions.createOneOff")}
      </button>
      <button
        className={secondaryButton}
        data-testid="sessions-generate-button"
        disabled={isLoadingOptions}
        onClick={openGeneratorModal}
        type="button"
      >
        {t("admin.sessions.actions.generateRecurring")}
      </button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <AdminTableToolbar
        searchId="sessions-list-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        rightSlot={rightSlot}
      />

      {isAdmin && selectedCount > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white p-3">
          <p className="text-sm text-slate-700">
            {t("admin.sessions.bulkCancel.selectedCount", {
              count: selectedCount,
            })}
          </p>
          <button
            className={secondaryButton}
            type="button"
            onClick={() => {
              setBulkCancelError(null);
              setIsBulkCancelOpen(true);
            }}
            data-testid="sessions-bulk-cancel-action"
          >
            {t("admin.sessions.bulkCancel.action")}
          </button>
        </section>
      ) : null}

      {error ? <AdminErrorPanel onRetry={() => setReloadNonce((current) => current + 1)} /> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {!error ? (
        <>
          <AdminDataTable<SessionListItem>
            columns={columns}
            rows={sessions}
            rowKey={(session) => `sessions-row-${session.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
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
        <AdminFormField
          label={t("admin.sessions.filters.center")}
          htmlFor="sessions-filter-center"
        >
          <select
            id="sessions-filter-center"
            className={`${inputBase} min-w-[180px]`}
            data-testid="sessions-filter-center"
            value={typeof state.filters.centerId === "string" ? state.filters.centerId : ""}
            onChange={(event) => setFilter("centerId", event.target.value)}
          >
            <option value="">{t("admin.sessions.filters.allCenters")}</option>
            {derivedCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField label={t("admin.sessions.filters.from")} htmlFor="sessions-filter-from">
          <input
            id="sessions-filter-from"
            className={inputBase}
            type="date"
            data-testid="sessions-filter-from"
            value={typeof state.filters.from === "string" ? state.filters.from : ""}
            onChange={(event) => setFilter("from", event.target.value)}
          />
        </AdminFormField>
        <AdminFormField label={t("admin.sessions.filters.to")} htmlFor="sessions-filter-to">
          <input
            id="sessions-filter-to"
            className={inputBase}
            type="date"
            data-testid="sessions-filter-to"
            value={typeof state.filters.to === "string" ? state.filters.to : ""}
            onChange={(event) => setFilter("to", event.target.value)}
          />
        </AdminFormField>
        {isAdmin ? (
          <AdminFormField label={t("admin.sessions.filters.tutor")} htmlFor="sessions-filter-tutor">
            <select
              id="sessions-filter-tutor"
              className={`${inputBase} min-w-[180px]`}
              data-testid="sessions-filter-tutor"
              value={typeof state.filters.tutorId === "string" ? state.filters.tutorId : ""}
              onChange={(event) => setFilter("tutorId", event.target.value)}
            >
              <option value="">{t("admin.sessions.filters.allTutors")}</option>
              {availableTutors.map((tutor) => (
                <option key={tutor.id} value={tutor.id}>
                  {tutor.name ?? tutor.email}
                </option>
              ))}
            </select>
          </AdminFormField>
        ) : (
          <AdminFormField label={t("admin.sessions.filters.tutor")} htmlFor="sessions-filter-self">
            <input
              id="sessions-filter-self"
              className={`${inputBase} bg-slate-100 text-slate-600`}
              value={viewerLabel}
              disabled
            />
          </AdminFormField>
        )}
      </AdminFiltersSheet>

      {isAdmin && isOneOffOpen ? (
        <SessionOneOffModal
          centers={centers}
          defaultTimezone={defaultTimezone}
          groups={groups}
          onClose={() => setIsOneOffOpen(false)}
          onCreated={async (messageText) => {
            setMessage(messageText);
            setReloadNonce((current) => current + 1);
          }}
          students={students}
          tutors={tutors.filter((user) => user.role === "Tutor")}
          tenant={tenant}
          timezoneOptions={timezoneOptions}
        />
      ) : null}
      {isAdmin && isGeneratorOpen ? (
        <SessionGeneratorModal
          centers={centers}
          defaultTimezone={defaultTimezone}
          groups={groups}
          onClose={() => setIsGeneratorOpen(false)}
          onCommitted={async (messageText) => {
            setMessage(messageText);
            setReloadNonce((current) => current + 1);
          }}
          students={students}
          tutors={tutors.filter((user) => user.role === "Tutor")}
          tenant={tenant}
          timezoneOptions={timezoneOptions}
        />
      ) : null}

      {isAdmin && isBulkCancelOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.sessions.bulkCancel.dialogTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t("admin.sessions.bulkCancel.dialogBody", { count: selectedCount })}
            </p>
            <div className="mt-4 grid gap-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="sessions-bulk-cancel-reason"
              >
                {t("admin.sessions.bulkCancel.reasonLabel")}
              </label>
              <select
                id="sessions-bulk-cancel-reason"
                className={inputBase}
                value={bulkCancelReasonCode}
                onChange={(event) => setBulkCancelReasonCode(event.target.value)}
                disabled={isBulkCanceling}
              >
                <option value="">{t("admin.sessions.bulkCancel.reasonPlaceholder")}</option>
                {BULK_CANCEL_REASON_CODES.map((reasonCode) => (
                  <option key={reasonCode} value={reasonCode}>
                    {t(`admin.sessions.bulkCancel.reason.${reasonCode}`)}
                  </option>
                ))}
              </select>
              {bulkCancelError ? (
                <p className="text-sm text-red-600">{bulkCancelError}</p>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                className={secondaryButton}
                type="button"
                onClick={() => {
                  if (isBulkCanceling) return;
                  setIsBulkCancelOpen(false);
                  setBulkCancelError(null);
                }}
                disabled={isBulkCanceling}
              >
                {t("common.actions.cancel")}
              </button>
              <button
                className={primaryButton}
                type="button"
                onClick={() => void submitBulkCancel()}
                disabled={isBulkCanceling}
                data-testid="sessions-bulk-cancel-confirm"
              >
                {isBulkCanceling
                  ? t("admin.sessions.bulkCancel.confirmLoading")
                  : t("admin.sessions.bulkCancel.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
