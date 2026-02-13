// Admin announcement editor handles draft save, publish, and archive actions using tenant-safe admin endpoints.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
} from "@/lib/announcements/constants";

type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type AnnouncementDetail = {
  id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  scope: "TENANT_WIDE";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  authorName: string | null;
  totalReads: number;
};

type AnnouncementDetailResponse = {
  item: AnnouncementDetail;
};

type ConfirmAction = "publish" | "archive" | null;

type AdminAnnouncementEditorClientProps = {
  tenant: string;
  announcementId?: string;
};

function getStatusLabelKey(status: AnnouncementStatus) {
  if (status === "PUBLISHED") return "adminAnnouncements.status.published";
  if (status === "ARCHIVED") return "adminAnnouncements.status.archived";
  return "adminAnnouncements.status.draft";
}

export default function AdminAnnouncementEditorClient({
  tenant,
  announcementId,
}: AdminAnnouncementEditorClientProps) {
  const t = useTranslations();
  const router = useRouter();

  const [item, setItem] = useState<AnnouncementDetail | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(announcementId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentStatus = item?.status ?? "DRAFT";
  const resolvedAnnouncementId = item?.id ?? announcementId ?? null;
  const titleTrimmed = title.trim();
  const bodyTrimmed = body.trim();

  const titleError = useMemo(() => {
    if (!titleTrimmed.length) return t("adminAnnouncements.form.title.required");
    if (titleTrimmed.length > ANNOUNCEMENT_TITLE_MAX) {
      return t("adminAnnouncements.form.title.maxError", {
        max: ANNOUNCEMENT_TITLE_MAX,
      });
    }
    return null;
  }, [t, titleTrimmed]);

  const bodyError = useMemo(() => {
    if (!bodyTrimmed.length) return t("adminAnnouncements.form.body.required");
    if (bodyTrimmed.length > ANNOUNCEMENT_BODY_MAX) {
      return t("adminAnnouncements.form.body.maxError", {
        max: ANNOUNCEMENT_BODY_MAX,
      });
    }
    return null;
  }, [bodyTrimmed, t]);

  const canSubmitContent = !titleError && !bodyError;
  const isDraft = currentStatus === "DRAFT";
  const canArchive = currentStatus === "PUBLISHED" || currentStatus === "DRAFT";
  const isBusy = isSaving || isPublishing || isArchiving;

  const loadItem = useCallback(async () => {
    if (!announcementId) return;
    setIsLoading(true);
    setLoadError(null);

    const result = await fetchJson<AnnouncementDetailResponse>(
      buildTenantApiUrl(tenant, `/admin/announcements/${announcementId}`),
      { cache: "no-store" },
    );

    if (!result.ok) {
      setLoadError(t("adminAnnouncements.error.body"));
      setIsLoading(false);
      return;
    }

    setItem(result.data.item);
    setTitle(result.data.item.title);
    setBody(result.data.item.body);
    setIsLoading(false);
  }, [announcementId, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadItem();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadItem]);

  const saveDraft = useCallback(async () => {
    if (!canSubmitContent) return null;
    setIsSaving(true);
    setToastMessage(null);

    const payload = {
      title: titleTrimmed,
      body: bodyTrimmed,
      scope: "TENANT_WIDE" as const,
    };

    const result = resolvedAnnouncementId
      ? await fetchJson<AnnouncementDetailResponse>(
          buildTenantApiUrl(tenant, `/admin/announcements/${resolvedAnnouncementId}`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
      : await fetchJson<AnnouncementDetailResponse>(
          buildTenantApiUrl(tenant, "/admin/announcements"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

    setIsSaving(false);

    if (!result.ok) {
      setToastMessage(t("adminAnnouncements.toast.error"));
      return null;
    }

    setItem(result.data.item);
    setTitle(result.data.item.title);
    setBody(result.data.item.body);
    setToastMessage(t("adminAnnouncements.toast.saved"));
    if (!resolvedAnnouncementId) {
      router.replace(`/${tenant}/admin/announcements/${result.data.item.id}`);
    }
    return result.data.item;
  }, [
    bodyTrimmed,
    canSubmitContent,
    resolvedAnnouncementId,
    router,
    t,
    tenant,
    titleTrimmed,
  ]);

  const publish = useCallback(async () => {
    if (!canSubmitContent) return;
    setIsPublishing(true);
    setToastMessage(null);

    const ensured = resolvedAnnouncementId ? item : await saveDraft();
    const publishId = ensured?.id ?? resolvedAnnouncementId;
    if (!publishId) {
      setIsPublishing(false);
      setToastMessage(t("adminAnnouncements.toast.error"));
      return;
    }

    const result = await fetchJson<AnnouncementDetailResponse>(
      buildTenantApiUrl(tenant, `/admin/announcements/${publishId}/publish`),
      { method: "POST" },
    );

    setIsPublishing(false);
    setConfirmAction(null);

    if (!result.ok) {
      setToastMessage(t("adminAnnouncements.toast.error"));
      return;
    }

    setItem(result.data.item);
    setToastMessage(t("adminAnnouncements.toast.published"));
  }, [canSubmitContent, item, resolvedAnnouncementId, saveDraft, t, tenant]);

  const archive = useCallback(async () => {
    if (!resolvedAnnouncementId) return;
    setIsArchiving(true);
    setToastMessage(null);

    const result = await fetchJson<AnnouncementDetailResponse>(
      buildTenantApiUrl(tenant, `/admin/announcements/${resolvedAnnouncementId}/archive`),
      { method: "POST" },
    );

    setIsArchiving(false);
    setConfirmAction(null);

    if (!result.ok) {
      setToastMessage(t("adminAnnouncements.toast.error"));
      return;
    }

    setItem(result.data.item);
    setToastMessage(t("adminAnnouncements.toast.archived"));
  }, [resolvedAnnouncementId, t, tenant]);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="admin-announcement-editor-loading">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
        <div className="h-24 animate-pulse rounded bg-slate-100" />
        <div className="h-40 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (loadError) {
    return (
      <section
        className="rounded border border-red-200 bg-red-50 px-4 py-3"
        data-testid="admin-announcement-editor-error"
      >
        <p className="text-sm font-semibold text-red-700">
          {t("adminAnnouncements.error.title")}
        </p>
        <p className="mt-1 text-sm text-red-700">{loadError}</p>
        <button
          type="button"
          className={`${secondaryButton} mt-3`}
          onClick={() => void loadItem()}
        >
          {t("admin.table.state.error.retry")}
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5" data-testid="admin-announcement-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/${tenant}/admin/announcements`}
          className={`${secondaryButton} px-3 py-2 text-sm`}
        >
          {t("adminAnnouncements.backToList")}
        </Link>
        <span
          className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700"
        >
          {t(getStatusLabelKey(currentStatus))}
        </span>
      </div>

      <section className="rounded border border-slate-200 bg-white p-4 md:p-5">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-800">
              {t("adminAnnouncements.form.title.label")}
            </span>
            <input
              className={inputBase}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={ANNOUNCEMENT_TITLE_MAX + 20}
              disabled={isBusy || !isDraft}
              data-testid="admin-announcement-title"
            />
            <p className="text-xs text-slate-500">
              {t("adminAnnouncements.form.title.helper", {
                max: ANNOUNCEMENT_TITLE_MAX,
              })}
            </p>
            {titleError ? <p className="text-xs text-red-600">{titleError}</p> : null}
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-800">
              {t("adminAnnouncements.form.body.label")}
            </span>
            <textarea
              className={`${inputBase} min-h-[220px] py-2`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={ANNOUNCEMENT_BODY_MAX + 200}
              disabled={isBusy || !isDraft}
              data-testid="admin-announcement-body"
            />
            <p className="text-xs text-slate-500">
              {t("adminAnnouncements.form.body.helper", {
                max: ANNOUNCEMENT_BODY_MAX,
              })}
            </p>
            {bodyError ? <p className="text-xs text-red-600">{bodyError}</p> : null}
          </label>

          <div className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-800">
              {t("adminAnnouncements.form.scope.label")}
            </span>
            {/* UI contract: scope is tenant-wide only in v1 and intentionally non-editable. */}
            <input
              className={`${inputBase} bg-slate-100 text-slate-600`}
              value={t("adminAnnouncements.scope.tenantWide")}
              disabled
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryButton}
          onClick={() => void saveDraft()}
          disabled={isBusy || !isDraft || !canSubmitContent}
          data-testid="admin-announcement-save"
        >
          {isSaving
            ? t("adminAnnouncements.action.saving")
            : t("adminAnnouncements.action.saveDraft")}
        </button>

        {isDraft ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setConfirmAction("publish")}
            disabled={isBusy || !canSubmitContent}
            data-testid="admin-announcement-publish"
          >
            {isPublishing
              ? t("adminAnnouncements.action.publishing")
              : t("adminAnnouncements.action.publish")}
          </button>
        ) : null}

        {canArchive ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setConfirmAction("archive")}
            disabled={isBusy || !resolvedAnnouncementId}
            data-testid="admin-announcement-archive"
          >
            {t("adminAnnouncements.action.archive")}
          </button>
        ) : null}
      </div>

      {toastMessage ? (
        <section className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {toastMessage}
        </section>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {confirmAction === "publish"
                ? t("adminAnnouncements.confirm.publish.title")
                : t("adminAnnouncements.confirm.archive.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {confirmAction === "publish"
                ? t("adminAnnouncements.confirm.publish.body")
                : t("adminAnnouncements.confirm.archive.body")}
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setConfirmAction(null)}
                disabled={isBusy}
              >
                {t("adminAnnouncements.confirm.ctaCancel")}
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() =>
                  void (confirmAction === "publish" ? publish() : archive())
                }
                disabled={isBusy}
              >
                {t("adminAnnouncements.confirm.ctaConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
