// Recurring session generator modal with dry-run preview and commit support.
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminModalShell from "@/components/admin/shared/AdminModalShell";
// Shared classes keep focus-visible and hover states consistent in Sessions UI.
import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
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
// Checkbox focus-visible styles keep keyboard navigation clear.
const weekdayCheckboxBase =
  "h-4 w-4 rounded border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

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
  const requiredFieldsMessage = t("admin.sessions.messages.requiredFields");
  const weekdayRequiredMessage = t("admin.sessions.messages.weekdayRequired");
  const studentRequiredMessage = t("admin.sessions.messages.studentRequired");
  const groupRequiredMessage = t("admin.sessions.messages.groupRequired");
  const validationErrorMessage = t("admin.sessions.messages.validationError");
  const generateErrorMessage = t("admin.sessions.messages.generateError");
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

  const weekdayError = error === weekdayRequiredMessage ? error : null;
  const studentError = error === studentRequiredMessage ? error : null;
  const groupError = error === groupRequiredMessage ? error : null;
  const formError =
    error && !weekdayError && !studentError && !groupError ? error : null;

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
      return requiredFieldsMessage;
    }

    if (!form.weekdays.length) {
      return weekdayRequiredMessage;
    }

    if (form.sessionType === "ONE_ON_ONE" && !form.studentId) {
      return studentRequiredMessage;
    }

    if (form.sessionType !== "ONE_ON_ONE" && !form.groupId) {
      return groupRequiredMessage;
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
      setError(isValidation ? validationErrorMessage : generateErrorMessage);
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
      setError(isValidation ? validationErrorMessage : generateErrorMessage);
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
        {/* AdminModalShell keeps recurring session modals aligned with one-off. */}
        <AdminModalShell
          title={t("admin.sessions.actions.generateRecurring")}
          footer={
            <>
              <button
                className={secondaryButton}
                disabled={isSaving}
                onClick={onClose}
                type="button"
              >
                {t("common.actions.cancel")}
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className={primaryButton}
                  data-testid="generator-preview-button"
                  disabled={isSaving}
                  onClick={runPreview}
                  type="button"
                >
                  {t("admin.sessions.actions.preview")}
                </button>
                <button
                  className={secondaryButton}
                  data-testid="generator-confirm-button"
                  disabled={isSaving}
                  onClick={runCommit}
                  type="button"
                >
                  {t("admin.sessions.actions.confirm")}
                </button>
              </div>
            </>
          }
        >
          {/* AdminFormField keeps label/controls/error spacing consistent. */}
          <form className="grid gap-4" noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <AdminFormField
                label={t("admin.sessions.fields.center")}
                htmlFor="sessions-generator-center"
                required
              >
                <select
                  className={inputBase}
                  id="sessions-generator-center"
                  value={form.centerId}
                  onChange={(event) =>
                    applyCenterSelection(event.target.value)
                  }
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
              </AdminFormField>
              <AdminFormField
                label={t("admin.sessions.fields.tutor")}
                htmlFor="sessions-generator-tutor"
                required
              >
                <select
                  className={inputBase}
                  id="sessions-generator-tutor"
                  value={form.tutorId}
                  onChange={(event) =>
                    updateField("tutorId", event.target.value)
                  }
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
              </AdminFormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AdminFormField
                label={t("admin.sessions.fields.type")}
                htmlFor="sessions-generator-type"
                required
              >
                <select
                  className={inputBase}
                  id="sessions-generator-type"
                  value={form.sessionType}
                  onChange={(event) =>
                    handleSessionTypeChange(
                      event.target.value as SessionType,
                    )
                  }
                >
                  <option value="ONE_ON_ONE">
                    {t("admin.sessions.types.oneOnOne")}
                  </option>
                  <option value="GROUP">{t("admin.sessions.types.group")}</option>
                  <option value="CLASS">{t("admin.sessions.types.class")}</option>
                </select>
              </AdminFormField>
              {form.sessionType === "ONE_ON_ONE" ? (
                <AdminFormField
                  label={t("admin.sessions.fields.student")}
                  htmlFor="sessions-generator-student"
                  required
                  error={studentError}
                >
                  <select
                    aria-describedby={
                      studentError ? "sessions-generator-student-error" : undefined
                    }
                    className={inputBase}
                    id="sessions-generator-student"
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
                </AdminFormField>
              ) : (
                <AdminFormField
                  label={t("admin.sessions.fields.group")}
                  htmlFor="sessions-generator-group"
                  required
                  error={groupError}
                >
                  <select
                    aria-describedby={
                      groupError ? "sessions-generator-group-error" : undefined
                    }
                    className={inputBase}
                    id="sessions-generator-group"
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
                </AdminFormField>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AdminFormField
                label={t("admin.sessions.fields.startDate")}
                htmlFor="sessions-generator-start-date"
                required
              >
                <input
                  className={inputBase}
                  id="sessions-generator-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    updateField("startDate", event.target.value)
                  }
                />
              </AdminFormField>
              <AdminFormField
                label={t("admin.sessions.fields.endDate")}
                htmlFor="sessions-generator-end-date"
                required
              >
                <input
                  className={inputBase}
                  id="sessions-generator-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => updateField("endDate", event.target.value)}
                />
              </AdminFormField>
            </div>
            <AdminFormField
              label={t("admin.sessions.fields.weekdays")}
              required
              error={weekdayError}
            >
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_VALUES.map((weekday) => (
                  <label
                    key={weekday}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      checked={form.weekdays.includes(weekday)}
                      className={weekdayCheckboxBase}
                      onChange={() => toggleWeekday(weekday)}
                      type="checkbox"
                    />
                    <span>{t(`admin.sessions.weekdays.${weekday}`)}</span>
                  </label>
                ))}
              </div>
            </AdminFormField>
            <div className="grid gap-4 md:grid-cols-2">
              <AdminFormField
                label={t("admin.sessions.fields.startTime")}
                htmlFor="sessions-generator-start-time"
                required
              >
                <input
                  className={inputBase}
                  id="sessions-generator-start-time"
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    updateField("startTime", event.target.value)
                  }
                />
              </AdminFormField>
              <AdminFormField
                label={t("admin.sessions.fields.endTime")}
                htmlFor="sessions-generator-end-time"
                required
              >
                <input
                  className={inputBase}
                  id="sessions-generator-end-time"
                  type="time"
                  value={form.endTime}
                  onChange={(event) => updateField("endTime", event.target.value)}
                />
              </AdminFormField>
            </div>
            <AdminFormField
              label={t("admin.sessions.fields.timezone")}
              htmlFor="sessions-generator-timezone"
            >
              <select
                className={inputBase}
                id="sessions-generator-timezone"
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
            </AdminFormField>
          </form>
        </AdminModalShell>

        {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}

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
