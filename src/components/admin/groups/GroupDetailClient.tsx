// Client-side group detail view with tutor and roster management.
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

type GroupTypeValue = "GROUP" | "CLASS";

type TutorSummary = {
  id: string;
  name: string | null;
  email: string;
};

type StudentSummary = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
};

type GroupDetail = {
  id: string;
  name: string;
  type: GroupTypeValue;
  centerId: string;
  centerName: string;
  programId: string;
  programName: string;
  levelId: string | null;
  levelName: string | null;
  isActive: boolean;
  capacity: number | null;
  notes: string | null;
  tutors: TutorSummary[];
  students: StudentSummary[];
};

type GroupDetailClientProps = {
  group: GroupDetail;
  tutors: TutorSummary[];
  students: StudentSummary[];
  tenant: string;
};

function formatTutorLabel(tutor: TutorSummary) {
  const displayName = tutor.name?.trim();
  return displayName ? `${displayName} (${tutor.email})` : tutor.email;
}

function formatStudentLabel(student: StudentSummary) {
  const preferred = student.preferredName?.trim();
  const fullName = `${student.firstName} ${student.lastName}`.trim();
  return preferred ? `${preferred} (${fullName})` : fullName;
}

export default function GroupDetailClient({
  group: initialGroup,
  tutors,
  students,
  tenant,
}: GroupDetailClientProps) {
  const t = useTranslations();
  const [group, setGroup] = useState<GroupDetail>(initialGroup);
  const [selectedTutorIds, setSelectedTutorIds] = useState<string[]>(
    initialGroup.tutors.map((tutor) => tutor.id),
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(
    initialGroup.students.map((student) => student.id),
  );
  const [studentFilter, setStudentFilter] = useState("");
  const [isSavingTutors, setIsSavingTutors] = useState(false);
  const [isSavingStudents, setIsSavingStudents] = useState(false);
  const [isSyncingStudents, setIsSyncingStudents] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [tutorMessage, setTutorMessage] = useState<string | null>(null);
  const [studentMessage, setStudentMessage] = useState<string | null>(null);

  const groupTypeLabel = useMemo(() => {
    return group.type === "CLASS"
      ? t("admin.groups.types.class")
      : t("admin.groups.types.group");
  }, [group.type, t]);

  const filteredStudents = useMemo(() => {
    const query = studentFilter.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const label = formatStudentLabel(student).toLowerCase();
      return label.includes(query);
    });
  }, [studentFilter, students]);

  function toggleTutor(tutorId: string) {
    setSelectedTutorIds((prev) => {
      const next = new Set(prev);
      if (next.has(tutorId)) {
        next.delete(tutorId);
      } else {
        next.add(tutorId);
      }
      return Array.from(next);
    });
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return Array.from(next);
    });
  }

  async function saveTutors() {
    setIsSavingTutors(true);
    setTutorError(null);
    setTutorMessage(null);

    const result = await fetchJson<{ tutorIds: string[] }>(
      buildTenantApiUrl(tenant, `/groups/${group.id}/tutors`),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorIds: selectedTutorIds }),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setTutorError(t("admin.groups.messages.forbidden"));
      setIsSavingTutors(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setTutorError(
        isValidation
          ? t("admin.groups.messages.validationError")
          : t("admin.groups.messages.loadError"),
      );
      setIsSavingTutors(false);
      return;
    }

    const nextTutors = tutors.filter((tutor) =>
      selectedTutorIds.includes(tutor.id),
    );
    setGroup((prev) => ({ ...prev, tutors: nextTutors }));
    setTutorMessage(t("admin.groups.messages.tutorsUpdated"));
    setIsSavingTutors(false);
  }

  async function saveStudents() {
    setIsSavingStudents(true);
    setStudentError(null);
    setStudentMessage(null);

    const result = await fetchJson<{ studentIds: string[] }>(
      buildTenantApiUrl(tenant, `/groups/${group.id}/students`),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds: selectedStudentIds }),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setStudentError(t("admin.groups.messages.forbidden"));
      setIsSavingStudents(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setStudentError(
        isValidation
          ? t("admin.groups.messages.validationError")
          : t("admin.groups.messages.loadError"),
      );
      setIsSavingStudents(false);
      return;
    }

    const nextStudents = students.filter((student) =>
      selectedStudentIds.includes(student.id),
    );
    setGroup((prev) => ({ ...prev, students: nextStudents }));
    setStudentMessage(t("admin.groups.messages.studentsUpdated"));
    setIsSavingStudents(false);
  }

  async function syncStudentsToFutureSessions() {
    setIsSyncingStudents(true);
    setStudentError(null);
    setStudentMessage(null);

    const result = await fetchJson<{
      totalFutureSessions: number;
      sessionsUpdated: number;
      studentsAdded: number;
    }>(buildTenantApiUrl(tenant, `/groups/${group.id}/sync-future-sessions`), {
      method: "POST",
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setStudentError(t("admin.groups.messages.forbidden"));
      setIsSyncingStudents(false);
      return;
    }

    if (!result.ok) {
      setStudentError(t("admin.groups.messages.loadError"));
      setIsSyncingStudents(false);
      return;
    }

    // Surface non-sensitive sync counts so admins can confirm action impact quickly.
    setStudentMessage(
      t("admin.groups.messages.futureSessionsSynced", {
        sessions: result.data.sessionsUpdated,
        students: result.data.studentsAdded,
      }),
    );
    setIsSyncingStudents(false);
  }

  const tutorEmpty = tutors.length === 0;
  const studentEmpty = students.length === 0;

  return (
    <div className="grid gap-6">
      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("admin.groups.sections.overview")}
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="text-sm">
            <p className="text-slate-500">{t("admin.groups.fields.type")}</p>
            <p className="font-medium text-slate-900">{groupTypeLabel}</p>
          </div>
          <div className="text-sm">
            <p className="text-slate-500">{t("admin.groups.fields.status")}</p>
            <p className="font-medium text-slate-900">
              {group.isActive
                ? t("common.status.active")
                : t("common.status.inactive")}
            </p>
          </div>
          <div className="text-sm">
            <p className="text-slate-500">{t("admin.groups.fields.center")}</p>
            <p className="font-medium text-slate-900">{group.centerName}</p>
          </div>
          <div className="text-sm">
            <p className="text-slate-500">{t("admin.groups.fields.program")}</p>
            <p className="font-medium text-slate-900">{group.programName}</p>
          </div>
          <div className="text-sm">
            <p className="text-slate-500">{t("admin.groups.fields.level")}</p>
            <p className="font-medium text-slate-900">
              {group.levelName ?? t("admin.groups.messages.noLevel")}
            </p>
          </div>
          <div className="text-sm">
            <p className="text-slate-500">
              {t("admin.groups.fields.capacity")}
            </p>
            <p className="font-medium text-slate-900">
              {group.capacity ?? t("admin.groups.messages.noCapacity")}
            </p>
          </div>
          <div className="text-sm md:col-span-2">
            <p className="text-slate-500">{t("admin.groups.fields.notes")}</p>
            <p className="font-medium text-slate-900">
              {group.notes ?? t("admin.groups.messages.noNotes")}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("admin.groups.sections.tutors")}
          </h2>
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            data-testid="save-group-tutors-button"
            disabled={isSavingTutors}
            onClick={saveTutors}
            type="button"
          >
            {isSavingTutors
              ? t("common.loading")
              : t("admin.groups.actions.saveTutors")}
          </button>
        </div>

        {tutorError ? (
          <p className="mt-3 text-sm text-red-600">{tutorError}</p>
        ) : null}
        {tutorMessage ? (
          <p className="mt-3 text-sm text-green-600">{tutorMessage}</p>
        ) : null}

        {/* data-testid hooks keep tutor selection stable in E2E. */}
        <div className="mt-4 grid gap-2" data-testid="assign-tutor-select">
          {tutorEmpty ? (
            <p
              className="text-sm text-slate-500"
              data-testid="tutor-empty-state"
            >
              {t("admin.groups.messages.noTutors")}
            </p>
          ) : (
            tutors.map((tutor) => (
              <label key={tutor.id} className="flex items-center gap-2 text-sm">
                <input
                  checked={selectedTutorIds.includes(tutor.id)}
                  className="h-4 w-4 rounded border-slate-300"
                  onChange={() => toggleTutor(tutor.id)}
                  type="checkbox"
                />
                <span className="text-slate-700">
                  {formatTutorLabel(tutor)}
                </span>
              </label>
            ))
          )}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("admin.groups.sections.students")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
              data-testid="sync-group-future-sessions-button"
              disabled={isSavingStudents || isSyncingStudents}
              onClick={syncStudentsToFutureSessions}
              type="button"
            >
              {isSyncingStudents
                ? t("admin.groups.actions.syncFutureSessionsLoading")
                : t("admin.groups.actions.syncFutureSessions")}
            </button>
            <button
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              data-testid="save-group-students-button"
              disabled={isSavingStudents || isSyncingStudents}
              onClick={saveStudents}
              type="button"
            >
              {isSavingStudents
                ? t("common.loading")
                : t("admin.groups.actions.saveStudents")}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">
              {t("admin.groups.fields.studentFilter")}
            </span>
            <input
              className="rounded border border-slate-300 px-3 py-2"
              data-testid="student-filter-input"
              placeholder={t("admin.groups.messages.filterStudents")}
              value={studentFilter}
              onChange={(event) => setStudentFilter(event.target.value)}
            />
          </label>
        </div>

        {studentError ? (
          <p className="mt-3 text-sm text-red-600">{studentError}</p>
        ) : null}
        {studentMessage ? (
          <p className="mt-3 text-sm text-green-600">{studentMessage}</p>
        ) : null}

        {/* Wrapper adds a stable roster hook without removing existing selectors. */}
        <div className="mt-4" data-testid="group-roster-student-select">
          {/* data-testid hooks keep roster selection stable in E2E. */}
          <div className="grid gap-2" data-testid="add-student-select">
            {studentEmpty ? (
              <p
                className="text-sm text-slate-500"
                data-testid="student-empty-state"
              >
                {t("admin.groups.messages.noStudents")}
              </p>
            ) : (
              filteredStudents.map((student) => (
                <label
                  key={student.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    checked={selectedStudentIds.includes(student.id)}
                    className="h-4 w-4 rounded border-slate-300"
                    onChange={() => toggleStudent(student.id)}
                    type="checkbox"
                  />
                  <span className="text-slate-700">
                    {formatStudentLabel(student)}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
