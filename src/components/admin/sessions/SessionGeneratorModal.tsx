// Recurring session generator modal with dry-run preview and commit support.
"use client";

import { useMemo, useState } from "react";
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

type SessionGeneratorModalProps = {
  centers: CenterOption[];
  tutors: TutorOption[];
  students: StudentOption[];
  groups: GroupOption[];
  timezoneOptions: string[];
  defaultTimezone: string;
  onClose: () => void;
  onCommitted: (message: string) => void | Promise<void>;
};

type SessionType = "ONE_ON_ONE" | "GROUP" | "CLASS";

type FormState = {
  centerId: string;
  tutorId: string;
  sessionType: SessionType;
  studentId: string;
  groupId: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
};

type GeneratorResponse = {
  dryRun: boolean;
  totalOccurrences: number;
  createdCount?: number;
  skippedCount?: number;
  occurrences: Array<{ startAt: string; endAt: string }>;
  occurrencesNote?: string;
};

const DEFAULT_FORM: FormState = {
  centerId: "",
  tutorId: "",
  sessionType: "ONE_ON_ONE",
  studentId: "",
  groupId: "",
  startDate: "",
  endDate: "",
  weekdays: [],
  startTime: "",
  endTime: "",
  timezone: "",
};

const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 7] as const;

function formatStudentName(student: StudentOption) {
  return student.preferredName?.trim().length
    ? `${student.preferredName} ${student.lastName}`
    : `${student.firstName} ${student.lastName}`;
}

export default function SessionGeneratorModal({
  centers,
  tutors,
  students,
  groups,
  timezoneOptions,
  defaultTimezone,
  onClose,
  onCommitted,
}: SessionGeneratorModalProps) {
  const t = useTranslations();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    timezone: defaultTimezone,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<GeneratorResponse | null>(null);
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

  function toggleWeekday(weekday: number) {
    setForm((prev) => {
      const selected = new Set(prev.weekdays);
      if (selected.has(weekday)) {
        selected.delete(weekday);
      } else {
        selected.add(weekday);
      }
      return { ...prev, weekdays: Array.from(selected).sort() };
    });
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

  function validateForm() {
    if (
      !form.centerId ||
      !form.tutorId ||
      !form.startDate ||
      !form.endDate ||
      !form.startTime ||
      !form.endTime
    ) {
      return t("admin.sessions.messages.requiredFields");
    }

    if (!form.weekdays.length) {
      return t("admin.sessions.messages.weekdayRequired");
    }

    if (form.sessionType === "ONE_ON_ONE" && !form.studentId) {
      return t("admin.sessions.messages.studentRequired");
    }

    if (form.sessionType !== "ONE_ON_ONE" && !form.groupId) {
      return t("admin.sessions.messages.groupRequired");
    }

    return null;
  }

  function buildPayload(dryRun: boolean) {
    return {
      centerId: form.centerId,
      tutorId: form.tutorId,
      sessionType: form.sessionType,
      studentId: form.sessionType === "ONE_ON_ONE" ? form.studentId : undefined,
      groupId: form.sessionType === "ONE_ON_ONE" ? undefined : form.groupId,
      startDate: form.startDate,
      endDate: form.endDate,
      weekdays: form.weekdays,
      startTime: form.startTime,
      endTime: form.endTime,
      timezone: form.timezone || defaultTimezone,
      dryRun,
    };
  }

  async function runPreview() {
    setIsSaving(true);
    setError(null);
    setPreview(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setIsSaving(false);
      return;
    }

    const result = await fetchJson<GeneratorResponse>(
      "/api/sessions/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(true)),
      },
    );

    if (!result.ok) {
      const isValidation = result.status === 400;
      setError(
        isValidation
          ? t("admin.sessions.messages.validationError")
          : t("admin.sessions.messages.generateError"),
      );
      setIsSaving(false);
      return;
    }

    setPreview(result.data);
    setIsSaving(false);
  }

  async function runCommit() {
    setIsSaving(true);
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setIsSaving(false);
      return;
    }

    const result = await fetchJson<GeneratorResponse>(
      "/api/sessions/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(false)),
      },
    );

    if (!result.ok) {
      const isValidation = result.status === 400;
      setError(
        isValidation
          ? t("admin.sessions.messages.validationError")
          : t("admin.sessions.messages.generateError"),
      );
      setIsSaving(false);
      return;
    }

    await onCommitted(t("admin.sessions.messages.generateSuccess"));
    setIsSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl rounded border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {t("admin.sessions.actions.generateRecurring")}
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
        <form className="mt-4 grid gap-4" noValidate>
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
                {t("admin.sessions.fields.startDate")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  updateField("startDate", event.target.value)
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.endDate")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                type="date"
                value={form.endDate}
                onChange={(event) => updateField("endDate", event.target.value)}
              />
            </label>
          </div>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="text-slate-700">
              {t("admin.sessions.fields.weekdays")}
            </legend>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_VALUES.map((weekday) => (
                <label key={weekday} className="flex items-center gap-2">
                  <input
                    checked={form.weekdays.includes(weekday)}
                    className="h-4 w-4 rounded border-slate-300"
                    onChange={() => toggleWeekday(weekday)}
                    type="checkbox"
                  />
                  <span className="text-slate-700">
                    {t(`admin.sessions.weekdays.${weekday}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.startTime")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  updateField("startTime", event.target.value)
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.sessions.fields.endTime")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                type="time"
                value={form.endTime}
                onChange={(event) => updateField("endTime", event.target.value)}
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
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            data-testid="generator-preview-button"
            disabled={isSaving}
            onClick={runPreview}
            type="button"
          >
            {t("admin.sessions.actions.preview")}
          </button>
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
            data-testid="generator-confirm-button"
            disabled={isSaving}
            onClick={runCommit}
            type="button"
          >
            {t("admin.sessions.actions.confirm")}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        {preview ? (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-700">
                {t("admin.sessions.messages.previewCount")}
              </p>
              <span
                className="text-sm font-semibold text-slate-900"
                data-testid="generator-preview-count"
              >
                {preview.totalOccurrences}
              </span>
            </div>
            {preview.occurrencesNote ? (
              <p className="mt-2 text-xs text-slate-500">
                {t("admin.sessions.messages.previewTruncated")}
              </p>
            ) : null}
            {preview.occurrences.length ? (
              <ul className="mt-3 grid gap-2 text-xs text-slate-600">
                {preview.occurrences.slice(0, 5).map((occurrence, index) => (
                  <li key={`${occurrence.startAt}-${index}`}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(occurrence.startAt))}{" "}
                    →{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(occurrence.endAt))}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
