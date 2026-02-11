// Tenant isolation checks for parent portal routes and magic-link auth.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import {
  buildTenantUrl,
  resolveOtherTenantSlug,
} from "..\/helpers/parent-auth";
import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "..\/helpers/portal";

import { createHash, randomBytes } from "node:crypto";
import * as pg from "pg";

// `pg` does not ship ESM-friendly type exports under TS `moduleResolution: bundler`.
// Use `any` constructor typing to keep this spec compatible with `pnpm typecheck`.
const PoolCtor = (pg as unknown as { Pool?: unknown }).Pool as any;

function requireDatabaseUrl() {
  // Token minting for tenant-scoping checks uses direct DB inserts (no inbox dependency).
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for tenant-scoped magic-link tests.");
  }
  return value;
}

function hashToken(rawToken: string) {
  // Keep hashing aligned with src/lib/auth/magicLink.ts (AUTH_SECRET preferred).
  const pepper = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const input = pepper ? `${pepper}:${rawToken}` : rawToken;
  return createHash("sha256").update(input).digest("hex");
}

async function mintMagicLinkToken(tenantSlug: string, parentEmail: string) {
  // Mint a token row for the given tenant+parent and return the raw token (never log it).
  if (!PoolCtor) {
    throw new Error("pg Pool constructor unavailable; cannot run DB-backed tenant isolation tests.");
  }
  const pool = new PoolCtor({ connectionString: requireDatabaseUrl() });
  try {
    // Pool is intentionally `any` to keep TypeScript `moduleResolution: bundler` happy.
    const tenantResult = (await pool.query(
      `SELECT "id" FROM "Tenant" WHERE "slug" = $1 LIMIT 1`,
      [tenantSlug],
    )) as { rows: Array<{ id: string }> };
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) throw new Error(`Tenant '${tenantSlug}' not found.`);

    const normalizedEmail = parentEmail.trim().toLowerCase();
    const parentResult = (await pool.query(
      `SELECT "id" FROM "Parent" WHERE "tenantId" = $1 AND lower("email") = $2 LIMIT 1`,
      [tenantId, normalizedEmail],
    )) as { rows: Array<{ id: string }> };
    const parentId = parentResult.rows[0]?.id;
    if (!parentId) throw new Error("Parent not found for token mint.");

    const linkResult = (await pool.query(
      `SELECT "id" FROM "StudentParent" WHERE "tenantId" = $1 AND "parentId" = $2 LIMIT 1`,
      [tenantId, parentId],
    )) as { rows: Array<{ id: string }> };
    if (!linkResult.rows[0]?.id) {
      throw new Error("Parent must be linked to a student for token mint.");
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const tokenRowId = `e2e-mlt-${randomBytes(16).toString("hex")}`;

    await pool.query(
      `INSERT INTO "ParentMagicLinkToken"
        ("id", "tenantId", "parentUserId", "tokenHash", "rememberMe", "expiresAt", "createdIpHash")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tokenRowId, tenantId, parentId, tokenHash, true, expiresAt, hashToken("e2e")],
    );

    return rawToken;
  } finally {
    await pool.end();
  }
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent portal tenant isolation", () => {
  test("Cross-tenant navigation redirects to login", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    // Clear tenant headers so cross-tenant navigation resolves to the other tenant.
    await page.context().setExtraHTTPHeaders({});
    await page.goto(buildPortalPath(otherTenantSlug, ""));
    await page.waitForURL((url) => url.pathname.endsWith("/parent/login"));
    await expect(page.getByTestId("parent-login-page")).toBeVisible();
  });

  test("Magic-link tokens are scoped to tenant (cross-tenant verify is rejected)", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);

    // Create a parent+student linkage so the parent is eligible for magic links.
    // This avoids relying on any pre-seeded parent fixture email.
    const unique = Date.now().toString(36);
    const parentEmail = `e2e.parent.tenant-scope.${unique}@example.com`;
    const studentCreate = await page.request.post(`/api/students`, {
      data: { firstName: `E2E-${unique}`, lastName: "TenantScope" },
    });
    expect(studentCreate.status()).toBe(201);
    const studentPayload = (await studentCreate.json()) as { student?: { id?: string } };
    const studentId = studentPayload.student?.id;
    if (!studentId) throw new Error("Expected student id for tenant-scope test.");

    const linkResp = await page.request.post(`/api/students/${studentId}/parents`, {
      data: { parentEmail },
    });
    expect(linkResp.status()).toBe(201);

    // Mint a token in the original tenant, then try to consume it under a different tenant slug.
    const rawToken = await mintMagicLinkToken(tenantSlug, parentEmail);

    await page.context().clearCookies();
    await page.context().setExtraHTTPHeaders({});
    await page.goto(
      buildTenantUrl(
        otherTenantSlug,
        `/parent/auth/verify?token=${encodeURIComponent(rawToken)}`,
      ),
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.getByTestId("parent-verify-page")).toBeVisible();
    await expect(page.getByText(/Invalid link|Unable to sign in/i)).toBeVisible();

    const sessionResponse = await page.request.get("/api/auth/session");
    expect(sessionResponse.status()).toBe(200);
    const payload = (await sessionResponse.json()) as { user?: unknown } | null;
    expect(payload?.user).toBeFalsy();
  });
});


