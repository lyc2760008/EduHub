// One-off session creation modal (admin-only) with minimal validation and API integration.
"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useTranslations } from "next-intl";

import { fetchJson } from "@/lib/api/fetchJson";

type CenterOption = {
  id: string;
  name: string;
  timezone: string;
};

type TutorOption = {
  id: string;
  name: string | null;
  email: string;
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

type SessionOneOffModalProps = {
  centers: CenterOption[];
  tutors: TutorOption[];
  students: StudentOption[];
  groups: GroupOption[];
  timezoneOptions: string[];
  defaultTimezone: string;
  onClose: () => void;
  onCreated: (message: string) => void | Promise<void>;
};

type SessionType = "ONE_ON_ONE" | "GROUP" | "CLASS";

type FormState = {
  centerId: string;
  tutorId: string;
  sessionType: SessionType;
  studentId: string;
  groupId: string;
  startAt: string;
  endAt: string;
  timezone: string;
};

const DEFAULT_FORM: FormState = {
  centerId: "",
  tutorId: "",
  sessionType: "ONE_ON_ONE",
  studentId: "",
  groupId: "",
  startAt: "",
  endAt: "",
  timezone: "",
};

function formatStudentName(student: StudentOption) {
  return student.preferredName?.trim().length
    ? `${student.preferredName} ${student.lastName}`
    : `${student.firstName} ${student.lastName}`;
}

export default function SessionOneOffModal({
  centers,
  tutors,
  students,
  groups,
  timezoneOptions,
  defaultTimezone,
  onClose,
  onCreated,
}: SessionOneOffModalProps) {
  const t = useTranslations();
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    timezone: defaultTimezone,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredTutors = useMemo(() => {
    if (!form.centerId) return tutors;
    return tutors.filter((tutor) =>
      tutor.centers.some((center) => center.id === form.centerId),
    );
  }, [form.centerId, tutors]);

  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      if (form.centerId && group.centerId !== form.centerId) return false;
      if (form.sessionType === "GROUP") return group.type === "GROUP";
      if (form.sessionType === "CLASS") return group.type === "CLASS";
      return false;
    });
  }, [form.centerId, form.sessionType, groups]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSessionTypeChange(value: SessionType) {
    setForm((prev) => ({
      ...prev,
      sessionType: value,
      studentId: value === "ONE_ON_ONE" ? prev.studentId : "",
      groupId: value === "ONE_ON_ONE" ? "" : prev.groupId,
    }));
  }

  function applyCenterSelection(centerId: string) {
    const centerTimezone =
      centers.find((center) => center.id === centerId)?.timezone ?? "";
    setForm((prev) => ({
      ...prev,
      centerId,
      timezone: centerTimezone || prev.timezone || defaultTimezone,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    if (!form.centerId || !form.tutorId || !form.startAt || !form.endAt) {
      setError(t("admin.sessions.messages.requiredFields"));
      setIsSaving(false);
      return;
    }

    if (form.sessionType === "ONE_ON_ONE" && !form.studentId) {
      setError(t("admin.sessions.messages.studentRequired"));
      setIsSaving(false);
      return;
    }

    if (form.sessionType !== "ONE_ON_ONE" && !form.groupId) {
      setError(t("admin.sessions.messages.groupRequired"));
      setIsSaving(false);
      return;
    }

    const startLocal = DateTime.fromISO(form.startAt, {
      zone: form.timezone,
    });
    const endLocal = DateTime.fromISO(form.endAt, { zone: form.timezone });

    if (!startLocal.isValid || !endLocal.isValid) {
      setError(t("admin.sessions.messages.invalidTime"));
      setIsSaving(false);
      return;
    }

    if (endLocal <= startLocal) {
      setError(t("admin.sessions.messages.invalidRange"));
      setIsSaving(false);
      return;
    }

    const startAtIso = startLocal.toUTC().toISO();
    const endAtIso = endLocal.toUTC().toISO();

    if (!startAtIso || !endAtIso) {
      setError(t("admin.sessions.messages.invalidTime"));
      setIsSaving(false);
      return;
    }

    const payload = {
      centerId: form.centerId,
      tutorId: form.tutorId,
      sessionType: form.sessionType,
      studentId: form.sessionType === "ONE_ON_ONE" ? form.studentId : undefined,
      groupId: form.sessionType === "ONE_ON_ONE" ? undefined : form.groupId,
      startAt: startAtIso,
      endAt: endAtIso,
      timezone: form.timezone || defaultTimezone,
    };

    const result = await fetchJson<{ session: { id: string } }>(
      "/api/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!result.ok) {
      const isValidation = result.status === 400;
      setError(
        isValidation
          ? t("admin.sessions.messages.validationError")
          : t("admin.sessions.messages.createError"),
      );
      setIsSaving(false);
      return;
    }

    await onCreated(t("admin.sessions.messages.createSuccess"));
    setIsSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl rounded border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {t("admin.sessions.actions.createOneOff")}
          </h2>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            {t("common.actions.cancel")}
          </button>
        </div>
        <form className="mt-4 grid gap-4" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.center")}
              </span>
              <select
                className="rounded border border-slate-300 px-3 py-2"
                value={form.centerId}
                onChange={(event) => applyCenterSelection(event.target.value)}
              >
                <option value="">
                  {t("admin.sessions.placeholders.selectCenter")}
                </option>
                {centers.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.tutor")}
              </span>
              <select
                className="rounded border border-slate-300 px-3 py-2"
                value={form.tutorId}
                onChange={(event) => updateField("tutorId", event.target.value)}
              >
                <option value="">
                  {t("admin.sessions.placeholders.selectTutor")}
                </option>
                {filteredTutors.map((tutor) => (
                  <option key={tutor.id} value={tutor.id}>
                    {tutor.name ?? tutor.email}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.type")}
              </span>
              <select
                className="rounded border border-slate-300 px-3 py-2"
                value={form.sessionType}
                onChange={(event) =>
                  handleSessionTypeChange(event.target.value as SessionType)
                }
              >
                <option value="ONE_ON_ONE">
                  {t("admin.sessions.types.oneOnOne")}
                </option>
                <option value="GROUP">{t("admin.sessions.types.group")}</option>
                <option value="CLASS">{t("admin.sessions.types.class")}</option>
              </select>
            </label>
            {form.sessionType === "ONE_ON_ONE" ? (
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.sessions.fields.student")}
                </span>
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  value={form.studentId}
                  onChange={(event) =>
                    updateField("studentId", event.target.value)
                  }
                >
                  <option value="">
                    {t("admin.sessions.placeholders.selectStudent")}
                  </option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {formatStudentName(student)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.sessions.fields.group")}
                </span>
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  value={form.groupId}
                  onChange={(event) =>
                    updateField("groupId", event.target.value)
                  }
                >
                  <option value="">
                    {t("admin.sessions.placeholders.selectGroup")}
                  </option>
                  {filteredGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.startAt")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                type="datetime-local"
                value={form.startAt}
                onChange={(event) => updateField("startAt", event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.endAt")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                type="datetime-local"
                value={form.endAt}
                onChange={(event) => updateField("endAt", event.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">
              {t("admin.sessions.fields.timezone")}
            </span>
            <select
              className="rounded border border-slate-300 px-3 py-2"
              value={form.timezone}
              onChange={(event) => updateField("timezone", event.target.value)}
            >
              <option value="">
                {t("admin.sessions.placeholders.selectTimezone")}
              </option>
              {timezoneOptions.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving
                ? t("common.loading")
                : t("admin.sessions.actions.saveOneOff")}
            </button>
            <button
              className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              {t("common.actions.cancel")}
            </button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
