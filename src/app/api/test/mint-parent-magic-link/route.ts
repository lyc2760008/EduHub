/**
 * @state.route /api/test/mint-parent-magic-link
 * @state.area api
 * @state.capabilities create:mint_parent_magic_link
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Test-only endpoint to mint a parent magic-link token without sending email.
//
// Why this exists:
// - E2E runs against a remote deployment (STAGING) cannot depend on reading a real inbox.
// - Token hashes are peppered with AUTH_SECRET/NEXTAUTH_SECRET, so tests cannot safely
//   insert rows directly unless they also know the server secret.
//
// Security model:
// - Endpoint is disabled by default.
// - It requires E2E_TEST_MODE=1 AND a shared secret header (x-e2e-secret).
// - It must never be enabled in production (multiple environment guards).
//
// NOTE: This endpoint returns a raw token, which is sensitive. Never log it.
import { NextResponse, type NextRequest } from "next/server";

import { generateMagicLinkToken, getMagicLinkConfig, hashIdentifier, normalizeEmail } from "@/lib/auth/magicLink";
import { prisma } from "@/lib/db/prisma";
import { resolveTenant } from "@/lib/tenant/resolveTenant";

function isE2ETestEndpointEnabled(): boolean {
  const flag = (process.env.E2E_TEST_MODE || "").trim().toLowerCase();
  const enabled = flag === "1" || flag === "true";
  if (!enabled) return false;

  // Defense-in-depth: never allow this endpoint in production-like environments.
  const vercelEnv = (process.env.VERCEL_ENV || "").trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || "").trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || "").trim().toLowerCase();

  // `APP_ENV` is the authoritative "this is real production" signal.
  // It must be set to "production" in PROD, and should be set to "staging" for STAGING.
  if (appEnv === "production") return false;

  // NOTE:
  // - On Vercel Preview, `NODE_ENV` is typically "production", so we cannot rely on it.
  // - Some teams deploy STAGING as a separate Vercel *project* whose primary domain is still a
  //   Vercel "production" deployment. In that case we allow the endpoint only when `APP_ENV`
  //   is explicitly set to a non-production value (ex: "staging").
  if (vercelEnv === "production") {
    if (!appEnv) return false;
    return true;
  }

  // Non-Vercel or unknown Vercel env: keep the conservative NODE_ENV guard.
  if (!vercelEnv && nodeEnv === "production") return false;

  return true;
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.E2E_TEST_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-e2e-secret") || "";
  return provided === expected;
}

export async function POST(request: NextRequest) {
  // Return 404 when disabled/unauthorized to avoid advertising this endpoint.
  if (!isE2ETestEndpointEnabled() || !isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "INVALID_JSON" }, { status: 400 });
  }

  const parentEmailRaw =
    typeof (payload as { parentEmail?: unknown })?.parentEmail === "string"
      ? (payload as { parentEmail: string }).parentEmail
      : "";
  const rememberMe =
    typeof (payload as { rememberMe?: unknown })?.rememberMe === "boolean"
      ? (payload as { rememberMe: boolean }).rememberMe
      : true;

  const parentEmail = normalizeEmail(parentEmailRaw);
  if (!parentEmail) {
    return NextResponse.json({ ok: false, reason: "MISSING_EMAIL" }, { status: 400 });
  }

  const tenantResult = await resolveTenant(request);
  if (tenantResult instanceof Response) {
    // Preserve tenant isolation semantics for tests (404/400/403).
    return tenantResult;
  }

  const parent = await prisma.parent.findFirst({
    where: {
      tenantId: tenantResult.tenantId,
      email: { equals: parentEmail, mode: "insensitive" },
    },
    select: { id: true, email: true },
  });
  if (!parent?.id || !parent.email) {
    return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
  }

  const linked = await prisma.studentParent.findFirst({
    where: { tenantId: tenantResult.tenantId, parentId: parent.id },
    select: { id: true },
  });
  if (!linked?.id) {
    return NextResponse.json({ ok: false, reason: "NOT_ELIGIBLE" }, { status: 404 });
  }

  const { rawToken, tokenHash } = generateMagicLinkToken();
  const config = getMagicLinkConfig();
  const expiresAt = new Date(Date.now() + config.ttlMinutes * 60 * 1000);

  // Store only the hash, never the raw token.
  await prisma.parentMagicLinkToken.create({
    data: {
      tenantId: tenantResult.tenantId,
      parentUserId: parent.id,
      tokenHash,
      rememberMe,
      expiresAt,
      // Avoid persisting raw IP in test-only flows; a stable hash is sufficient.
      createdIpHash: hashIdentifier("e2e"),
    },
  });

  return NextResponse.json({ ok: true, token: rawToken }, { status: 200 });
}
