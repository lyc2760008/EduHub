// Integration-style tests for parent magic-link auth backend behavior (tenant isolation, single-use tokens).
// These tests avoid real email inbox dependencies by inserting a tokenHash into the DB (raw token never stored),
// then driving the normal verify page which consumes the token and establishes a session cookie.
//
// Security notes:
// - Never log raw tokens, emails, or secrets.
// - Insert only token hashes into the DB, mirroring production behavior.
import { createHash, randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { resolveStep203Fixtures } from "..\/helpers/step203";
import { buildTenantPath, buildTenantApiPath } from "..\/helpers/tenant";

type TenantRow = { id: string; slug: string };
type ParentRow = { id: string; email: string | null };
type ParentWithEmail = { id: string; email: string };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for parent auth backend tests.");
}

function getPepper() {
  // Keep hashing aligned with src/lib/auth/magicLink.ts (AUTH_SECRET preferred).
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
}

function hashIdentifier(value: string) {
  const pepper = getPepper();
  const input = pepper ? `${pepper}:${value}` : value;
  return createHash("sha256").update(input).digest("hex");
}

function generateMagicLinkToken() {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashIdentifier(rawToken);
  return { rawToken, tokenHash };
}

function generateRowId(prefix: string) {
  // DB schema uses TEXT ids without a server-side default; Prisma usually supplies cuid().
  return `${prefix}${randomBytes(16).toString("hex")}`;
}

function resolveOtherTenantSlug(primarySlug: string) {
  const configured = process.env.E2E_SECOND_TENANT_SLUG;
  if (configured) return configured === primarySlug ? `${primarySlug}-secondary` : configured;
  return primarySlug.toLowerCase().startsWith("e2e")
    ? `${primarySlug}-secondary`
    : "acme";
}

function isSignedInParentLanding(pathname: string, tenantSlug: string) {
  // Step 22.5 canonicalizes signed-in parent landing to /portal, but legacy /parent
  // can still appear in older environments. Accept both to keep this backend contract stable.
  const parentRoot = `/${tenantSlug}/parent`;
  const portalRoot = `/${tenantSlug}/portal`;
  return (
    pathname.startsWith(portalRoot) ||
    (pathname.startsWith(parentRoot) &&
      !pathname.startsWith(`${parentRoot}/auth/verify`))
  );
}

let db: Client;

// Force a clean session so token consumption is exercised on a fresh browser context.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeAll(async () => {
  // Shared DB client keeps lookup/insert fast and consistent.
  db = new Client({ connectionString: databaseUrl });
  await db.connect();
});

test.afterAll(async () => {
  // Explicit disconnect keeps Playwright from hanging on open DB handles.
  await db.end();
});

async function requireTenant(slug: string): Promise<TenantRow> {
  const result = await db.query<TenantRow>(
    `SELECT "id", "slug" FROM "Tenant" WHERE "slug" = $1 LIMIT 1`,
    [slug],
  );
  const tenant = result.rows[0];
  if (!tenant) throw new Error(`Expected tenant '${slug}' to exist in DB.`);
  return tenant;
}

async function requireParent(tenantId: string, email: string): Promise<ParentWithEmail> {
  const normalized = email.trim().toLowerCase();
  const result = await db.query<ParentRow>(
    `SELECT "id", "email" FROM "Parent" WHERE "tenantId" = $1 AND lower("email") = $2 LIMIT 1`,
    [tenantId, normalized],
  );
  const parent = result.rows[0];
  if (!parent?.id || !parent.email) {
    throw new Error("Expected seeded parent to exist and have an email.");
  }
  // Narrow to a non-null email shape for callers after runtime guard above.
  return { id: parent.id, email: parent.email };
}

async function requireParentLinked(tenantId: string, parentId: string) {
  const result = await db.query<{ id: string }>(
    `SELECT "id" FROM "StudentParent" WHERE "tenantId" = $1 AND "parentId" = $2 LIMIT 1`,
    [tenantId, parentId],
  );
  if (!result.rows[0]?.id) {
    throw new Error("Expected parent to be linked to at least one student in tenant.");
  }
}

