// Parent login page that requests a passwordless magic link.
"use client";

import { use, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

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
  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [view, setView] = useState<"form" | "success">("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<"rateLimited" | "generic" | null>(
    null,
  );
  const [retryAfterMinutes, setRetryAfterMinutes] = useState<number | null>(
    null,
  );
  // Next.js 16 passes dynamic params as a Promise in client components.
  const { tenant } = use(params);

  const emailInputId = "parent-login-email";
  const rememberMeId = "parent-login-remember-me";
  const emailErrorId = "parent-login-email-error";
  const emailIsValid = useMemo(
    () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()),
    [email],
  );

  async function requestMagicLink(targetEmail: string) {
    setIsSubmitting(true);
    setFormError(null);
    setRetryAfterMinutes(null);

    try {
      const response = await fetch(
        `/${tenant}/api/parent-auth/magic-link/request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: targetEmail,
            rememberMe,
          }),
        },
      );

      const data = (await response.json()) as {
        rateLimited?: boolean;
        retryAfterSeconds?: number;
      };

      if (!response.ok) {
        setFormError("generic");
        return { ok: false };
      }

      if (data.rateLimited) {
        const minutes = data.retryAfterSeconds
          ? Math.max(1, Math.ceil(data.retryAfterSeconds / 60))
          : null;
        setRetryAfterMinutes(minutes);
        setFormError("rateLimited");
        return { ok: false, rateLimited: true };
      }

      return { ok: true };
    } catch {
      setFormError("generic");
      return { ok: false };
    } finally {
      setIsSubmitting(false);
    }
  }

  // Request a magic link without revealing whether the account exists.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !emailIsValid) {
      setEmailError(t("parentAuth.login.validation.invalidEmail"));
      return;
    }

    const result = await requestMagicLink(trimmedEmail);
    if (result.ok) {
      setView("success");
    }
  }

  async function handleResend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !emailIsValid) {
      setEmailError(t("parentAuth.login.validation.invalidEmail"));
      setView("form");
      return;
    }

    const result = await requestMagicLink(trimmedEmail);
    if (result.ok) {
      setView("success");
    }
  }

  function handleUseDifferentEmail() {
    setView("form");
    setFormError(null);
    setRetryAfterMinutes(null);
    setEmail("");
    setEmailError(null);
  }

  return (
    <ParentShell showNav={false}>
      {/* ParentShell keeps portal styling consistent while hiding nav on auth screens. */}
      <div
        className="mx-auto max-w-md px-4 py-10 md:py-16"
        data-testid="parent-login-page"
      >
        <PageHeader
          titleKey="parentAuth.login.title"
          subtitleKey="parentAuth.login.subtitle"
        />
        <Card>
          {formError === "rateLimited" ? (
            <div
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="alert"
              data-testid="parent-login-rate-limit"
            >
              {retryAfterMinutes ? (
                <p>
                  {t("parentAuth.login.error.rateLimitedWithRetry", {
                    minutes: retryAfterMinutes,
                  })}
                </p>
              ) : (
                <p>{t("parentAuth.login.error.rateLimited")}</p>
              )}
            </div>
          ) : null}
          {formError === "generic" ? (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
              data-testid="parent-login-error"
            >
              {t("parentAuth.login.error.generic")}
            </div>
          ) : null}

          {view === "success" ? (
            <div className="space-y-4" data-testid="parent-login-success">
              <div className="space-y-1">
                <p className="text-lg font-semibold text-[var(--text)]">
                  {t("parentAuth.login.success.title")}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {t("parentAuth.login.success.bodyNeutral")}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  className="flex h-11 w-full items-center justify-center gap-2 rounded bg-[var(--text)] px-4 text-sm font-semibold text-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)] disabled:opacity-60"
                  data-testid="parent-login-resend"
                  disabled={isSubmitting}
                  onClick={() => void handleResend()}
                  type="button"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {t("parentAuth.login.cta.sending")}
                    </>
                  ) : (
                    t("parentAuth.login.success.cta.resend")
                  )}
                </button>
                <button
                  className="text-sm font-semibold text-[var(--text)] underline decoration-[var(--border)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
                  data-testid="parent-login-use-different-email"
                  onClick={handleUseDifferentEmail}
                  type="button"
                >
                  {t("parentAuth.login.success.cta.useDifferentEmail")}
                </button>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {t("parentAuth.login.securityNote")}
              </p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm" htmlFor={emailInputId}>
                <span className="text-[var(--text)]">
                  {t("parentAuth.login.email.label")}
                </span>
                <input
                  className="h-11 rounded border border-[var(--border)] bg-white px-3 text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)] disabled:opacity-60"
                  data-testid="parent-login-email"
                  id={emailInputId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("parentAuth.login.email.placeholder")}
                  disabled={isSubmitting}
                  aria-describedby={emailError ? emailErrorId : undefined}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailError(null);
                  }}
                />
                {emailError ? (
                  <span
                    className="text-xs text-red-600"
                    role="alert"
                    id={emailErrorId}
                    data-testid="parent-login-email-error"
                  >
                    {emailError}
                  </span>
                ) : null}
              </label>
              <label className="flex items-start gap-3 text-sm" htmlFor={rememberMeId}>
                <input
                  className="mt-1 h-4 w-4 rounded border border-[var(--border)] text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
                  data-testid="parent-login-remember-me"
                  id={rememberMeId}
                  name="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span className="space-y-1">
                  <span className="block text-[var(--text)]">
                    {t("parentAuth.login.rememberMe.label")}
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    {t("parentAuth.login.rememberMe.help")}
                  </span>
                </span>
              </label>
              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded bg-[var(--text)] px-4 text-sm font-semibold text-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)] disabled:opacity-60"
                data-testid="parent-login-submit"
                disabled={isSubmitting || !emailIsValid}
                type="submit"
                aria-busy={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {t("parentAuth.login.cta.sending")}
                  </>
                ) : (
                  t("parentAuth.login.cta.sendLink")
                )}
              </button>
            </form>
          )}
        </Card>
      </div>
    </ParentShell>
  );
}
