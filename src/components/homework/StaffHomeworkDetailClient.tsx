"use client";

// Staff homework detail client powers admin+tutor review flows, including slot uploads, version history, and mark-reviewed action.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { primaryButton, secondaryButton } from "@/components/admin/shared/adminUiClasses";
import HomeworkStatusBadge from "@/components/homework/HomeworkStatusBadge";
import {
  HOMEWORK_UPLOAD_MAX_BYTES,
  isHomeworkMimeTypeAllowed,
  type HomeworkFileSlot,
  type HomeworkFileVersion,
  type HomeworkStatus,
  formatHomeworkFileSize,
  getHomeworkSlotTitleKey,
  pickLatestHomeworkFile,
  toHomeworkDisplayStatus,
} from "@/components/homework/homeworkClient";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

type StaffHomeworkMode = "admin" | "tutor";

type StaffHomeworkDetailClientProps = {
  tenant: string;
  mode: StaffHomeworkMode;
  homeworkItemId: string;
};

type HomeworkDetailResponse = {
  homeworkItemId: string;
  sessionId: string;
  studentId: string;
  status: HomeworkStatus;
  assignedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  session: {
    id: string;
    startAt: string;
    endAt: string;
    timezone: string;
    centerId: string | null;
    centerName: string | null;
    tutorId: string;
    tutorDisplay: string;
    groupId: string | null;
    groupName: string | null;
    programId: string | null;
    programLabel: string | null;
  };
  student: {
    id: string;
    displayName: string;
  };
  files: HomeworkFileVersion[];
  filesBySlot: Record<HomeworkFileSlot, HomeworkFileVersion[]>;
};

type UploadResponse = {
  itemId: string;
  file: {
    id: string;
    slot: HomeworkFileSlot;
    version: number;
    sizeBytes: number;
    mimeType: string;
    uploadedAt: string;
  };
};

type MarkReviewedResponse = {
  ok: boolean;
  reviewedCount: number;
  skippedNotSubmittedCount: number;
};

