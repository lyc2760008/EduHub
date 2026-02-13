// Session zoom-link editor keeps admin updates scoped to a single safe URL field.
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  inputBase,
  primaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

type SessionZoomLinkSectionProps = {
  tenant: string;
  sessionId: string;
  initialZoomLink: string | null;
  canEdit: boolean;
};

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

export default function SessionZoomLinkSection({
  tenant,
  sessionId,
  initialZoomLink,
  canEdit,
}: SessionZoomLinkSectionProps) {
  const t = useTranslations();
  const [zoomLink, setZoomLink] = useState(initialZoomLink ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveZoomLink() {
    if (!canEdit) return;
    setMessage(null);
    setError(null);

    if (!isValidZoomLinkInput(zoomLink)) {
      setError(t("session.zoomLink.invalid"));
      return;
    }

    setIsSaving(true);
    const result = await fetchJson<{ ok: true; zoomLink: string | null }>(
      buildTenantApiUrl(tenant, `/sessions/${sessionId}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoomLink: zoomLink.trim() || null,
        }),
      },
    );
    setIsSaving(false);

    if (!result.ok) {
      setError(t("session.zoomLink.saveError"));
      return;
    }

    setZoomLink(result.data.zoomLink ?? "");
    setMessage(t("session.zoomLink.saveSuccess"));
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">
        {t("session.zoomLink.label")}
      </h2>
      <div className="mt-3 grid gap-3">
        {canEdit ? (
          <>
            <label className="grid gap-2 text-sm text-slate-700">
              <span>{t("session.zoomLink.label")}</span>
              <input
                className={inputBase}
                type="url"
                value={zoomLink}
                onChange={(event) => setZoomLink(event.target.value)}
              />
              <span className="text-xs text-slate-500">
                {t("session.zoomLink.helper")}
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={primaryButton}
                type="button"
                disabled={isSaving}
                onClick={() => void saveZoomLink()}
              >
                {isSaving ? t("common.loading") : t("common.actions.save")}
              </button>
              {zoomLink.trim() ? (
                <a
                  className="text-sm font-semibold text-slate-700 underline"
                  href={zoomLink.trim()}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("session.zoomLink.open")}
                </a>
              ) : null}
            </div>
          </>
        ) : zoomLink.trim() ? (
          <a
            className="text-sm font-semibold text-slate-700 underline"
            href={zoomLink.trim()}
            rel="noreferrer"
            target="_blank"
          >
            {t("session.zoomLink.open")}
          </a>
        ) : (
          <p className="text-sm text-slate-500">{t("generic.dash")}</p>
        )}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
