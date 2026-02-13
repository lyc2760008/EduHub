// Recurring session generator modal with dry-run preview and commit support.
"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminModalShell from "@/components/admin/shared/AdminModalShell";
// Shared classes keep focus-visible and hover states consistent in Sessions UI.
import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
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
  tenant: string;
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
  zoomLink: string;
};

type PreviewReasonCode =
  | "DUPLICATE_SESSION_EXISTS"
  | "TUTOR_START_COLLISION"
  | "STUDENT_START_COLLISION";

type GeneratorPreviewResponse = {
  range: { from: string; to: string };
  wouldCreateCount: number;
  wouldSkipDuplicateCount: number;
  wouldConflictCount: number;
  duplicatesSummary: {
    count: number;
    sample: Array<{ date: string; reason: PreviewReasonCode }>;
  };
  conflictsSummary: {
    count: number;
    sample: Array<{ date: string; reason: PreviewReasonCode }>;
  };
  zoomLinkApplied: boolean;
};

type GeneratorCommitResponse = {
  createdCount: number;
  skippedDuplicateCount: number;
  conflictCount: number;
  range: { from: string; to: string };
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
  zoomLink: "",
};

const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 7] as const;
// Checkbox focus-visible styles keep keyboard navigation clear.
const weekdayCheckboxBase =
  "h-4 w-4 rounded border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const TIME_24H_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIME_12H_REGEX = /^(1[0-2]|0?[1-9]):([0-5]\d)\s*([AaPp][Mm])$/;

function formatStudentName(student: StudentOption) {
  return student.preferredName?.trim().length
    ? `${student.preferredName} ${student.lastName}`
    : `${student.firstName} ${student.lastName}`;
}

function normalizeTimeInput(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (TIME_24H_REGEX.test(value)) return value;

  const match = value.match(TIME_12H_REGEX);
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3].toUpperCase();
  const normalizedHour =
    meridiem === "PM" ? (hour % 12) + 12 : hour % 12;
  return `${String(normalizedHour).padStart(2, "0")}:${minute}`;
}

