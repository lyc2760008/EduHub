/**
 * @state.route /[tenant]/parent
 * @state.area parent
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { redirect } from "next/navigation";

type ParentLandingPageProps = {
  params: Promise<{ tenant: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PARENT_HOME_REDIRECT_ALLOWLIST: readonly string[] = [];

export default async function ParentLandingPage({
  params,
  searchParams,
}: ParentLandingPageProps) {
  const { tenant } = await params;
  const resolvedSearchParams = (searchParams ? await searchParams : {}) as Record<
    string,
    string | string[] | undefined
  >;
  const forwardedParams = new URLSearchParams();

  // This allowlist is intentionally explicit so /parent -> /portal canonicalization
  // does not introduce new or accidental query redirect semantics.
  for (const key of PARENT_HOME_REDIRECT_ALLOWLIST) {
    const value = resolvedSearchParams[key];
    if (typeof value === "string") {
      forwardedParams.set(key, value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        forwardedParams.append(key, item);
      }
    }
  }

  const portalHref = forwardedParams.size
    ? `/${tenant}/portal?${forwardedParams.toString()}`
    : `/${tenant}/portal`;

  redirect(portalHref);
}
