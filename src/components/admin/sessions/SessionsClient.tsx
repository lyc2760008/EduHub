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
  sessions: SessionListItem[];
};

type StudentsResponse = {
  students: StudentOption[];
};

type GroupsResponse = {
  groups: GroupOption[];
};

const DEFAULT_TIMEZONE = "America/Edmonton";

function sessionTypeLabelKey(type: SessionListItem["sessionType"]) {
  if (type === "ONE_ON_ONE") return "admin.sessions.types.oneOnOne";
  if (type === "GROUP") return "admin.sessions.types.group";
  return "admin.sessions.types.class";
}

function buildStartOfDayISO(date: string) {
  if (!date) return undefined;
  const iso = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
}

function buildEndOfDayISO(date: string) {
  if (!date) return undefined;
  const iso = new Date(`${date}T23:59:59.999Z`);
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
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
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [isOneOffOpen, setIsOneOffOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

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

    const params = new URLSearchParams();
    const centerId =
      typeof state.filters.centerId === "string" ? state.filters.centerId : "";
    const tutorId =
      typeof state.filters.tutorId === "string" ? state.filters.tutorId : "";
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    if (centerId) params.set("centerId", centerId);
    if (tutorId) params.set("tutorId", tutorId);

    const startAtFrom = buildStartOfDayISO(from);
    const startAtTo = buildEndOfDayISO(to);
    if (startAtFrom) params.set("startAtFrom", startAtFrom);
    if (startAtTo) params.set("startAtTo", startAtTo);

    const url = params.size
      ? buildTenantApiUrl(tenant, `/sessions?${params.toString()}`)
      : buildTenantApiUrl(tenant, "/sessions");
    const result = await fetchJson<SessionsResponse>(url);

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

    setSessions(result.data.sessions ?? []);
    setIsLoading(false);
  }, [state.filters.centerId, state.filters.from, state.filters.to, state.filters.tutorId, t, tenant]);

  const loadAdminOptions = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingOptions(true);

    const [centerResult, usersResult, studentsResult, groupsResult] =
      await Promise.all([
        fetchJson<CenterOption[]>(
          buildTenantApiUrl(tenant, "/centers?includeInactive=true"),
        ),
        fetchJson<TutorOption[]>(buildTenantApiUrl(tenant, "/users")),
        fetchJson<StudentsResponse>(
          // Keep modal option lists fresh and biased to most recently created students for admin flows.
          buildTenantApiUrl(
            tenant,
            "/students?pageSize=100&sortField=createdAt&sortDir=desc",
          ),
          { cache: "no-store" },
        ),
        fetchJson<GroupsResponse>(buildTenantApiUrl(tenant, "/groups")),
      ]);

    if (centerResult.ok) setCenters(centerResult.data);
    if (usersResult.ok) setTutors(usersResult.data);
    if (studentsResult.ok) setStudents(studentsResult.data.students);
    if (groupsResult.ok) setGroups(groupsResult.data.groups);

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

  // Search/sort/pagination are local transforms over a server-filtered dataset from /api/sessions.
  const visibleSessions = useMemo(() => {
    const search = state.search.trim().toLowerCase();
    const filtered = search
      ? sessions.filter((session) => {
          const haystack = [
            session.centerName,
            session.tutorName ?? "",
            session.groupName ?? "",
            t(sessionTypeLabelKey(session.sessionType)),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        })
      : sessions;

    const sortField = state.sortField ?? "startAt";
    const direction = state.sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((left, right) => {
      if (sortField === "centerName") {
        return left.centerName.localeCompare(right.centerName) * direction;
      }
      if (sortField === "tutorName") {
        return (left.tutorName ?? "").localeCompare(right.tutorName ?? "") * direction;
      }
      if (sortField === "endAt") {
        return (
          (new Date(left.endAt).getTime() - new Date(right.endAt).getTime()) *
          direction
        );
      }
      return (
        (new Date(left.startAt).getTime() - new Date(right.startAt).getTime()) *
        direction
      );
    });

    const start = (state.page - 1) * state.pageSize;
    return {
      total: sorted.length,
      rows: sorted.slice(start, start + state.pageSize),
    };
  }, [sessions, state.page, state.pageSize, state.search, state.sortDir, state.sortField, t]);

  const openOneOffModal = () => {
    setIsOneOffOpen(true);
    setMessage(null);
  };

  const openGeneratorModal = () => {
    setIsGeneratorOpen(true);
    setMessage(null);
  };

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
    () => [
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
    ],
    [locale, t, tenant],
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

      {error ? <AdminErrorPanel onRetry={() => setReloadNonce((current) => current + 1)} /> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {!error ? (
        <>
          <AdminDataTable<SessionListItem>
            columns={columns}
            rows={visibleSessions.rows}
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
            totalCount={visibleSessions.total}
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
    </div>
  );
}
