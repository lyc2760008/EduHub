// One-off session creation modal (admin-only) with minimal validation and API integration.
"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
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
  const requiredFieldsMessage = t("admin.sessions.messages.requiredFields");
  const studentRequiredMessage = t("admin.sessions.messages.studentRequired");
  const groupRequiredMessage = t("admin.sessions.messages.groupRequired");
  const invalidTimeMessage = t("admin.sessions.messages.invalidTime");
  const invalidRangeMessage = t("admin.sessions.messages.invalidRange");
  const validationErrorMessage = t("admin.sessions.messages.validationError");
  const createErrorMessage = t("admin.sessions.messages.createError");
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

  const studentError = error === studentRequiredMessage ? error : null;
  const groupError = error === groupRequiredMessage ? error : null;
  const endAtError =
    error === invalidTimeMessage || error === invalidRangeMessage ? error : null;
  const formError =
    error && !studentError && !groupError && !endAtError ? error : null;

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
      setError(requiredFieldsMessage);
      setIsSaving(false);
      return;
    }

    if (form.sessionType === "ONE_ON_ONE" && !form.studentId) {
      setError(studentRequiredMessage);
      setIsSaving(false);
      return;
    }

    if (form.sessionType !== "ONE_ON_ONE" && !form.groupId) {
      setError(groupRequiredMessage);
      setIsSaving(false);
      return;
    }

    const startLocal = DateTime.fromISO(form.startAt, {
      zone: form.timezone,
    });
    const endLocal = DateTime.fromISO(form.endAt, { zone: form.timezone });

    if (!startLocal.isValid || !endLocal.isValid) {
      setError(invalidTimeMessage);
      setIsSaving(false);
      return;
    }

    if (endLocal <= startLocal) {
      setError(invalidRangeMessage);
      setIsSaving(false);
      return;
    }

    const startAtIso = startLocal.toUTC().toISO();
    const endAtIso = endLocal.toUTC().toISO();

    if (!startAtIso || !endAtIso) {
      setError(invalidTimeMessage);
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
      setError(isValidation ? validationErrorMessage : createErrorMessage);
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
        {/* AdminModalShell keeps sessions modals consistent without changing behavior. */}
        <form noValidate onSubmit={handleSubmit}>
          <AdminModalShell
            title={t("admin.sessions.actions.createOneOff")}
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
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving
                      ? t("common.loading")
                      : t("admin.sessions.actions.saveOneOff")}
                  </button>
                </div>
              </>
            }
          >
            {/* AdminFormField keeps label/controls/error spacing consistent. */}
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <AdminFormField
                  label={t("admin.sessions.fields.center")}
                  htmlFor="sessions-one-off-center"
                  required
                >
                  <select
                    className={inputBase}
                    id="sessions-one-off-center"
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
                  htmlFor="sessions-one-off-tutor"
                  required
                >
                  <select
                    className={inputBase}
                    id="sessions-one-off-tutor"
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
                  htmlFor="sessions-one-off-type"
                  required
                >
                  <select
                    className={inputBase}
                    id="sessions-one-off-type"
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
                    <option value="GROUP">
                      {t("admin.sessions.types.group")}
                    </option>
                    <option value="CLASS">
                      {t("admin.sessions.types.class")}
                    </option>
                  </select>
                </AdminFormField>
                {form.sessionType === "ONE_ON_ONE" ? (
                  <AdminFormField
                    label={t("admin.sessions.fields.student")}
                    htmlFor="sessions-one-off-student"
                    required
                    error={studentError}
                  >
                    <select
                      aria-describedby={
                        studentError ? "sessions-one-off-student-error" : undefined
                      }
                      className={inputBase}
                      id="sessions-one-off-student"
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
                    htmlFor="sessions-one-off-group"
                    required
                    error={groupError}
                  >
                    <select
                      aria-describedby={
                        groupError ? "sessions-one-off-group-error" : undefined
                      }
                      className={inputBase}
                      id="sessions-one-off-group"
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
                  label={t("admin.sessions.fields.startAt")}
                  htmlFor="sessions-one-off-start"
                  required
                >
                  <input
                    className={inputBase}
                    id="sessions-one-off-start"
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(event) =>
                      updateField("startAt", event.target.value)
                    }
                  />
                </AdminFormField>
                <AdminFormField
                  label={t("admin.sessions.fields.endAt")}
                  htmlFor="sessions-one-off-end"
                  required
                  error={endAtError}
                >
                  <input
                    aria-describedby={
                      endAtError ? "sessions-one-off-end-error" : undefined
                    }
                    className={inputBase}
                    id="sessions-one-off-end"
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(event) => updateField("endAt", event.target.value)}
                  />
                </AdminFormField>
              </div>
              <AdminFormField
                label={t("admin.sessions.fields.timezone")}
                htmlFor="sessions-one-off-timezone"
              >
                <select
                  className={inputBase}
                  id="sessions-one-off-timezone"
                  value={form.timezone}
                  onChange={(event) =>
                    updateField("timezone", event.target.value)
                  }
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
            </div>
          </AdminModalShell>
          {formError ? (
            <p className="mt-3 text-sm text-red-600">{formError}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