function readNonEmptyInputValue(input: HTMLInputElement | null, fallback: string) {
  // Safari can transiently expose empty control values during picker interactions.
  const value = input?.value?.trim() ?? "";
  return value || fallback;
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
  tenant,
}: SessionGeneratorModalProps) {
  const t = useTranslations();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";
  const requiredFieldsMessage = t("admin.sessions.messages.requiredFields");
  const weekdayRequiredMessage = t("admin.sessions.messages.weekdayRequired");
  const studentRequiredMessage = t("admin.sessions.messages.studentRequired");
  const groupRequiredMessage = t("admin.sessions.messages.groupRequired");
  const invalidZoomLinkMessage = t("session.zoomLink.invalid");
  const validationErrorMessage = t("admin.sessions.messages.validationError");
  const generateErrorMessage = t("admin.sessions.messages.generateError");
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    timezone: defaultTimezone,
  }));
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isCommitLoading, setIsCommitLoading] = useState(false);
  const [preview, setPreview] = useState<GeneratorPreviewResponse | null>(null);
  const [previewPayloadSignature, setPreviewPayloadSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const startTimeInputRef = useRef<HTMLInputElement>(null);
  const endTimeInputRef = useRef<HTMLInputElement>(null);

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
    // Invalidate stale preview whenever generation inputs change.
    setPreview(null);
    setPreviewPayloadSignature(null);
  }

  function handleSessionTypeChange(value: SessionType) {
    setForm((prev) => ({
      ...prev,
      sessionType: value,
      studentId: value === "ONE_ON_ONE" ? prev.studentId : "",
      groupId: value === "ONE_ON_ONE" ? "" : prev.groupId,
    }));
    setPreview(null);
    setPreviewPayloadSignature(null);
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
    setPreview(null);
    setPreviewPayloadSignature(null);
  }

  function applyCenterSelection(centerId: string) {
    const centerTimezone =
      centers.find((center) => center.id === centerId)?.timezone ?? "";
    setForm((prev) => ({
      ...prev,
      centerId,
      timezone: centerTimezone || prev.timezone || defaultTimezone,
    }));
    setPreview(null);
    setPreviewPayloadSignature(null);
  }

  function isValidZoomLinkInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return true;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function getNormalizedFormSnapshot(): FormState {
    // Safari/Chrome on macOS can keep native date/time control values ahead of React state.
    const startDate = readNonEmptyInputValue(startDateInputRef.current, form.startDate);
    const endDate = readNonEmptyInputValue(endDateInputRef.current, form.endDate);
    const startTime = normalizeTimeInput(
      readNonEmptyInputValue(startTimeInputRef.current, form.startTime),
    );
    const endTime = normalizeTimeInput(
      readNonEmptyInputValue(endTimeInputRef.current, form.endTime),
    );

    return {
      ...form,
      startDate,
      endDate,
      startTime,
      endTime,
      zoomLink: form.zoomLink.trim(),
    };
  }

  function validateForm(snapshot: FormState) {
    if (
      !snapshot.centerId ||
      !snapshot.tutorId ||
      !snapshot.startDate ||
      !snapshot.endDate ||
      !snapshot.startTime ||
      !snapshot.endTime
    ) {
      return requiredFieldsMessage;
    }

    if (!snapshot.weekdays.length) {
      return weekdayRequiredMessage;
    }

    if (snapshot.sessionType === "ONE_ON_ONE" && !snapshot.studentId) {
      return studentRequiredMessage;
    }

    if (snapshot.sessionType !== "ONE_ON_ONE" && !snapshot.groupId) {
      return groupRequiredMessage;
    }

    if (!isValidZoomLinkInput(snapshot.zoomLink)) {
      return invalidZoomLinkMessage;
    }

    return null;
  }

  function buildPayload(snapshot: FormState) {
    return {
      centerId: snapshot.centerId,
      tutorId: snapshot.tutorId,
      sessionType: snapshot.sessionType,
      studentId:
        snapshot.sessionType === "ONE_ON_ONE" ? snapshot.studentId : undefined,
      groupId: snapshot.sessionType === "ONE_ON_ONE" ? undefined : snapshot.groupId,
      startDate: snapshot.startDate,
      endDate: snapshot.endDate,
      weekdays: snapshot.weekdays,
      startTime: snapshot.startTime,
      endTime: snapshot.endTime,
      timezone: snapshot.timezone || defaultTimezone,
      zoomLink: snapshot.zoomLink || null,
    };
  }

  function buildPayloadSignature(snapshot: FormState) {
    return JSON.stringify(buildPayload(snapshot));
  }

  function previewReasonLabelKey(reason: PreviewReasonCode) {
    if (reason === "DUPLICATE_SESSION_EXISTS") {
      return "admin.sessions.generate.preview.reason.duplicate";
    }
    if (reason === "STUDENT_START_COLLISION") {
      return "admin.sessions.generate.preview.reason.studentConflict";
    }
    return "admin.sessions.generate.preview.reason.tutorConflict";
  }

  const isActionBusy = isPreviewLoading || isCommitLoading;
  const canCommit =
    Boolean(preview) && previewPayloadSignature === buildPayloadSignature(form);

  async function runPreview() {
    setIsPreviewLoading(true);
    setError(null);
    setPreview(null);

    const snapshot = getNormalizedFormSnapshot();
    setForm(snapshot);
    const validationError = validateForm(snapshot);
    if (validationError) {
      setError(validationError);
      setIsPreviewLoading(false);
      return;
    }

    const payload = buildPayload(snapshot);
    const signature = JSON.stringify(payload);
    const result = await fetchJson<GeneratorPreviewResponse>(
      buildTenantApiUrl(tenant, "/sessions/generate/preview"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!result.ok) {
      const isValidation = result.status === 400;
      setError(isValidation ? validationErrorMessage : generateErrorMessage);
      setIsPreviewLoading(false);
      return;
    }

    setPreview(result.data);
    setPreviewPayloadSignature(signature);
    setIsPreviewLoading(false);
  }

  async function runCommit() {
    if (!canCommit) return;
    setIsCommitLoading(true);
    setError(null);

    const snapshot = getNormalizedFormSnapshot();
    setForm(snapshot);
    const validationError = validateForm(snapshot);
    if (validationError) {
      setError(validationError);
      setIsCommitLoading(false);
      return;
    }

    const result = await fetchJson<GeneratorCommitResponse>(
      buildTenantApiUrl(tenant, "/sessions/generate"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(snapshot)),
      },
    );

    if (!result.ok) {
      const isValidation = result.status === 400;
      setError(isValidation ? validationErrorMessage : generateErrorMessage);
      setIsCommitLoading(false);
      return;
    }

    await onCommitted(t("admin.sessions.messages.generateSuccess"));
    setIsCommitLoading(false);
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
                disabled={isActionBusy}
                onClick={onClose}
                type="button"
              >
                {t("common.actions.cancel")}
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className={primaryButton}
                  data-testid="generator-preview-button"
                  disabled={isActionBusy}
                  onClick={runPreview}
                  type="button"
                >
                  {isPreviewLoading
                    ? t("admin.sessions.generate.previewLoading")
                    : t("admin.sessions.generate.preview.label")}
                </button>
                <button
                  className={secondaryButton}
                  data-testid="generator-confirm-button"
                  disabled={isActionBusy || !canCommit}
                  onClick={runCommit}
                  type="button"
                >
                  {isCommitLoading
                    ? t("admin.sessions.generate.commitLoading")
                    : t("admin.sessions.generate.commit")}
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
                  ref={startDateInputRef}
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    updateField("startDate", event.target.value)
                  }
                  onInput={(event) =>
                    updateField(
                      "startDate",
                      (event.currentTarget as HTMLInputElement).value,
                    )
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
                  ref={endDateInputRef}
                  type="date"
                  value={form.endDate}
                  onChange={(event) => updateField("endDate", event.target.value)}
                  onInput={(event) =>
                    updateField(
                      "endDate",
                      (event.currentTarget as HTMLInputElement).value,
                    )
                  }
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
                  ref={startTimeInputRef}
                  value={form.startTime}
                  onChange={(event) =>
                    updateField("startTime", event.target.value)
                  }
                  onInput={(event) =>
                    updateField(
                      "startTime",
                      normalizeTimeInput(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    )
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
                  ref={endTimeInputRef}
                  value={form.endTime}
                  onChange={(event) => updateField("endTime", event.target.value)}
                  onInput={(event) =>
                    updateField(
                      "endTime",
                      normalizeTimeInput(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    )
                  }
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
            <AdminFormField
              label={t("admin.sessions.generate.zoomLink.label")}
              htmlFor="sessions-generator-zoom-link"
            >
              <div className="grid gap-2">
                <input
                  className={inputBase}
                  id="sessions-generator-zoom-link"
                  placeholder="https://"
                  type="url"
                  value={form.zoomLink}
                  onChange={(event) => updateField("zoomLink", event.target.value)}
                />
                <p className="text-xs text-slate-500">
                  {t("admin.sessions.generate.zoomLink.helper")}
                </p>
              </div>
            </AdminFormField>
          </form>
        </AdminModalShell>

        {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}

        {preview ? (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {t("admin.sessions.generate.preview.summary")}
            </h3>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <div className="flex items-center justify-between gap-2">
                <span>{t("admin.sessions.generate.preview.createdCount")}</span>
                <span className="font-semibold text-slate-900">
                  {preview.wouldCreateCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>{t("admin.sessions.generate.preview.duplicateCount")}</span>
                <span className="font-semibold text-slate-900">
                  {preview.wouldSkipDuplicateCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>{t("admin.sessions.generate.preview.conflictCount")}</span>
                <span className="font-semibold text-slate-900">
                  {preview.wouldConflictCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>{t("admin.sessions.generate.preview.zoomLinkSet")}</span>
                <span className="font-semibold text-slate-900">
                  {preview.zoomLinkApplied
                    ? t("admin.sessions.generate.preview.zoomLinkYes")
                    : t("admin.sessions.generate.preview.zoomLinkNo")}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-1 text-xs text-slate-600">
              <span>
                {t("admin.sessions.generate.preview.rangeFrom")}:{" "}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(preview.range.from))}
              </span>
              <span>
                {t("admin.sessions.generate.preview.rangeTo")}:{" "}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(preview.range.to))}
              </span>
            </div>

            {preview.duplicatesSummary.sample.length > 0 ? (
              <ul className="mt-3 grid gap-1 text-xs text-slate-600">
                {preview.duplicatesSummary.sample.map((sample, index) => (
                  <li key={`duplicate-${sample.date}-${index}`}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(sample.date))}{" "}
                    - {t(previewReasonLabelKey(sample.reason))}
                  </li>
                ))}
              </ul>
            ) : null}

            {preview.conflictsSummary.sample.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-xs text-slate-600">
                {preview.conflictsSummary.sample.map((sample, index) => (
                  <li key={`conflict-${sample.date}-${index}`}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(sample.date))}{" "}
                    - {t(previewReasonLabelKey(sample.reason))}
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