async function insertMagicLinkToken(input: {
  tenantId: string;
  parentId: string;
  tokenHash: string;
}) {
  // Use an extended expiry to avoid timezone parsing edge cases with `timestamp` columns.
  await db.query(
    `
      INSERT INTO "ParentMagicLinkToken"
        ("id","tenantId","parentUserId","tokenHash","rememberMe","expiresAt","createdIpHash")
      VALUES
        ($1,$2,$3,$4,$5, NOW() + INTERVAL '1 day', $6)
    `,
    [
      generateRowId("e2e-mlt-"),
      input.tenantId,
      input.parentId,
      input.tokenHash,
      true,
      hashIdentifier("e2e"),
    ],
  );
}

async function getTokenConsumedAt(tenantId: string, tokenHash: string) {
  const result = await db.query<{ consumedAt: Date | null }>(
    `SELECT "consumedAt" FROM "ParentMagicLinkToken" WHERE "tenantId" = $1 AND "tokenHash" = $2 LIMIT 1`,
    [tenantId, tokenHash],
  );
  return result.rows[0]?.consumedAt ?? null;
}

type IssuedMagicLinkToken =
  | { mode: "db"; rawToken: string; tokenHash: string }
  | { mode: "endpoint"; rawToken: string };

async function mintTokenViaEndpoint(
  page: Page,
  tenantSlug: string,
  parentEmail: string,
): Promise<string | null> {
  const secret = process.env.E2E_TEST_SECRET?.trim();
  if (!secret) {
    throw new Error("E2E_TEST_SECRET is required for endpoint-minted parent magic links.");
  }

  const response = await page.request.post(
    buildTenantApiPath(tenantSlug, "/api/test/mint-parent-magic-link"),
    {
      headers: {
        "content-type": "application/json",
        "x-e2e-secret": secret,
        // Keep tenant resolution explicit for shared-host STAGING runs.
        "x-tenant-slug": tenantSlug,
      },
      data: { parentEmail, rememberMe: true },
    },
  );

  if (response.status() === 404) {
    // Local runs may keep the test-only endpoint disabled even when E2E_TEST_SECRET is set.
    return null;
  }

  if (!response.ok()) {
    throw new Error(
      `E2E mint-parent-magic-link endpoint unavailable (status ${response.status()}).`,
    );
  }

  const payload = (await response.json()) as { ok?: boolean; token?: string };
  if (!payload?.ok || !payload.token) {
    throw new Error("E2E mint-parent-magic-link endpoint did not return a token.");
  }

  return payload.token;
}

async function issueMagicLinkToken(input: {
  page: Page;
  tenantSlug: string;
  tenantId: string;
  parentId: string;
  parentEmail: string;
}): Promise<IssuedMagicLinkToken> {
  // STAGING uses a different AUTH_SECRET than local runs, so DB-inserted hashes from
  // the runner will not match there. Prefer the guarded endpoint when secret is available,
  // but gracefully fall back when local environments keep that endpoint disabled (404).
  if (process.env.E2E_TEST_SECRET?.trim()) {
    const rawToken = await mintTokenViaEndpoint(
      input.page,
      input.tenantSlug,
      input.parentEmail,
    );
    if (rawToken) {
      return { mode: "endpoint", rawToken };
    }
  }

  // Local/CI fallback path keeps this spec runnable without test-only endpoint wiring.
  const { rawToken, tokenHash } = generateMagicLinkToken();
  await insertMagicLinkToken({
    tenantId: input.tenantId,
    parentId: input.parentId,
    tokenHash,
  });
  return { mode: "db", rawToken, tokenHash };
}

