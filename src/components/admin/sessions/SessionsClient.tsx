// Client-side sessions list UI with filters and admin-only create/generate modals.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
// Shared classes keep focus-visible and hover states consistent in Sessions UI.
import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { fetchJson } from "@/lib/api/fetchJson";
import SessionGeneratorModal from "@/components/admin/sessions/SessionGeneratorModal";
import SessionOneOffModal from "@/components/admin/sessions/SessionOneOffModal";

type RoleValue = "Owner" | "Admin" | "Tutor" | "Parent" | "Student";

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

type SessionFilters = {
  centerId: string;
  tutorId: string;
  from: string;
  to: string;
};

type StudentsResponse = {
  students: StudentOption[];
};

type GroupsResponse = {
  groups: GroupOption[];
};

const DEFAULT_TIMEZONE = "America/Edmonton";

function sessionTypeLabelKey(type: SessionListItem["sessionType"]) {
  switch (type) {
    case "ONE_ON_ONE":
      return "admin.sessions.types.oneOnOne";
    case "GROUP":
      return "admin.sessions.types.group";
    case "CLASS":
      return "admin.sessions.types.class";
  }
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL contract: centerId, tutorId, from, to (YYYY-MM-DD); only non-empty values are persisted.
  // Tutor lock: non-admins always scope tutorId to self, ignoring URL overrides.
  const filters = useMemo<SessionFilters>(() => {
    const centerId = searchParams.get("centerId") ?? "";
    const urlTutorId = searchParams.get("tutorId") ?? "";
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    return {
      centerId,
      tutorId: isAdmin ? urlTutorId : viewerId,
      from,
      to,
    };
  }, [isAdmin, searchParams, viewerId]);

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [centers, setCenters] = useState<CenterOption[]>([]);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [isOneOffOpen, setIsOneOffOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  // Serialize filters in a stable order to avoid URL churn when nothing changed.
  const serializeFiltersToQueryString = useCallback(
    (filters: SessionFilters) => {
      const params = new URLSearchParams();
      if (filters.centerId) params.set("centerId", filters.centerId);
      if (filters.tutorId) params.set("tutorId", filters.tutorId);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return params.toString();
    },
    [],
  );

  // Helper to update the URL without pushing history entries.
  const updateFiltersInUrl = useCallback(
    (nextFilters: Partial<SessionFilters>) => {
      const merged: SessionFilters = {
        centerId: nextFilters.centerId ?? filters.centerId,
        tutorId: nextFilters.tutorId ?? filters.tutorId,
        from: nextFilters.from ?? filters.from,
        to: nextFilters.to ?? filters.to,
      };
      const sanitized = isAdmin ? merged : { ...merged, tutorId: viewerId };
      const nextQuery = serializeFiltersToQueryString(sanitized);
      const currentQuery = searchParams.toString();
      // Loop prevention: only replace when the query string actually changes.
      if (nextQuery === currentQuery) return;
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextUrl);
    },
    [
      filters.centerId,
      filters.from,
      filters.to,
      filters.tutorId,
      isAdmin,
      pathname,
      router,
      searchParams,
      serializeFiltersToQueryString,
      viewerId,
    ],
  );

  useEffect(() => {
    // Tutor lock: non-admins always persist their own tutorId, stripping overrides.
    if (isAdmin) return;
    const nextQuery = serializeFiltersToQueryString({
      centerId: filters.centerId,
      tutorId: viewerId,
      from: filters.from,
      to: filters.to,
    });
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl);
  }, [
    filters.centerId,
    filters.from,
    filters.to,
    isAdmin,
    pathname,
    router,
    searchParams,
    serializeFiltersToQueryString,
    viewerId,
  ]);

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
    if (!filters.centerId) {
      return tutors.filter((user) => user.role === "Tutor");
    }
    return tutors.filter(
      (user) =>
        user.role === "Tutor" &&
        user.centers.some((center) => center.id === filters.centerId),
    );
  }, [filters.centerId, isAdmin, tutors]);

  const timezoneOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const center of centers) {
      if (center.timezone) {
        unique.add(center.timezone);
      }
    }
    unique.add(DEFAULT_TIMEZONE);
    return Array.from(unique);
  }, [centers]);

  const defaultTimezone = useMemo(() => {
    if (filters.centerId) {
      const center = centers.find((option) => option.id === filters.centerId);
      if (center?.timezone) return center.timezone;
    }
    return timezoneOptions[0] ?? DEFAULT_TIMEZONE;
  }, [centers, filters.centerId, timezoneOptions]);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.centerId) params.set("centerId", filters.centerId);
    if (filters.tutorId) params.set("tutorId", filters.tutorId);

    const startAtFrom = buildStartOfDayISO(filters.from);
    const startAtTo = buildEndOfDayISO(filters.to);
    if (startAtFrom) params.set("startAtFrom", startAtFrom);
    if (startAtTo) params.set("startAtTo", startAtTo);

    const url = params.size
      ? `/api/sessions?${params.toString()}`
      : "/api/sessions";
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

    setSessions(result.data.sessions);
    setIsLoading(false);
  }, [filters.centerId, filters.from, filters.to, filters.tutorId, t]);

  const loadAdminOptions = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingOptions(true);

    const [centerResult, usersResult, studentsResult, groupsResult] =
      await Promise.all([
        fetchJson<CenterOption[]>("/api/centers?includeInactive=true"),
        fetchJson<TutorOption[]>("/api/users"),
        fetchJson<StudentsResponse>("/api/students?pageSize=100"),
        fetchJson<GroupsResponse>("/api/groups"),
      ]);

    if (centerResult.ok) {
      setCenters(centerResult.data);
    }

    if (usersResult.ok) {
      setTutors(usersResult.data);
    }

    if (studentsResult.ok) {
      setStudents(studentsResult.data.students);
    }

    if (groupsResult.ok) {
      setGroups(groupsResult.data.groups);
    }

    if (
      !centerResult.ok ||
      !usersResult.ok ||
      !studentsResult.ok ||
      !groupsResult.ok
    ) {
      setError(t("admin.sessions.messages.loadError"));
    }

    setIsLoadingOptions(false);
  }, [isAdmin, t]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSessions();
    }, 0);

    return () => clearTimeout(handle);
  }, [loadSessions]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadAdminOptions();
    }, 0);

    return () => clearTimeout(handle);
  }, [loadAdminOptions]);

  function handleFilterCenterChange(value: string) {
    // Reset tutor filter when the center filter changes for admins.
    updateFiltersInUrl({ centerId: value, tutorId: isAdmin ? "" : viewerId });
  }

  function openOneOffModal() {
    setIsOneOffOpen(true);
    setMessage(null);
  }

  function openGeneratorModal() {
    setIsGeneratorOpen(true);
    setMessage(null);
  }

  const columns: AdminTableColumn<SessionListItem>[] = [
    {
      header: t("admin.sessions.fields.center"),
      cell: (session) => (
        <div className="flex flex-col gap-1">
          <span
            className="text-sm font-medium text-slate-900"
            data-testid="sessions-row"
          >
            {session.centerName}
          </span>
          <span className="text-xs text-slate-500">{session.centerId}</span>
        </div>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.fields.tutor"),
      cell: (session) => (
        <div className="flex flex-col gap-1 text-slate-700">
          <span>
            {session.tutorName ?? t("admin.sessions.messages.noTutor")}
          </span>
          <span className="text-xs text-slate-500">{session.tutorId}</span>
        </div>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.fields.type"),
      cell: (session) => (
        <span className="text-sm text-slate-700">
          {t(sessionTypeLabelKey(session.sessionType))}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.fields.group"),
      cell: (session) =>
        session.groupName ? (
          <span className="text-sm text-slate-700">{session.groupName}</span>
        ) : (
          <span className="text-xs text-slate-400">
            {t("admin.sessions.messages.noGroup")}
          </span>
        ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.fields.startAt"),
      cell: (session) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">
            {formatSessionDateTime(session.startAt, session.timezone, locale)}
          </span>
          {/* Badge stays minimal and text-only to avoid implying schedule changes. */}
          {session.pendingAbsenceCount > 0 ? (
            <span
              className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
              // Data-testid anchors pending absence badge for staff E2E coverage.
              data-testid={`absence-badge-${session.id}`}
            >
              {t("staff.absence.badge.pending")}
            </span>
          ) : null}
        </div>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.fields.endAt"),
      cell: (session) => (
        <span className="text-sm text-slate-700">
          {formatSessionDateTime(session.endAt, session.timezone, locale)}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.fields.actions"),
      cell: (session) => (
        <Link
          className={`${secondaryButton} px-3 py-1 text-xs`}
          data-testid="sessions-open-detail"
          href={`/${tenant}/admin/sessions/${session.id}`}
        >
          {t("admin.sessions.actions.view")}
        </Link>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  const loadingState = t("common.loading");
  const emptyState = t("admin.sessions.messages.empty");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">
              {t("admin.sessions.filters.center")}
            </span>
            <select
              className={`${inputBase} min-w-[180px]`}
              data-testid="sessions-filter-center"
              value={filters.centerId}
              onChange={(event) => handleFilterCenterChange(event.target.value)}
            >
              <option value="">{t("admin.sessions.filters.allCenters")}</option>
              {derivedCenters.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">
              {t("admin.sessions.filters.from")}
            </span>
            <input
              className={inputBase}
              data-testid="sessions-filter-from"
              type="date"
              value={filters.from}
              onChange={(event) =>
                updateFiltersInUrl({ from: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">
              {t("admin.sessions.filters.to")}
            </span>
            <input
              className={inputBase}
              data-testid="sessions-filter-to"
              type="date"
              value={filters.to}
              onChange={(event) =>
                updateFiltersInUrl({ to: event.target.value })
              }
            />
          </label>
          {isAdmin ? (
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.filters.tutor")}
              </span>
              <select
                className={`${inputBase} min-w-[180px]`}
                data-testid="sessions-filter-tutor"
                value={filters.tutorId}
                onChange={(event) =>
                  updateFiltersInUrl({ tutorId: event.target.value })
                }
              >
                <option value="">
                  {t("admin.sessions.filters.allTutors")}
                </option>
                {availableTutors.map((tutor) => (
                  <option key={tutor.id} value={tutor.id}>
                    {tutor.name ?? tutor.email}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.filters.tutor")}
              </span>
              <input
                className={`${inputBase} bg-slate-100 text-slate-600`}
                disabled
                value={viewerLabel}
              />
            </label>
          )}
        </div>
        {isAdmin ? (
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
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      <AdminTable
        rows={sessions}
        columns={columns}
        rowKey={(session) => `sessions-row-${session.id}`}
        testId="sessions-table"
        isLoading={isLoading}
        loadingState={loadingState}
        emptyState={emptyState}
      />

      {isAdmin && isOneOffOpen ? (
        <SessionOneOffModal
          centers={centers}
          defaultTimezone={defaultTimezone}
          groups={groups}
          onClose={() => setIsOneOffOpen(false)}
          onCreated={async (messageText) => {
            setMessage(messageText);
            await loadSessions();
          }}
          students={students}
          tutors={tutors.filter((user) => user.role === "Tutor")}
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
            await loadSessions();
          }}
          students={students}
          tutors={tutors.filter((user) => user.role === "Tutor")}
          timezoneOptions={timezoneOptions}
        />
      ) : null}
    </div>
  );
}
