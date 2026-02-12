// Server action to consume a parent magic-link token and establish a session.
// We use a server action (not a route handler) because NextAuth v5 `signIn` is designed
// for server-action contexts where it can safely set cookies.
//
// Security notes:
// - Never log the raw token or parent email.
// - Return only non-sensitive reason codes for UI rendering.
"use server";

import { signIn } from "@/lib/auth";

export type ConsumeParentMagicLinkResult =
  | { ok: true; redirectTo: string }
  | { ok: false; reason: "expired" | "invalid" | "failed" };

function mapErrorCode(code: string | null): "expired" | "invalid" | "failed" {
  if (code === "PARENT_MAGIC_LINK_EXPIRED") return "expired";
  if (code === "PARENT_MAGIC_LINK_INVALID") return "invalid";
  return "failed";
}

export async function consumeParentMagicLinkToken(input: {
  tenantSlug: string;
  token: string;
}): Promise<ConsumeParentMagicLinkResult> {
  const tenantSlug = input.tenantSlug.trim().toLowerCase();
  const token = input.token.trim();

  if (!tenantSlug || !token) {
    return { ok: false, reason: "invalid" };
  }

  // Keep the destination relative to avoid leaking/depending on AUTH_URL/NEXTAUTH_URL.
  // Canonical parent home is /portal; /parent is a legacy redirect-only entrypoint.
  const redirectTo = `/${tenantSlug}/portal`;

  try {
    const redirectUrl = (await signIn("parent-magic-link", {
      token,
      tenantSlug,
      redirect: false,
      redirectTo,
    })) as string | undefined;

    if (!redirectUrl) {
      return { ok: false, reason: "failed" };
    }

    // Parse only to detect typed errors; the UI destination is always `redirectTo`.
    const parsed = new URL(redirectUrl, "http://localhost");
    const error = parsed.searchParams.get("error");
    if (error) {
      const code = parsed.searchParams.get("code");
      return { ok: false, reason: mapErrorCode(code) };
    }

    return { ok: true, redirectTo };
  } catch (error) {
    // Some NextAuth flows throw typed objects. Keep output generic and non-sensitive.
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : null;
    return { ok: false, reason: mapErrorCode(code) };
  }
}