test("[regression] Magic-link verify establishes a session and consumes the token", async ({
  page,
  browser,
}) => {
  const fixtures = resolveStep203Fixtures();
  const tenantSlug = fixtures.tenantSlug;
  const tenant = await requireTenant(tenantSlug);
  const parent = await requireParent(tenant.id, fixtures.parentA1Email);
  await requireParentLinked(tenant.id, parent.id);

  const issued = await issueMagicLinkToken({
    page,
    tenantSlug,
    tenantId: tenant.id,
    parentId: parent.id,
    parentEmail: parent.email,
  });

  const verifyPath = buildTenantPath(
    tenantSlug,
    `/parent/auth/verify?token=${encodeURIComponent(issued.rawToken)}`,
  );

  await page.goto(verifyPath, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("parent-verify-page")).toBeVisible();

  // Verify page redirects to a signed-in parent landing (/portal canonical, /parent legacy).
  await page.waitForURL(
    (url) => isSignedInParentLanding(url.pathname, tenantSlug),
    { timeout: 20_000 },
  );
  await page.goto(buildTenantPath(tenantSlug, "/portal"), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();

  if (issued.mode === "db") {
    const consumedAt = await getTokenConsumedAt(tenant.id, issued.tokenHash);
    expect(consumedAt).not.toBeNull();
  } else {
    // Endpoint mode does not expose tokenHash; verify consumption by confirming second use is rejected.
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(verifyPath, { waitUntil: "domcontentloaded" });
    await expect(page2.getByText(/invalid link/i)).toBeVisible();
    await context2.close();
  }
});

test("[regression] Magic-link tokens are single-use", async ({ page, browser }) => {
  const fixtures = resolveStep203Fixtures();
  const tenantSlug = fixtures.tenantSlug;
  const tenant = await requireTenant(tenantSlug);
  const parent = await requireParent(tenant.id, fixtures.parentA1Email);
  await requireParentLinked(tenant.id, parent.id);

  const issued = await issueMagicLinkToken({
    page,
    tenantSlug,
    tenantId: tenant.id,
    parentId: parent.id,
    parentEmail: parent.email,
  });

  const verifyPath = buildTenantPath(
    tenantSlug,
    `/parent/auth/verify?token=${encodeURIComponent(issued.rawToken)}`,
  );

  // First consume should succeed.
  await page.goto(verifyPath, { waitUntil: "domcontentloaded" });
  await page.waitForURL(
    (url) => isSignedInParentLanding(url.pathname, tenantSlug),
    { timeout: 20_000 },
  );

  // Second consume in a fresh browser context should be rejected.
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto(verifyPath, { waitUntil: "domcontentloaded" });
  await expect(page2.getByTestId("parent-verify-page")).toBeVisible();
  await expect(page2.getByText(/invalid link/i)).toBeVisible();
  await context2.close();
});

test("[regression] Magic-link tokens are tenant-scoped (cross-tenant verify is rejected)", async ({
  page,
}) => {
  const fixtures = resolveStep203Fixtures();
  const tenantSlug = fixtures.tenantSlug;
  const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);

  const tenant = await requireTenant(tenantSlug);
  const parent = await requireParent(tenant.id, fixtures.parentA1Email);
  await requireParentLinked(tenant.id, parent.id);

  const issued = await issueMagicLinkToken({
    page,
    tenantSlug,
    tenantId: tenant.id,
    parentId: parent.id,
    parentEmail: parent.email,
  });

  const verifyOtherTenantPath = buildTenantPath(
    otherTenantSlug,
    `/parent/auth/verify?token=${encodeURIComponent(issued.rawToken)}`,
  );

  await page.goto(verifyOtherTenantPath, { waitUntil: "domcontentloaded" });

  // Depending on tenant routing (and whether the secondary tenant exists),
  // the app may render an invalid-link state or redirect to the tenant login.
  await expect(
    page.locator('[data-testid="parent-verify-page"], [data-testid="parent-login-page"]'),
  ).toBeVisible();

  const sessionResponse = await page.request.get("/api/auth/session");
  expect(sessionResponse.status()).toBe(200);
  const sessionPayload = await sessionResponse.json();
  expect(sessionPayload).toBeNull();
});
