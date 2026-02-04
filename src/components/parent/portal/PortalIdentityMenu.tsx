"use client";

// Identity dropdown provides account/help/logout actions for the parent portal.
import { useMemo, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";

type PortalIdentityMenuProps = {
  tenantLabel?: string;
  variant?: "full" | "compact";
  className?: string;
};

export default function PortalIdentityMenu({
  tenantLabel,
  variant = "full",
  className = "",
}: PortalIdentityMenuProps) {
  const t = useTranslations();
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const { data, tenantSlug } = usePortalMe();

  const email = data?.parent?.email?.trim() ?? "";
  const identityFallback = t("portal.header.identity.fallback");
  const identityLabel = email
    ? `${t("portal.header.identity.label")} ${email}`
    : identityFallback;
  const tenantDisplay =
    data?.tenant?.displayName?.trim() ||
    data?.tenant?.slug?.trim() ||
    tenantLabel?.trim() ||
    "";

  const accountHref = tenantSlug
    ? `/${tenantSlug}/portal/account`
    : "/portal/account";
  const helpHref = tenantSlug ? `/${tenantSlug}/portal/help` : "/portal/help";

  const triggerBody = useMemo(() => {
    if (variant === "compact") {
      return (
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            role="img"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx="12"
              cy="8"
              r="4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M4 20c1.6-3.6 5.2-5 8-5s6.4 1.4 8 5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </span>
      );
    }

    return (
      <span className="flex max-w-[240px] flex-col text-left">
        <span className="truncate text-sm font-semibold text-[var(--text)]">
          {email
            ? `${t("portal.header.identity.label")} ${email}`
            : identityFallback}
        </span>
        {tenantDisplay ? (
          <span
            className="truncate text-xs text-[var(--muted-2)]"
            aria-label={`${t("portal.header.tenant.label")} ${tenantDisplay}`}
          >
            {tenantDisplay}
          </span>
        ) : null}
      </span>
    );
  }, [email, identityFallback, tenantDisplay, t, variant]);

  function closeMenu() {
    menuRef.current?.removeAttribute("open");
  }

  async function handleSignOut() {
    closeMenu();
    const callbackUrl = tenantSlug
      ? `/${tenantSlug}/parent/login`
      : "/parent/login";
    await signOut({ callbackUrl });
  }

  return (
    <details
      ref={menuRef}
      className={`relative ${className}`}
      data-testid="portal-identity-menu"
    >
      <summary
        className="cursor-pointer list-none rounded-xl px-3 py-2 transition hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        aria-label={identityLabel}
      >
        {triggerBody}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-48 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
        <Link
          href={accountHref}
          className="flex items-center rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
          onClick={closeMenu}
        >
          {t("portal.header.menu.account")}
        </Link>
        <Link
          href={helpHref}
          className="flex items-center rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
          onClick={closeMenu}
        >
          {t("portal.header.menu.help")}
        </Link>
        <div className="my-2 h-px bg-[var(--border)]" aria-hidden="true" />
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
        >
          {t("portal.header.menu.logout")}
        </button>
      </div>
    </details>
  );
}
