// Parent login page that authenticates via NextAuth credentials + tenant slug.
"use client";

import { use, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import ParentShell from "@/components/parent/ParentShell";

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default function ParentLoginPage({ params }: PageProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formAlert, setFormAlert] = useState<{
    tone: "warning" | "error";
    titleKey: string;
    bodyKey: string;
    bodyParams?: Record<string, number>;
    secondaryBodyKey?: string;
    secondaryBodyParams?: Record<string, number>;
  } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const lockoutTimerRef = useRef<number | null>(null);
  // Next.js 16 passes dynamic params as a Promise in client components.
  const { tenant } = use(params);

  const emailErrorId = "parent-login-email-error";
  const codeErrorId = "parent-login-code-error";
  const isLockedOut = lockoutUntil !== null;

  useEffect(() => {
    // Ensure any pending lockout timers are cleared on unmount.
    return () => {
      if (lockoutTimerRef.current) {
        window.clearTimeout(lockoutTimerRef.current);
      }
    };
  }, []);

  function validate(email: string, accessCode: string) {
    let nextEmailError: string | null = null;
    let nextCodeError: string | null = null;

    if (!email) {
      nextEmailError = t("parent.login.error.emailRequired");
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      nextEmailError = t("parent.login.error.emailInvalid");
    }

    if (!accessCode.trim()) {
      nextCodeError = t("parent.login.error.codeRequired");
    }

    setEmailError(nextEmailError);
    setCodeError(nextCodeError);

    return !nextEmailError && !nextCodeError;
  }

  // Submit credentials to the parent auth provider and redirect on success.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormAlert(null);

    if (isLockedOut) {
      // Prevent submissions during lockout to align with the cooldown UX contract.
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const accessCode = String(formData.get("accessCode") ?? "");
    const tenantSlug = tenant;

    if (!validate(email, accessCode)) {
      return;
    }

    setIsSubmitting(true);
    const result = await signIn("parent-credentials", {
      email,
      accessCode,
      tenantSlug,
      redirect: false,
    });

    if (!result || result.error) {
      const [errorCode, retryAfterRaw] = (result?.code ?? "").split(":");
      const retryAfterSeconds = Number(retryAfterRaw);
      const retryAfterMinutes = Number.isFinite(retryAfterSeconds)
        ? Math.max(1, Math.ceil(retryAfterSeconds / 60))
        : null;

      if (errorCode === "AUTH_THROTTLED") {
        setFormAlert({
          tone: "warning",
          titleKey: "portal.auth.throttle.title",
          bodyKey: "portal.auth.throttle.body",
          secondaryBodyKey: retryAfterMinutes
            ? "portal.auth.throttle.retryAfter"
            : undefined,
          secondaryBodyParams: retryAfterMinutes
            ? { minutes: retryAfterMinutes }
            : undefined,
        });
        setIsSubmitting(false);
        return;
      }

      if (errorCode === "AUTH_LOCKED") {
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          const lockoutUntilMs = Date.now() + retryAfterSeconds * 1000;
          setLockoutUntil(lockoutUntilMs);
          if (lockoutTimerRef.current) {
            window.clearTimeout(lockoutTimerRef.current);
          }
          // Schedule lockout clearance so the submit button re-enables automatically.
          lockoutTimerRef.current = window.setTimeout(() => {
            setLockoutUntil(null);
            setFormAlert(null);
          }, retryAfterSeconds * 1000);
        }

        setFormAlert({
          tone: "warning",
          titleKey: "portal.auth.lockout.title",
          bodyKey: retryAfterMinutes
            ? "portal.auth.lockout.body.withTime"
            : "portal.auth.lockout.body.noTime",
          bodyParams: retryAfterMinutes ? { minutes: retryAfterMinutes } : undefined,
        });
        setIsSubmitting(false);
        return;
      }

      if (result?.error) {
        // Surface invalid credentials at the access code field without revealing email status.
        setCodeError(t("portal.auth.error.invalidCredentials"));
        setIsSubmitting(false);
        return;
      }

      setFormAlert({
        tone: "error",
        titleKey: "portal.auth.error.generic.title",
        bodyKey: "portal.auth.error.generic.body",
      });
      setIsSubmitting(false);
      return;
    }

    // Route parents into the portal entry point after successful login.
    router.push(`/${tenant}/portal`);
  }

  return (
    <ParentShell showNav={false}>
      {/* ParentShell keeps portal styling consistent while hiding nav on auth screens. */}
      <div className="mx-auto max-w-md py-10 md:py-16" data-testid="parent-login-page">
        <PageHeader
          titleKey="parent.login.title"
          subtitleKey="parent.login.subtitle"
        />
        <Card>
          {/* Reserve banner space to prevent layout jumps when auth alerts appear. */}
          <div className="min-h-[72px]">
            {formAlert ? (
              <div
                className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                  formAlert.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
                // data-testid makes the auth alert easy to target without relying on copy text.
                data-testid="parent-login-alert"
                role="alert"
              >
                <p className="font-semibold">{t(formAlert.titleKey)}</p>
                <p className="mt-1 text-sm">{t(formAlert.bodyKey, formAlert.bodyParams)}</p>
                {formAlert.secondaryBodyKey ? (
                  <p className="mt-1 text-sm">
                    {t(formAlert.secondaryBodyKey, formAlert.secondaryBodyParams)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-[var(--text)]">
                {t("parent.login.email.label")}
              </span>
              <input
                className="h-11 rounded border border-[var(--border)] bg-white px-3 text-[var(--text)] disabled:opacity-60"
                data-testid="parent-login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t("parent.login.email.placeholder")}
                disabled={isSubmitting}
                aria-describedby={emailError ? emailErrorId : undefined}
                onChange={() => setEmailError(null)}
              />
              {emailError ? (
                <span
                  className="text-xs text-red-600"
                  role="alert"
                  id={emailErrorId}
                  // data-testid supports stable E2E assertions for field-level errors.
                  data-testid="parent-login-email-error"
                >
                  {emailError}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-[var(--text)]">
                {t("parent.login.code.label")}
              </span>
              <input
                className="h-11 rounded border border-[var(--border)] bg-white px-3 text-[var(--text)] disabled:opacity-60"
                data-testid="parent-login-access-code"
                name="accessCode"
                type="text"
                autoComplete="off"
                placeholder={t("parent.login.code.placeholder")}
                disabled={isSubmitting}
                aria-describedby={codeError ? codeErrorId : undefined}
                onChange={() => setCodeError(null)}
              />
              {codeError ? (
                <span
                  className="text-xs text-red-600"
                  role="alert"
                  id={codeErrorId}
                  // data-testid supports stable E2E assertions for field-level errors.
                  data-testid="parent-login-code-error"
                >
                  {codeError}
                </span>
              ) : (
                <span className="text-xs text-[var(--muted)]">
                  {t("parent.login.code.help")}
                </span>
              )}
            </label>
            <button
              className="flex h-11 w-full items-center justify-center gap-2 rounded bg-[var(--text)] px-4 text-sm font-semibold text-[var(--background)] disabled:opacity-60"
              data-testid="parent-login-submit"
              disabled={isSubmitting || isLockedOut}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t("portal.auth.state.signingIn")}
                </>
              ) : (
                t("parent.login.submit")
              )}
            </button>
            {isLockedOut ? (
              <p className="text-xs text-[var(--muted)]" role="status">
                {t("portal.auth.lockout.buttonHelper")}
              </p>
            ) : null}
          </form>
        </Card>
      </div>
    </ParentShell>
  );
}