function formatDateTime(value: string | null, locale: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getUploaderRoleLabelKey(role: string) {
  if (role === "ADMIN") return "staffHomework.detail.uploaderRole.admin";
  if (role === "TUTOR") return "staffHomework.detail.uploaderRole.tutor";
  if (role === "PARENT") return "staffHomework.detail.uploaderRole.parent";
  return "staffHomework.detail.uploaderRole.system";
}

function getDetailEndpoint(mode: StaffHomeworkMode, tenant: string, homeworkItemId: string) {
  if (mode === "admin") {
    return buildTenantApiUrl(tenant, `/admin/homework/${homeworkItemId}`);
  }
  return `/${tenant}/api/tutor/homework/${homeworkItemId}`;
}

function getUploadEndpoint(mode: StaffHomeworkMode, tenant: string, homeworkItemId: string) {
  if (mode === "admin") {
    return buildTenantApiUrl(tenant, `/admin/homework/${homeworkItemId}/files`);
  }
  return `/${tenant}/api/tutor/homework/${homeworkItemId}/files`;
}

function getBulkEndpoint(mode: StaffHomeworkMode, tenant: string) {
  if (mode === "admin") {
    return buildTenantApiUrl(tenant, "/admin/homework/bulk/mark-reviewed");
  }
  return `/${tenant}/api/tutor/homework/bulk/mark-reviewed`;
}

export default function StaffHomeworkDetailClient({
  tenant,
  mode,
  homeworkItemId,
}: StaffHomeworkDetailClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [detail, setDetail] = useState<HomeworkDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<HomeworkFileSlot | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<HomeworkFileSlot, File>>>({});

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await fetchJson<HomeworkDetailResponse>(
      getDetailEndpoint(mode, tenant, homeworkItemId),
      { cache: "no-store" },
    );

    if (!result.ok) {
      setError(t("staffHomework.detail.error.body"));
      setDetail(null);
      setIsLoading(false);
      return;
    }

    setDetail(result.data);
    setIsLoading(false);
  }, [homeworkItemId, mode, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadDetail]);

  const canUploadAssignment = mode === "admin";
  // v1 default policy: tutors upload feedback only unless PO explicitly approves assignment uploads.
  const canUploadFeedback = mode === "admin" || mode === "tutor";

  const validateFile = (file: File) => {
    if (!isHomeworkMimeTypeAllowed(file.type)) {
      return t("homeworkFiles.validation.invalidType");
    }
    if (file.size <= 0 || file.size > HOMEWORK_UPLOAD_MAX_BYTES) {
      return t("homeworkFiles.validation.tooLarge");
    }
    return null;
  };

  const onChooseFile = (slot: HomeworkFileSlot, file: File | null) => {
    setBannerMessage(null);

    if (!file) {
      setSelectedFiles((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setBannerMessage(validationError);
      return;
    }

    setSelectedFiles((current) => ({
      ...current,
      [slot]: file,
    }));
  };

  const onUploadSlotFile = async (slot: HomeworkFileSlot) => {
    const file = selectedFiles[slot];
    if (!file || !detail) return;

    setUploadingSlot(slot);
    setBannerMessage(t("homeworkFiles.uploading"));

    const formData = new FormData();
    formData.set("slot", slot);
    formData.set("file", file);

    const response = await fetch(getUploadEndpoint(mode, tenant, homeworkItemId), {
      method: "POST",
      body: formData,
    });

    let payload: UploadResponse | null = null;
    try {
      payload = (await response.json()) as UploadResponse;
    } catch {
      payload = null;
    }

    setUploadingSlot(null);

    if (!response.ok || !payload?.file?.id) {
      setBannerMessage(t("homeworkFiles.toast.uploadError"));
      return;
    }

    setSelectedFiles((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
    setBannerMessage(t("homeworkFiles.toast.uploadSuccess"));
    await loadDetail();
  };

  const onMarkReviewed = async () => {
    if (!detail) return;

    setBannerMessage(null);
    const response = await fetch(getBulkEndpoint(mode, tenant), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeworkItemIds: [detail.homeworkItemId] }),
    });

    let payload: MarkReviewedResponse | null = null;
    try {
      payload = (await response.json()) as MarkReviewedResponse;
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.ok) {
      setBannerMessage(t("staffHomework.bulk.toast.error"));
      return;
    }

    if ((payload.skippedNotSubmittedCount ?? 0) > 0) {
      setBannerMessage(
        t("staffHomework.bulk.toast.partial", {
          successCount: payload.reviewedCount,
          skippedCount: payload.skippedNotSubmittedCount,
        }),
      );
    } else {
      setBannerMessage(
        t("staffHomework.bulk.toast.success", {
          count: payload.reviewedCount,
        }),
      );
    }

    await loadDetail();
  };

  const slots = useMemo(
    () =>
      [
        {
          slot: "ASSIGNMENT" as HomeworkFileSlot,
          canUpload: canUploadAssignment,
          showUpload: canUploadAssignment,
        },
        {
          slot: "SUBMISSION" as HomeworkFileSlot,
          canUpload: false,
          showUpload: false,
        },
        {
          slot: "FEEDBACK" as HomeworkFileSlot,
          canUpload: canUploadFeedback,
          showUpload: canUploadFeedback,
        },
      ] as const,
    [canUploadAssignment, canUploadFeedback],
  );
  if (isLoading) {
    return (
      <div className="space-y-3" data-testid={`staff-homework-detail-loading-${mode}`}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`staff-homework-detail-skeleton-${index}`}
            className="h-20 animate-pulse rounded border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  if (!detail || error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3" data-testid={`staff-homework-detail-error-${mode}`}>
        <p className="text-sm font-semibold text-red-700">{t("staffHomework.detail.error.title")}</p>
        <p className="mt-1 text-sm text-red-700">{error ?? t("staffHomework.detail.error.body")}</p>
        <button
          type="button"
          className={`${secondaryButton} mt-3`}
          onClick={() => void loadDetail()}
        >
          {t("staffHomework.detail.error.retry")}
        </button>
      </div>
    );
  }

  const displayStatus = toHomeworkDisplayStatus({
    status: detail.status,
    assignmentCount: detail.filesBySlot.ASSIGNMENT.length,
  });

  return (
    <div className="flex flex-col gap-4" data-testid={`staff-homework-detail-${mode}`}>
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">{t("staffHomework.detail.title")}</h2>
            <p className="text-sm text-slate-600">
              {t("staffHomework.detail.summary.student")}: {detail.student.displayName}
            </p>
            <p className="text-sm text-slate-600">
              {t("staffHomework.detail.summary.sessionTime")}: {formatDateTime(detail.session.startAt, locale) ?? t("generic.dash")}
            </p>
            <p className="text-sm text-slate-600">
              {t("staffHomework.detail.summary.tutor")}: {detail.session.tutorDisplay || t("generic.dash")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HomeworkStatusBadge status={displayStatus} />
            {detail.status === "SUBMITTED" ? (
              <button
                type="button"
                className={primaryButton}
                onClick={() => void onMarkReviewed()}
              >
                {t("staffHomework.detail.markReviewed")}
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {t("staffHomework.detail.parentLockNote")}
        </p>
      </section>

      {bannerMessage ? (
        <section className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {bannerMessage}
        </section>
      ) : null}

      {slots.map(({ slot, canUpload, showUpload }) => {
        const filesForSlot = detail.filesBySlot[slot] ?? [];
        const latest = pickLatestHomeworkFile(filesForSlot);
        const selectedFile = selectedFiles[slot] ?? null;

        return (
          <section key={slot} className="rounded border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                {t(getHomeworkSlotTitleKey(slot))}
              </h3>
              {latest?.downloadUrl ? (
                <a
                  href={latest.downloadUrl}
                  className={secondaryButton}
                >
                  {t("homeworkFiles.download")}
                </a>
              ) : null}
            </div>

            {latest ? (
              <div className="mt-2 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{latest.filename}</p>
                <p>
                  {t("staffHomework.detail.fileMeta", {
                    version: latest.version,
                    size: formatHomeworkFileSize(latest.sizeBytes),
                    uploadedAt: formatDateTime(latest.uploadedAt, locale) ?? latest.uploadedAt,
                  })}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                {slot === "ASSIGNMENT"
                  ? t("homeworkFiles.notProvided")
                  : slot === "FEEDBACK"
                    ? t("homeworkFiles.notAvailable")
                    : t("homeworkFiles.notProvided")}
              </p>
            )}

            {showUpload ? (
              <div className="mt-3 space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
                {/* Custom file picker avoids browser-native "Choose File/No file chosen" copy. */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id={`staff-homework-file-${mode}-${slot}`}
                    type="file"
                    className="sr-only"
                    accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => onChooseFile(slot, event.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor={`staff-homework-file-${mode}-${slot}`}
                    className={secondaryButton}
                  >
                    {t("homeworkFiles.chooseFile")}
                  </label>
                  <p className="text-xs text-slate-600">
                    {selectedFile
                      ? t("staffHomework.detail.fileSelected", {
                          filename: selectedFile.name,
                          size: formatHomeworkFileSize(selectedFile.size),
                        })
                      : t("homeworkFiles.noFileSelected")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={!selectedFile || uploadingSlot === slot || !canUpload}
                    onClick={() => void onUploadSlotFile(slot)}
                  >
                    {selectedFile ? t("homeworkFiles.replace") : t("homeworkFiles.upload")}
                  </button>
                  {selectedFile ? (
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={uploadingSlot === slot}
                      onClick={() => onChooseFile(slot, null)}
                    >
                      {t("staffHomework.detail.clearSelected")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                {t("staffHomework.detail.versionHistory")}
              </summary>
              <div className="mt-3 space-y-2">
                {filesForSlot.length ? (
                  filesForSlot.map((file) => (
                    <div key={file.id} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm">
                      <p className="font-medium text-slate-900">{file.filename}</p>
                      <p className="text-xs text-slate-600">
                        {t("staffHomework.detail.historyMeta", {
                          version: file.version,
                          uploadedByRole: t(
                            getUploaderRoleLabelKey(file.uploadedByRole ?? "SYSTEM"),
                          ),
                          uploadedAt: formatDateTime(file.uploadedAt, locale) ?? file.uploadedAt,
                        })}
                      </p>
                      {file.downloadUrl ? (
                        <a href={file.downloadUrl} className="mt-1 inline-block text-xs font-semibold text-slate-700 underline">
                          {t("homeworkFiles.download")}
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">{t("staffHomework.detail.noVersions")}</p>
                )}
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
