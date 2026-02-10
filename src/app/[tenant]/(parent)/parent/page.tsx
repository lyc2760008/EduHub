import { getTranslations } from "next-intl/server";

export default async function ParentLandingPage() {
  const t = await getTranslations();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10" data-testid="parent-landing">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text)] shadow-sm">
        {/* Minimal signed-in landing keeps the /parent route useful without adding new features. */}
        <h1 className="text-xl font-semibold">
          {t("parentAuth.landing.title")}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t("parentAuth.landing.body")}
        </p>
        <a
          className="mt-4 inline-flex h-10 items-center justify-center rounded bg-[var(--text)] px-4 text-sm font-semibold text-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
          href="../portal"
        >
          {t("parentAuth.landing.cta")}
        </a>
      </div>
    </div>
  );
}
