// Parent magic link consume endpoint (verifies token and establishes session).
import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/auth/magicLink";
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

  const origin = getRequestOrigin(req);
  const redirectTo = origin
    ? `${origin}/${tenantSlug}/parent`
    : `/${tenantSlug}/parent`;

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

  const resolvedOrigin = origin ?? "http://localhost";
  const parsed = new URL(redirectUrl, resolvedOrigin);
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
    redirectTo: origin
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`,
  });
}
