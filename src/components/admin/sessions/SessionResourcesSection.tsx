"use client";

// Session resources section provides admin CRUD controls for URL-only homework/material links.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

type SessionResourceType = "HOMEWORK" | "WORKSHEET" | "VIDEO" | "OTHER";

type SessionResourceItem = {
  id: string;
  title: string;
  url: string;
  type: SessionResourceType;
  updatedAt: string;
};

type SessionResourcesResponse = {
  items: SessionResourceItem[];
};

type SessionResourceMutateResponse = {
  item: SessionResourceItem;
};

type SessionResourcesSectionProps = {
  tenant: string;
  sessionId: string;
  canManage: boolean;
};

type ResourceFormState = {
  title: string;
  url: string;
  type: SessionResourceType;
};

type ResourceFormErrors = Partial<Record<keyof ResourceFormState, string>>;

const RESOURCE_TYPE_OPTIONS: SessionResourceType[] = [
  "HOMEWORK",
  "WORKSHEET",
  "VIDEO",
  "OTHER",
];

function getTypeLabelKey(type: SessionResourceType) {
  switch (type) {
    case "HOMEWORK":
      return "sessionResources.type.homework";
    case "WORKSHEET":
      return "sessionResources.type.worksheet";
    case "VIDEO":
      return "sessionResources.type.video";
    default:
      return "sessionResources.type.other";
  }
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const EMPTY_FORM: ResourceFormState = {
  title: "",
  url: "",
  type: "HOMEWORK",
};

export default function SessionResourcesSection({
  tenant,
  sessionId,
  canManage,
}: SessionResourcesSectionProps) {
  const t = useTranslations();
  const [items, setItems] = useState<SessionResourceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [form, setForm] = useState<ResourceFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<ResourceFormErrors>({});
  const [deleteCandidate, setDeleteCandidate] = useState<SessionResourceItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadResources = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await fetchJson<SessionResourcesResponse>(
      buildTenantApiUrl(tenant, `/admin/sessions/${sessionId}/resources`),
      { cache: "no-store" },
    );

    if (!result.ok) {
      setItems([]);
      setError(t("sessionResources.error.title"));
      setIsLoading(false);
      return;
    }

    setItems(result.data.items ?? []);
    setIsLoading(false);
  }, [sessionId, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadResources();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadResources]);

  const resetEditor = useCallback(() => {
    setEditorMode(null);
    setEditingItemId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setIsSaving(false);
  }, []);

  const validateForm = useCallback(
    (next: ResourceFormState) => {
      const errors: ResourceFormErrors = {};
      if (!next.title.trim()) {
        errors.title = t("sessionResources.validation.titleRequired");
      }
      if (!next.url.trim()) {
        errors.url = t("sessionResources.validation.urlRequired");
      } else if (!isValidHttpUrl(next.url)) {
        errors.url = t("sessionResources.validation.invalidUrl");
      }
      if (!next.type) {
        errors.type = t("sessionResources.type.label");
      }
      return errors;
    },
    [t],
  );

  const openCreateModal = () => {
    setEditorMode("create");
    setEditingItemId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  };

  const openEditModal = (item: SessionResourceItem) => {
    setEditorMode("edit");
    setEditingItemId(item.id);
    setForm({
      title: item.title,
      url: item.url,
      type: item.type,
    });
    setFormErrors({});
  };

  const saveResource = async () => {
    const errors = validateForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setIsSaving(true);

    const payload = {
      title: form.title.trim(),
      url: form.url.trim(),
      type: form.type,
    };
    const endpoint =
      editorMode === "edit" && editingItemId
        ? buildTenantApiUrl(tenant, `/admin/resources/${editingItemId}`)
        : buildTenantApiUrl(tenant, `/admin/sessions/${sessionId}/resources`);
    const method = editorMode === "edit" ? "PATCH" : "POST";

    const result = await fetchJson<SessionResourceMutateResponse>(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
      setIsSaving(false);
      setError(t("sessionResources.error.title"));
      return;
    }

    resetEditor();
    await loadResources();
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);

    const result = await fetchJson<{ ok: true }>(
      buildTenantApiUrl(tenant, `/admin/resources/${deleteCandidate.id}`),
      { method: "DELETE" },
    );

    setIsDeleting(false);
    if (!result.ok) {
      setError(t("sessionResources.error.title"));
      return;
    }

    setDeleteCandidate(null);
    await loadResources();
  };

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [items],
  );

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("sessionResources.section.title")}
        </h2>
        {canManage ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={openCreateModal}
            data-testid="session-resources-add"
          >
            {t("sessionResources.add")}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600">{t("sessionResources.error.body")}</p>
      ) : null}

      {isLoading ? (
        <div className="mt-4 space-y-2" data-testid="session-resources-loading">
          <p className="text-sm text-slate-500">{t("sessionResources.loading")}</p>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`session-resources-skeleton-${index}`}
              className="h-16 animate-pulse rounded border border-slate-200 bg-slate-50"
            />
          ))}
        </div>
      ) : sortedItems.length ? (
        <ul className="mt-4 grid gap-3" data-testid="session-resources-list">
          {sortedItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {t(getTypeLabelKey(item.type))}
                </span>
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                <a
                  className="text-sm font-semibold text-slate-700 underline"
                  href={item.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("sessionResources.openLink")}
                </a>
              </div>

              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`${secondaryButton} px-3 py-1 text-xs`}
                    onClick={() => openEditModal(item)}
                  >
                    {t("sessionResources.edit")}
                  </button>
                  <button
                    type="button"
                    className={`${secondaryButton} px-3 py-1 text-xs`}
                    onClick={() => setDeleteCandidate(item)}
                  >
                    {t("sessionResources.delete")}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 space-y-1" data-testid="session-resources-empty">
          <p className="text-sm font-medium text-slate-700">
            {t("sessionResources.empty.admin.title")}
          </p>
          <p className="text-sm text-slate-500">
            {t("sessionResources.empty.admin.helper")}
          </p>
        </div>
      )}

      {editorMode ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="session-resources-editor-modal"
        >
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {editorMode === "edit" ? t("sessionResources.edit") : t("sessionResources.add")}
            </h3>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">{t("sessionResources.type.label")}</span>
                <select
                  className={inputBase}
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value as SessionResourceType,
                    }))
                  }
                  disabled={isSaving}
                >
                  {RESOURCE_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {t(getTypeLabelKey(type))}
                    </option>
                  ))}
                </select>
                {formErrors.type ? (
                  <p className="text-xs text-red-600">{formErrors.type}</p>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-700">{t("sessionResources.title.label")}</span>
                <input
                  className={inputBase}
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  disabled={isSaving}
                />
                {formErrors.title ? (
                  <p className="text-xs text-red-600">{formErrors.title}</p>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-700">{t("sessionResources.url.label")}</span>
                <input
                  className={inputBase}
                  type="url"
                  value={form.url}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                  disabled={isSaving}
                />
                {formErrors.url ? (
                  <p className="text-xs text-red-600">{formErrors.url}</p>
                ) : null}
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={resetEditor}
                disabled={isSaving}
              >
                {t("sessionResources.deleteConfirm.cancel")}
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => void saveResource()}
                disabled={isSaving}
              >
                {isSaving ? t("common.loading") : t("common.actions.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="session-resources-delete-modal"
        >
          <div className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {t("sessionResources.deleteConfirm.title")}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {t("sessionResources.deleteConfirm.body")}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setDeleteCandidate(null)}
                disabled={isDeleting}
              >
                {t("sessionResources.deleteConfirm.cancel")}
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => void confirmDelete()}
                disabled={isDeleting}
              >
                {isDeleting
                  ? t("common.loading")
                  : t("sessionResources.deleteConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
