// Client-side centers admin UI with create/edit/toggle flows using shared fetch + table helpers.
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { fetchJson } from "@/lib/api/fetchJson";
import type { CenterRecord } from "@/lib/centers/getCenters";

type CentersClientProps = {
  initialCenters: CenterRecord[];
};

type CenterFormState = {
  id: string | null;
  name: string;
  timezone: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

const emptyForm: CenterFormState = {
  id: null,
  name: "",
  timezone: "",
  address1: "",
  address2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "",
};

function toFormState(center: CenterRecord): CenterFormState {
  return {
    id: center.id,
    name: center.name,
    timezone: center.timezone,
    address1: center.address1 ?? "",
    address2: center.address2 ?? "",
    city: center.city ?? "",
    province: center.province ?? "",
    postalCode: center.postalCode ?? "",
    country: center.country ?? "",
  };
}

function toPayload(form: CenterFormState) {
  const optional = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  return {
    name: form.name.trim(),
    timezone: form.timezone.trim(),
    address1: optional(form.address1),
    address2: optional(form.address2),
    city: optional(form.city),
    province: optional(form.province),
    postalCode: optional(form.postalCode),
    country: optional(form.country),
  };
}

export default function CentersClient({ initialCenters }: CentersClientProps) {
  const t = useTranslations();
  const [centers, setCenters] = useState<CenterRecord[]>(initialCenters);
  const [form, setForm] = useState<CenterFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshCenters() {
    setError(null);
    const result = await fetchJson<CenterRecord[]>(
      "/api/centers?includeInactive=true",
    );

    if (!result.ok) {
      // Error handling keeps the UI responsive even when the API fails.
      setError(t("admin.centers.messages.loadError"));
      return;
    }

    setCenters(result.data);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const trimmedName = form.name.trim();
    const trimmedTimezone = form.timezone.trim();

    // Client-side required field checks keep validation messages localized.
    if (!trimmedName || !trimmedTimezone) {
      setError(t("admin.centers.messages.requiredFields"));
      setIsSaving(false);
      return;
    }

    const payload = toPayload(form);
    const isEditing = Boolean(form.id);
    const url = isEditing ? `/api/centers/${form.id}` : "/api/centers";
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<CenterRecord>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok) {
      // Validation errors surface a localized message while keeping form state.
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setError(
        isValidation
          ? t("admin.centers.messages.validationError")
          : t("admin.centers.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    await refreshCenters();
    setForm(emptyForm);
    setMessage(
      isEditing
        ? t("admin.centers.messages.updateSuccess")
        : t("admin.centers.messages.createSuccess"),
    );
    setIsSaving(false);
  }

  function startEdit(center: CenterRecord) {
    setForm(toFormState(center));
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setForm(emptyForm);
    setError(null);
    setMessage(null);
  }

  function startCreate() {
    // Reset to a clean form state before creating a new center.
    setForm(emptyForm);
    setError(null);
    setMessage(null);
  }

  async function toggleActive(center: CenterRecord) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<CenterRecord>(`/api/centers/${center.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !center.isActive }),
    });

    if (!result.ok) {
      // Error handling keeps the UI responsive even when the API fails.
      setError(t("admin.centers.messages.loadError"));
      setIsSaving(false);
      return;
    }

    await refreshCenters();
    setMessage(t("admin.centers.messages.updateSuccess"));
    setIsSaving(false);
  }

  const columns: AdminTableColumn<CenterRecord>[] = [
    {
      header: t("admin.centers.fields.name"),
      cell: (center) => center.name,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 font-medium text-slate-900",
    },
    {
      header: t("admin.centers.fields.timezone"),
      cell: (center) => center.timezone,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.centers.fields.status"),
      cell: (center) =>
        center.isActive
          ? t("admin.centers.status.active")
          : t("admin.centers.status.inactive"),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.centers.fields.actions"),
      cell: (center) => (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
            disabled={isSaving}
            onClick={() => startEdit(center)}
            type="button"
          >
            {t("admin.centers.edit")}
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
            disabled={isSaving}
            onClick={() => toggleActive(center)}
            type="button"
          >
            {center.isActive
              ? t("admin.centers.deactivate")
              : t("admin.centers.activate")}
          </button>
        </div>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {form.id ? t("admin.centers.edit") : t("admin.centers.create")}
          </h2>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
            data-testid="create-center-button"
            disabled={isSaving}
            onClick={startCreate}
            type="button"
          >
            {t("admin.centers.create")}
          </button>
        </div>
        <form className="mt-4 grid gap-4" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.name")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                data-testid="center-name-input"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.timezone")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                data-testid="center-timezone-select"
                value={form.timezone}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    timezone: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.address1")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                value={form.address1}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, address1: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.address2")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                value={form.address2}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, address2: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.city")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                value={form.city}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, city: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.province")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                value={form.province}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, province: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.postalCode")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                value={form.postalCode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    postalCode: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-slate-700">
                {t("admin.centers.fields.country")}
              </span>
              <input
                className="rounded border border-slate-300 px-3 py-2"
                value={form.country}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, country: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              data-testid="save-center-button"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? t("common.loading") : t("admin.centers.actions.save")}
            </button>
            {form.id ? (
              <button
                className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                disabled={isSaving}
                onClick={cancelEdit}
                type="button"
              >
                {t("admin.centers.actions.cancel")}
              </button>
            ) : null}
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-600">{message}</p> : null}
        </form>
      </div>

      <AdminTable
        rows={centers}
        columns={columns}
        rowKey={(center) => `center-row-${center.id}`}
        testId="centers-table"
      />
    </div>
  );
}
