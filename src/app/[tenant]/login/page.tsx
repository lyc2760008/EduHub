"use client";

// Tenant-aware login page using NextAuth credentials.
import { use, useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default function LoginPage({ params }: PageProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Next.js 16 passes dynamic params as a Promise in client components.
  const { tenant } = use(params);

  // Submit credentials to NextAuth and redirect on success.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const tenantSlug = tenant;

    const result = await signIn("credentials", {
      email,
      password,
      tenantSlug,
      redirect: false,
    });

    if (!result || result.error) {
      setError(t("login.errorInvalid"));
      setIsSubmitting(false);
      return;
    }

    router.push(`/${tenant}/admin`);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-700">{t("login.emailLabel")}</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-700">{t("login.passwordLabel")}</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {t("login.submit")}
        </button>
      </form>
    </div>
  );
}
