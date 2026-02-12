/**
 * @state.route /[tenant]/parent/auth/verify
 * @state.area parent
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Parent magic link verification page with explicit success/error states.
"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import ParentShell from "@/components/parent/ParentShell";
import { consumeParentMagicLinkToken } from "./_actions/consumeParentMagicLink";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

type VerifyStatus = "loading" | "success" | "expired" | "invalid" | "failure";

export default function ParentVerifyPage({ params }: PageProps) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenant } = use(params);
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [status, setStatus] = useState<VerifyStatus>("loading");
  // Derive invalid state from missing tokens without extra renders.
  const effectiveStatus = token ? status : "invalid";

  useEffect(() => {
    if (!token) return;

    let redirectTimeout: number | null = null;
    let cancelled = false;

    async function consumeToken() {
      try {
        // Use a server action so NextAuth can set cookies reliably (no CSRF/callback indirection).
        const data = await consumeParentMagicLinkToken({
          tenantSlug: tenant,
          token,
        });

        if (cancelled) return;

        if (!data) {
          setStatus("failure");
          return;
        }

        if (data.ok) {
          setStatus("success");
          // Keep fallback aligned with canonical parent home routing.
          const destination = data.redirectTo ?? `/${tenant}/portal`;
          redirectTimeout = window.setTimeout(() => {
            router.replace(destination);
          }, 900);
          return;
        }

        if (data.reason === "expired") {
          setStatus("expired");
          return;
        }
        if (data.reason === "invalid") {
          setStatus("invalid");
          return;
        }

        setStatus("failure");
      } catch {
        if (!cancelled) {
          setStatus("failure");
        }
      }
    }

    void consumeToken();

    return () => {
      cancelled = true;
      if (redirectTimeout) {
        window.clearTimeout(redirectTimeout);
      }
    };
  }, [router, tenant, token]);

  const loginHref = `/${tenant}/parent/login`;

  return (
    <ParentShell showNav={false}>
      <div
        className="mx-auto max-w-md px-4 py-12 md:py-16"
        data-testid="parent-verify-page"
      >
        <Card>
          <div aria-live="polite" aria-busy={status === "loading"}>
            {effectiveStatus === "loading" ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text)]" />
                <p className="text-sm text-[var(--muted)]">
                  {t("parentAuth.verify.loading")}
                </p>
              </div>
            ) : null}

            {effectiveStatus === "success" ? (
              <div className="space-y-2 text-center">
                <p className="text-lg font-semibold text-[var(--text)]">
                  {t("parentAuth.verify.success.title")}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {t("parentAuth.verify.success.redirecting")}
                </p>
              </div>
            ) : null}

            {effectiveStatus === "expired" ? (
              <div className="space-y-4 text-center">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-[var(--text)]">
                    {t("parentAuth.verify.expired.title")}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {t("parentAuth.verify.expired.body")}
                  </p>
                </div>
                <Link
                  className="inline-flex h-11 w-full items-center justify-center rounded bg-[var(--text)] px-4 text-sm font-semibold text-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
                  href={loginHref}
                >
                  {t("parentAuth.verify.cta.newLink")}
                </Link>
              </div>
            ) : null}

            {effectiveStatus === "invalid" ? (
              <div className="space-y-4 text-center">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-[var(--text)]">
                    {t("parentAuth.verify.invalid.title")}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {t("parentAuth.verify.invalid.body")}
                  </p>
                </div>
                <Link
                  className="inline-flex h-11 w-full items-center justify-center rounded bg-[var(--text)] px-4 text-sm font-semibold text-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
                  href={loginHref}
                >
                  {t("parentAuth.verify.cta.newLink")}
                </Link>
              </div>
            ) : null}

            {effectiveStatus === "failure" ? (
              <div className="space-y-4 text-center">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-[var(--text)]">
                    {t("parentAuth.verify.failure.title")}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {t("parentAuth.verify.failure.body")}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link
                    className="inline-flex h-11 w-full items-center justify-center rounded bg-[var(--text)] px-4 text-sm font-semibold text-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
                    href={loginHref}
                  >
                    {t("parentAuth.verify.cta.newLink")}
                  </Link>
                  <Link
                    className="text-sm font-semibold text-[var(--text)] underline decoration-[var(--border)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
                    href={loginHref}
                  >
                    {t("parentAuth.verify.cta.backToLogin")}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </ParentShell>
  );
}
