"use client";

import type { MouseEventHandler } from "react";
import { useTranslations } from "next-intl";

type SessionStatus = "upcoming" | "completed" | "canceled";

type SessionListItemProps = {
  title: string;
  datetimeText: string;
  childName?: string;
  tutorName?: string;
  locationText?: string;
  status?: SessionStatus;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

type StatusChipProps = {
  status: SessionStatus;
  label: string;
};

function StatusChip({ status, label }: StatusChipProps) {
  const toneClassName =
    status === "completed"
      ? "border-[var(--success)] text-[var(--success)]"
      : status === "upcoming"
        ? "border-[var(--warning)] text-[var(--warning)]"
        : "border-[var(--border)] text-[var(--muted)]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${toneClassName}`}
    >
      {label}
    </span>
  );
}

export default function SessionListItem({
  title,
  datetimeText,
  childName,
  tutorName,
  locationText,
  status,
  onClick,
}: SessionListItemProps) {
  const t = useTranslations();
  const isCanceled = status === "canceled";
  const secondaryParts = [childName, tutorName, locationText].filter(
    (part): part is string => Boolean(part),
  );
  const textToneClassName = isCanceled
    ? "text-[var(--muted)]"
    : "text-[var(--text)]";

  // TODO: Replace the placeholder status label with dedicated parent status keys.
  const statusLabel = t("generic.dash");
  const containerClassName = `flex min-h-[56px] w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] ${
    onClick
      ? "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      : ""
  }`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={containerClassName}>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-medium ${textToneClassName}`}
            title={title}
          >
            {title}
          </p>
          <p
            className="truncate text-xs text-[var(--muted)]"
            title={datetimeText}
          >
            {datetimeText}
          </p>
          {secondaryParts.length ? (
            <div className="min-w-0 truncate text-xs text-[var(--muted)]">
              <div className="flex min-w-0 items-center gap-2">
                {secondaryParts.map((part) => (
                  <span key={part} className="truncate" title={part}>
                    {part}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {status ? (
          <div className="flex shrink-0 items-center">
            <StatusChip status={status} label={statusLabel} />
          </div>
        ) : null}
      </button>
    );
  }

  return (
    <div className={containerClassName}>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${textToneClassName}`}
          title={title}
        >
          {title}
        </p>
        <p className="truncate text-xs text-[var(--muted)]" title={datetimeText}>
          {datetimeText}
        </p>
        {secondaryParts.length ? (
          <div className="min-w-0 truncate text-xs text-[var(--muted)]">
            <div className="flex min-w-0 items-center gap-2">
              {secondaryParts.map((part) => (
                <span key={part} className="truncate" title={part}>
                  {part}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {status ? (
        <div className="flex shrink-0 items-center">
          <StatusChip status={status} label={statusLabel} />
        </div>
      ) : null}
    </div>
  );
}
