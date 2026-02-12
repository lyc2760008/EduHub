/**
 * @state.route /[tenant]/api/parent-auth/magic-link/consume
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Parent magic link consume endpoint (verifies token and establishes session).
import { NextRequest, NextResponse } from "next/server";

import { signIn } from "@/lib/auth";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ tenant: string }>;
};

type ConsumeFailureReason = "missing" | "expired" | "invalid" | "failed";

type ConsumeResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; reason: ConsumeFailureReason };

function mapErrorCode(code: string | null): ConsumeFailureReason {
  if (code === "PARENT_MAGIC_LINK_EXPIRED") return "expired";
  if (code === "PARENT_MAGIC_LINK_INVALID") return "invalid";
  return "failed";
}

export async function GET(req: NextRequest, context: Params) {
  const { tenant } = await context.params;
  const tenantSlug = tenant.trim().toLowerCase();
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json<ConsumeResponse>({ ok: false, reason: "missing" });
  }

  // Avoid emitting absolute URLs back to the client. Absolute URLs can pick up
  // `AUTH_URL/NEXTAUTH_URL` (often `http://localhost:3000` in dev), which
  // would send parents to the wrong host after consuming a valid token.
  // Canonical parent home is /portal; /parent remains a legacy redirect-only path.
  const redirectTo = `/${tenantSlug}/portal`;

  const redirectUrl = (await signIn("parent-magic-link", {
    token,
    tenantSlug,
    redirect: false,
    redirectTo,
  })) as string | undefined;

  if (!redirectUrl) {
    return NextResponse.json<ConsumeResponse>({
      ok: false,
      reason: "failed",
    });
  }

  // Parse the NextAuth redirect URL only to detect success vs. typed errors.
  // The destination we return to the client is always the tenant-scoped relative path above.
  const parsed = new URL(redirectUrl, "http://localhost");
  const error = parsed.searchParams.get("error");

  if (error) {
    const code = parsed.searchParams.get("code");
    return NextResponse.json<ConsumeResponse>({
      ok: false,
      reason: mapErrorCode(code),
    });
  }

  return NextResponse.json<ConsumeResponse>({
    ok: true,
    redirectTo,
  });
}
