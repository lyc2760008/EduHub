"use client";

// Parent homework detail client shows latest slot files and supports submission upload/replace before review lock.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import HomeworkStatusBadge from "@/components/homework/HomeworkStatusBadge";
import {
  HOMEWORK_UPLOAD_MAX_BYTES,
  isHomeworkMimeTypeAllowed,
  type HomeworkFileVersion,
  type HomeworkStatus,
  formatHomeworkFileSize,
  getHomeworkSlotTitleKey,
  pickLatestHomeworkFile,
  toHomeworkDisplayStatus,
} from "@/components/homework/homeworkClient";
import { fetchJson } from "@/lib/api/fetchJson";
import { formatPortalDateTimeRange } from "@/lib/portal/format";

type ParentHomeworkDetailClientProps = {
  tenant: string;
  homeworkItemId: string;
};

type HomeworkDetailResponse = {
  homeworkItemId: string;
  status: HomeworkStatus;
  assignedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  session: {
    startAt: string;
    endAt: string;
    timezone: string;
    tutorDisplay: string;
    programLabel: string | null;
  };
  student: {
    displayName: string;
  };
  filesBySlot: {
    ASSIGNMENT: HomeworkFileVersion[];
    SUBMISSION: HomeworkFileVersion[];
    FEEDBACK: HomeworkFileVersion[];
  };
};

function buildPortalApiUrl(tenant: string, path: string) {
  return tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
}

function formatDateTime(value: string | null, locale: string, timezone?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(parsed);
}

