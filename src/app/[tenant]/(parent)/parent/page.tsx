/**
 * @state.route /[tenant]/parent
 * @state.area parent
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { getTranslations } from "next-intl/server";

type ParentLandingPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function ParentLandingPage({
  params,
}: ParentLandingPageProps) {
  const t = await getTranslations();
  const { tenant } = await params;
  const portalHref = `/${tenant}/portal`;

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
          href={portalHref}
        >
          {t("parentAuth.landing.cta")}
        </a>
      </div>
    </div>
  );
}
