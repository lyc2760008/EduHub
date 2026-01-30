// Parent login page that authenticates via NextAuth credentials + tenant slug.
"use client";

import { use, useState } from "react";
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
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  // Next.js 16 passes dynamic params as a Promise in client components.
  const { tenant } = use(params);

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
    setAlertMessage(null);

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
      // Keep messaging generic so we do not leak whether a parent exists.
      setAlertMessage(
        result?.error
          ? t("parent.login.error.invalidCredentials")
          : t("parent.login.error.generic"),
      );
      setIsSubmitting(false);
      return;
    }

    router.push(`/${tenant}/parent`);
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
          {/* Single inline alert keeps error messaging minimal and clear. */}
          {alertMessage ? (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              // data-testid makes the generic alert easy to target without relying on copy text.
              data-testid="parent-login-alert"
              role="alert"
            >
              {alertMessage}
            </div>
          ) : null}
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
                onChange={() => setEmailError(null)}
              />
              {emailError ? (
                <span className="text-xs text-red-600" role="alert">
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
                onChange={() => setCodeError(null)}
              />
              {codeError ? (
                <span className="text-xs text-red-600" role="alert">
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
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t("generic.loading")}
                </>
              ) : (
                t("parent.login.submit")
              )}
            </button>
          </form>
        </Card>
      </div>
    </ParentShell>
  );
}