export default function ParentHomeworkDetailClient({
  tenant,
  homeworkItemId,
}: ParentHomeworkDetailClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [detail, setDetail] = useState<HomeworkDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    const result = await fetchJson<HomeworkDetailResponse>(
      buildPortalApiUrl(tenant, `/homework/${homeworkItemId}`),
      { cache: "no-store" },
    );

    if (!result.ok) {
      setDetail(null);
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setDetail(result.data);
    setIsLoading(false);
  }, [homeworkItemId, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadDetail]);

  const latestAssignment = useMemo(
    () => pickLatestHomeworkFile(detail?.filesBySlot.ASSIGNMENT ?? []),
    [detail?.filesBySlot.ASSIGNMENT],
  );
  const latestSubmission = useMemo(
    () => pickLatestHomeworkFile(detail?.filesBySlot.SUBMISSION ?? []),
    [detail?.filesBySlot.SUBMISSION],
  );
  const latestFeedback = useMemo(
    () => pickLatestHomeworkFile(detail?.filesBySlot.FEEDBACK ?? []),
    [detail?.filesBySlot.FEEDBACK],
  );

  const hasAssignment = Boolean(latestAssignment);
  const canEditSubmission = detail?.status !== "REVIEWED";
  const canUploadSubmission = Boolean(canEditSubmission && hasAssignment);

  const validateSelectedFile = (file: File) => {
    if (!isHomeworkMimeTypeAllowed(file.type)) {
      return t("homeworkFiles.validation.invalidType");
    }
    if (file.size <= 0 || file.size > HOMEWORK_UPLOAD_MAX_BYTES) {
      return t("homeworkFiles.validation.tooLarge");
    }
    return null;
  };

  const onPickSubmissionFile = (file: File | null) => {
    setInlineMessage(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validationError = validateSelectedFile(file);
    if (validationError) {
      setInlineMessage(validationError);
      return;
    }

    setSelectedFile(file);
  };

  const onUploadSubmission = async () => {
    if (!selectedFile) return;
    if (!hasAssignment) {
      setInlineMessage(t("parentHomework.submission.assignmentRequired"));
      return;
    }

    setInlineMessage(t("homeworkFiles.uploading"));
    setIsUploading(true);

    const formData = new FormData();
    formData.set("slot", "SUBMISSION");
    formData.set("file", selectedFile);

    const response = await fetch(buildPortalApiUrl(tenant, `/homework/${homeworkItemId}/files`), {
      method: "POST",
      body: formData,
    });

    setIsUploading(false);

    if (!response.ok) {
      if (response.status === 409) {
        setInlineMessage(t("parentHomework.submission.assignmentRequired"));
        return;
      }
      setInlineMessage(t("homeworkFiles.toast.uploadError"));
      return;
    }

    setSelectedFile(null);
    setInlineMessage(t("homeworkFiles.toast.uploadSuccess"));
    await loadDetail();
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="parent-homework-detail-loading">
        {Array.from({ length: 4 }).map((_, index) => (
          <PortalSkeletonBlock key={`parent-homework-detail-skeleton-${index}`} className="h-24" />
        ))}
      </div>
    );
  }

  if (!detail || hasError) {
    return (
      <div className="space-y-4" data-testid="parent-homework-detail-error">
        <PageHeader titleKey="parentHomework.detail.title" />
        <Card>
          <div className="space-y-3 text-center">
            <h2 className="text-base font-semibold text-[var(--text)]">{t("parentHomework.error.title")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("parentHomework.error.body")}</p>
            <button
              type="button"
              onClick={() => void loadDetail()}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
            >
              {t("parentHomework.error.retry")}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const displayStatus = toHomeworkDisplayStatus({
    status: detail.status,
    assignmentCount: detail.filesBySlot.ASSIGNMENT.length,
  });

  return (
    <div className="space-y-4" data-testid="parent-homework-detail-page">
      <PageHeader titleKey="parentHomework.detail.title" />

      <Card>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">
              {formatPortalDateTimeRange(
                detail.session.startAt,
                detail.session.endAt,
                locale,
                detail.session.timezone,
              ) || formatDateTime(detail.session.startAt, locale, detail.session.timezone)}
            </p>
            <HomeworkStatusBadge status={displayStatus} />
          </div>
          <p className="text-sm text-[var(--muted)]">
            {t("parentHomework.detail.summary.student")}: {detail.student.displayName}
          </p>
          <p className="text-sm text-[var(--muted)]">
            {t("parentHomework.detail.summary.tutor")}: {detail.session.tutorDisplay || t("generic.dash")}
          </p>
          {detail.session.programLabel ? (
            <p className="text-sm text-[var(--muted)]">
              {t("parentHomework.detail.summary.program")}: {detail.session.programLabel}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="space-y-3" data-testid="parent-homework-assignment-slot">
          <h2 className="text-base font-semibold text-[var(--text)]">{t(getHomeworkSlotTitleKey("ASSIGNMENT"))}</h2>
          {latestAssignment?.downloadUrl ? (
            <div className="space-y-1">
              <p className="text-sm text-[var(--text)]">{latestAssignment.filename}</p>
              <a
                href={latestAssignment.downloadUrl}
                className="inline-flex rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
              >
                {t("parentHomework.inbox.action.downloadAssignment")}
              </a>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">{t("homeworkFiles.notProvided")}</p>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-3" data-testid="parent-homework-submission-slot">
          <h2 className="text-base font-semibold text-[var(--text)]">{t(getHomeworkSlotTitleKey("SUBMISSION"))}</h2>

          {latestSubmission?.downloadUrl ? (
            <div className="space-y-1">
              <p className="text-sm text-[var(--text)]">{latestSubmission.filename}</p>
              <a
                href={latestSubmission.downloadUrl}
                className="inline-flex rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
              >
                {t("homeworkFiles.download")}
              </a>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">{t("homeworkFiles.notProvided")}</p>
          )}

          {canUploadSubmission ? (
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              {/* Use explicit picker label + filename text for a clearer upload affordance. */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="parent-homework-submission-file"
                  type="file"
                  className="sr-only"
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => onPickSubmissionFile(event.target.files?.[0] ?? null)}
                />
                <label
                  htmlFor="parent-homework-submission-file"
                  className="inline-flex rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
                >
                  {t("homeworkFiles.chooseFile")}
                </label>
                <p className="text-xs text-[var(--muted)]">
                  {selectedFile
                    ? t("parentHomework.detail.fileSelected", {
                        filename: selectedFile.name,
                        size: formatHomeworkFileSize(selectedFile.size),
                      })
                    : t("homeworkFiles.noFileSelected")}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"
                  disabled={!selectedFile || isUploading}
                  onClick={() => void onUploadSubmission()}
                >
                  {latestSubmission
                    ? t("homeworkFiles.replace")
                    : t("parentHomework.inbox.action.uploadSubmission")}
                </button>
                {selectedFile ? (
                  <button
                    type="button"
                    className="inline-flex rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
                    disabled={isUploading}
                    onClick={() => onPickSubmissionFile(null)}
                  >
                    {t("parentHomework.detail.clearSelected")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : detail.status === "REVIEWED" ? (
            <p className="text-xs text-[var(--muted)]">{t("parentHomework.submission.lockedAfterReviewed")}</p>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              {t("parentHomework.submission.assignmentRequired")}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-3" data-testid="parent-homework-feedback-slot">
          <h2 className="text-base font-semibold text-[var(--text)]">{t(getHomeworkSlotTitleKey("FEEDBACK"))}</h2>
          {latestFeedback?.downloadUrl ? (
            <div className="space-y-1">
              <p className="text-sm text-[var(--text)]">{latestFeedback.filename}</p>
              <a
                href={latestFeedback.downloadUrl}
                className="inline-flex rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
              >
                {t("homeworkFiles.download")}
              </a>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">{t("homeworkFiles.notAvailable")}</p>
          )}
        </div>
      </Card>

      {inlineMessage ? (
        <Card variant="subtle" padding="normal">
          <p className="text-sm text-[var(--text)]">{inlineMessage}</p>
        </Card>
      ) : null}
    </div>
  );
}
