// Client-side users admin UI with table listing and create/edit modals.
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type RoleValue = "Owner" | "Admin" | "Tutor" | "Parent" | "Student";

type CenterOption = {
  id: string;
  name: string;
};

type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: RoleValue;
  centers: CenterOption[];
};

type UsersClientProps = {
  initialUsers: UserListItem[];
  centers: CenterOption[];
};

type UserFormState = {
  id: string | null;
  email: string;
  name: string;
  role: RoleValue;
  centerIds: string[];
};

const ROLE_OPTIONS: RoleValue[] = [
  "Owner",
  "Admin",
  "Tutor",
  "Parent",
  "Student",
];

const emptyForm: UserFormState = {
  id: null,
  email: "",
  name: "",
  role: "Tutor",
  centerIds: [],
};

function roleTranslationKey(role: RoleValue) {
  return `admin.users.roles.${role.toLowerCase()}` as const;
}

function toFormState(user: UserListItem): UserFormState {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    role: user.role,
    centerIds: user.centers.map((center) => center.id),
  };
}

export default function UsersClient({
  initialUsers,
  centers,
}: UsersClientProps) {
  const t = useTranslations();
  const [users, setUsers] = useState<UserListItem[]>(initialUsers);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isEditing = Boolean(form.id);

  async function refreshUsers() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/users");

      if (res.status === 401 || res.status === 403) {
        setError(t("admin.users.messages.forbidden"));
        setIsLoading(false);
        return false;
      }

      if (!res.ok) {
        setError(t("admin.users.messages.loadError"));
        setIsLoading(false);
        return false;
      }

      const data = (await res.json()) as UserListItem[];
      setUsers(data);
      return true;
    } catch (err) {
      // Network failures fall back to a generic localized error message.
      console.error("Failed to load users", err);
      setError(t("common.error"));
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateModal() {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setError(null);
    setMessage(null);
  }

  function openEditModal(user: UserListItem) {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(user));
    setIsModalOpen(true);
    setError(null);
    setMessage(null);
  }

  function closeModal() {
    setIsModalOpen(false);
    setError(null);
  }

  function toggleCenter(centerId: string) {
    setForm((prev) => {
      const selected = new Set(prev.centerIds);
      if (selected.has(centerId)) {
        selected.delete(centerId);
      } else {
        selected.add(centerId);
      }
      return { ...prev, centerIds: Array.from(selected) };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const trimmedEmail = form.email.trim();
    const trimmedName = form.name.trim();

    if (!isEditing && !trimmedEmail) {
      setError(t("admin.users.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const payload: {
      email?: string;
      name?: string;
      role: RoleValue;
      centerIds: string[];
    } = {
      role: form.role,
      centerIds: form.centerIds,
    };

    if (!isEditing) {
      payload.email = trimmedEmail;
    }

    if (trimmedName) {
      payload.name = trimmedName;
    }

    const url = isEditing ? `/api/users/${form.id}` : "/api/users";
    const method = isEditing ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 || res.status === 403) {
      setError(t("admin.users.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!res.ok) {
      const errorBody = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      const isValidation =
        res.status === 400 && errorBody?.error === "ValidationError";
      setError(
        isValidation
          ? t("admin.users.messages.validationError")
          : t("admin.users.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await refreshUsers();
    setIsSaving(false);
    if (!refreshed) {
      return;
    }

    setIsModalOpen(false);
    setMessage(
      isEditing
        ? t("admin.users.messages.updateSuccess")
        : t("admin.users.messages.createSuccess"),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          data-testid="create-user-button"
          onClick={openCreateModal}
          type="button"
        >
          {t("admin.users.create")}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {isLoading ? (
        <p className="text-sm text-slate-600">{t("common.loading")}</p>
      ) : null}

      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm" data-testid="users-table">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3">{t("admin.users.fields.name")}</th>
              <th className="px-4 py-3">{t("admin.users.fields.email")}</th>
              <th className="px-4 py-3">{t("admin.users.fields.role")}</th>
              <th className="px-4 py-3">{t("admin.users.fields.centers")}</th>
              <th className="px-4 py-3">{t("admin.users.edit")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-t border-slate-200"
                data-testid={`user-row-${user.id}`}
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  {user.name ?? ""}
                </td>
                <td className="px-4 py-3 text-slate-700">{user.email}</td>
                <td className="px-4 py-3 text-slate-700">
                  {t(roleTranslationKey(user.role))}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {user.centers.map((center) => center.name).join(", ")}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                    onClick={() => openEditModal(user)}
                    type="button"
                  >
                    {t("admin.users.edit")}
                  </button>
                </td>
              </tr>
            ))}
            {!users.length && isLoading ? (
              <tr className="border-t border-slate-200">
                <td
                  className="px-4 py-6 text-center text-sm text-slate-500"
                  colSpan={5}
                >
                  {t("common.loading")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isEditing ? t("admin.users.edit") : t("admin.users.create")}
              </h2>
              <button
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                disabled={isSaving}
                onClick={closeModal}
                type="button"
              >
                {t("admin.users.actions.cancel")}
              </button>
            </div>
            <form
              className="mt-4 grid gap-4"
              noValidate
              onSubmit={handleSubmit}
            >
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.users.fields.email")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  data-testid="user-email-input"
                  disabled={isEditing}
                  value={form.email}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.users.fields.name")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="user-name-input"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.users.fields.role")}
                </span>
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="user-role-select"
                  value={form.role}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      role: event.target.value as RoleValue,
                    }))
                  }
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {t(roleTranslationKey(role))}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="text-slate-700">
                  {t("admin.users.fields.centers")}
                </legend>
                <div className="grid gap-2">
                  {centers.map((center) => (
                    <label key={center.id} className="flex items-center gap-2">
                      <input
                        checked={form.centerIds.includes(center.id)}
                        className="h-4 w-4 rounded border-slate-300"
                        onChange={() => toggleCenter(center.id)}
                        type="checkbox"
                      />
                      <span className="text-slate-700">{center.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="save-user-button"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving
                    ? t("common.loading")
                    : t("admin.users.actions.save")}
                </button>
                <button
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  disabled={isSaving}
                  onClick={closeModal}
                  type="button"
                >
                  {t("admin.users.actions.cancel")}
                </button>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
