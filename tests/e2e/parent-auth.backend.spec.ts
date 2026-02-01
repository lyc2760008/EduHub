// Integration-style tests for parent auth backend (RBAC, tenant isolation, credentials).
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { loginAsAdmin, loginAsParent, loginAsTutor } from "./helpers/auth";
import { expectAdminBlocked } from "./helpers/parent-auth";
import { uniqueString } from "./helpers/data";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";

type ParentRow = {
  id: string;
  email: string;
};

const DEFAULT_BASE_URL = "http://demo.lvh.me:3000";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for parent auth backend tests.");
}

function resolveBaseOrigin() {
  // Auth session endpoint lives at the app root, so strip any /t/<slug> path.
  const baseUrl = process.env.E2E_BASE_URL || DEFAULT_BASE_URL;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return new URL(DEFAULT_BASE_URL).origin;
  }
}

function resolveOtherTenantSlug(primarySlug: string) {
  const configured =
    process.env.E2E_SECOND_TENANT_SLUG ||
    process.env.SEED_SECOND_TENANT_SLUG ||
    "acme";
  return configured === primarySlug ? "acme" : configured;
}

let db: Client;

test.beforeAll(async () => {
  // Shared DB client keeps tenant/parent setup fast and consistent.
  db = new Client({ connectionString: databaseUrl });
  await db.connect();
});

test.afterAll(async () => {
  // Explicit disconnect keeps Playwright from hanging on open DB handles.
  await db.end();
});

async function ensureTenant(slug: string) {
  // Tests expect demo + secondary tenants to be seeded by prisma/seed.
  const result = await db.query<{
    id: string;
    slug: string;
  }>(`SELECT "id", "slug" FROM "Tenant" WHERE "slug" = $1`, [slug]);
  const tenant = result.rows[0];
  if (!tenant) {
    throw new Error(`Missing tenant seed for slug ${slug}.`);
  }
  return tenant;
}

async function upsertParent(tenantId: string, email: string): Promise<ParentRow> {
  // Upsert keeps the test idempotent even when rerun against the same DB.
  const newId = randomUUID();
  const result = await db.query<ParentRow>(
    `
    INSERT INTO "Parent" ("id", "tenantId", "firstName", "lastName", "email", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT ("tenantId", "email")
    DO UPDATE SET "firstName" = EXCLUDED."firstName", "lastName" = EXCLUDED."lastName", "updatedAt" = NOW()
    RETURNING "id", "email"
    `,
    [newId, tenantId, "E2E", "Parent", email],
  );
  return result.rows[0];
}

async function setParentAccessCode(parentId: string, code: string) {
  // Direct DB update avoids needing admin sessions for secondary tenants.
  const accessCodeHash = await bcrypt.hash(code, 10);
  await db.query(
    `
    UPDATE "Parent"
    SET "accessCodeHash" = $1, "accessCodeUpdatedAt" = $2
    WHERE "id" = $3
    `,
    [accessCodeHash, new Date(), parentId],
  );
}

test("Admin can reset access code and DB stores only hash", async ({ page }) => {
  const { tenantSlug } = await loginAsAdmin(page);
  const tenant = await ensureTenant(tenantSlug);
  const email = `${uniqueString("parent-reset")}@example.com`;
  const createResponse = await page.request.post(
    buildTenantApiPath(tenantSlug, "/api/parents"),
    {
      data: {
        firstName: "E2E",
        lastName: "Parent",
        email,
      },
    },
  );
  if (createResponse.status() !== 201) {
    const createBody = await createResponse.text();
    throw new Error(
      `Expected parent create 201, got ${createResponse.status()} - ${createBody}`,
    );
  }
  const createPayload = (await createResponse.json()) as {
    parent?: { id?: string };
  };
  const parentId = createPayload.parent?.id;
  if (!parentId) {
    throw new Error("Expected parent id in create response.");
  }

  const resetResponse = await page.request.post(
    buildTenantApiPath(
      tenantSlug,
      `/api/parents/${parentId}/reset-access-code`,
    ),
    { data: {} },
  );

  if (resetResponse.status() !== 200) {
    const resetBody = await resetResponse.text();
    throw new Error(
      `Expected reset 200, got ${resetResponse.status()} - ${resetBody}`,
    );
  }
  const payload = (await resetResponse.json()) as {
    parentId?: string;
    accessCode?: string;
    accessCodeUpdatedAt?: string;
  };

  expect(payload.parentId).toBe(parentId);
  expect(typeof payload.accessCode).toBe("string");
  expect(payload.accessCode).toBeTruthy();
  expect(payload.accessCodeUpdatedAt).toBeTruthy();

  const parentResult = await db.query<{
    accessCodeHash: string | null;
    accessCodeUpdatedAt: Date | null;
  }>(
    `SELECT "accessCodeHash", "accessCodeUpdatedAt" FROM "Parent" WHERE "id" = $1`,
    [parentId],
  );
  const dbParent = parentResult.rows[0];

  expect(dbParent?.accessCodeHash).toBeTruthy();
  expect(dbParent?.accessCodeHash).not.toBe(payload.accessCode);
  expect(dbParent?.accessCodeUpdatedAt).not.toBeNull();

  const hashMatches = await bcrypt.compare(
    payload.accessCode ?? "",
    dbParent?.accessCodeHash ?? "",
  );
  expect(hashMatches).toBe(true);
});

test("Tutor cannot reset parent access codes", async ({ page }) => {
  const { tenantSlug } = await loginAsTutor(page);
  const tenant = await ensureTenant(tenantSlug);
  const email = `${uniqueString("parent-tutor")}@example.com`;
  const parent = await upsertParent(tenant.id, email);

  const response = await page.request.post(
    buildTenantApiPath(
      tenantSlug,
      `/api/parents/${parent.id}/reset-access-code`,
    ),
    { data: {} },
  );

  expect(response.status()).toBe(403);
});

test("Parent role cannot reset parent access codes", async ({ page }) => {
  const { tenantSlug } = await loginAsParent(page);
  const tenant = await ensureTenant(tenantSlug);
  const email = `${uniqueString("parent-parent")}@example.com`;
  const parent = await upsertParent(tenant.id, email);

  const response = await page.request.post(
    buildTenantApiPath(
      tenantSlug,
      `/api/parents/${parent.id}/reset-access-code`,
    ),
    { data: {} },
  );

  expect(response.status()).toBe(403);
});

test("Reset access code is tenant-scoped", async ({ page }) => {
  const { tenantSlug } = await loginAsAdmin(page);
  const primaryTenant = await ensureTenant(tenantSlug);
  const otherTenant = await ensureTenant(resolveOtherTenantSlug(tenantSlug));
  const email = `${uniqueString("parent-cross")}@example.com`;
  const otherParent = await upsertParent(otherTenant.id, email);

  const response = await page.request.post(
    buildTenantApiPath(
      primaryTenant.slug,
      `/api/parents/${otherParent.id}/reset-access-code`,
    ),
    { data: {} },
  );

  expect([403, 404]).toContain(response.status());
});

test("Parent credentials enforce tenant scope and return session claims", async ({
  page,
}) => {
  const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";
  const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);
  const tenant = await ensureTenant(tenantSlug);
  const otherTenant = await ensureTenant(otherTenantSlug);
  const sharedEmail = `${uniqueString("parent-auth")}@example.com`;

  const parentPrimary = await upsertParent(tenant.id, sharedEmail);
  const parentSecondary = await upsertParent(otherTenant.id, sharedEmail);

  const primaryCode = `CODE-${uniqueString("primary")}`.toUpperCase();
  const secondaryCode = `CODE-${uniqueString("secondary")}`.toUpperCase();

  await setParentAccessCode(parentPrimary.id, primaryCode);
  await setParentAccessCode(parentSecondary.id, secondaryCode);

  const hashCheck = await db.query<{ accessCodeHash: string | null }>(
    `SELECT "accessCodeHash" FROM "Parent" WHERE "id" = $1`,
    [parentPrimary.id],
  );
  const accessCodeHash = hashCheck.rows[0]?.accessCodeHash;
  if (!accessCodeHash) {
    throw new Error("Expected access code hash to be set for parent.");
  }
  const hashMatches = await bcrypt.compare(primaryCode, accessCodeHash);
  if (!hashMatches) {
    throw new Error("Access code hash mismatch before login.");
  }

  await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
  await page.getByTestId("parent-login-email").fill(sharedEmail);
  await page.getByTestId("parent-login-access-code").fill(secondaryCode);
  const firstAttempt = page.waitForResponse((response) =>
    response.url().includes("/api/auth/callback/parent-credentials"),
  );
  await page.getByTestId("parent-login-submit").click();
  const firstResponse = await firstAttempt;
  expect(firstResponse.status()).toBe(200);

  await expect(page.getByTestId("parent-login-page")).toBeVisible();
  // Use the generic alert test id to avoid coupling to localized copy.
  await expect(page.getByTestId("parent-login-alert")).toBeVisible();

  await page.getByTestId("parent-login-access-code").fill(primaryCode);
  const secondAttempt = page.waitForResponse((response) =>
    response.url().includes("/api/auth/callback/parent-credentials"),
  );
  await page.getByTestId("parent-login-submit").click();
  const secondResponse = await secondAttempt;
  if (secondResponse.status() !== 200) {
    const authBody = await secondResponse.text();
    throw new Error(
      `Expected auth 200, got ${secondResponse.status()} - ${authBody}`,
    );
  }

  // Parent portal entry point now lives under /portal.
  const portalPath = buildTenantPath(tenantSlug, "/portal");
  await page.waitForURL((url) => url.pathname.startsWith(portalPath));

  const session = (await page.evaluate(async () => {
    const response = await fetch("/api/auth/session");
    return response.json();
  })) as {
    user?: { role?: string; tenantId?: string; parentId?: string };
  } | null;

  expect(session?.user?.role).toBe("Parent");
  expect(session?.user?.tenantId).toBe(tenant.id);
  expect(session?.user?.parentId).toBe(parentPrimary.id);

  // Parent sessions should not access admin routes.
  await page.goto(buildTenantPath(tenantSlug, "/admin"));
  await expectAdminBlocked(page);
});

test("Parent login fails when access code hash is missing", async ({ page }) => {
  const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";
  const tenant = await ensureTenant(tenantSlug);
  const email = `${uniqueString("parent-null")}@example.com`;

  await upsertParent(tenant.id, email);

  await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
  await page.getByTestId("parent-login-email").fill(email);
  await page.getByTestId("parent-login-access-code").fill("INVALIDCODE");
  await page.getByTestId("parent-login-submit").click();

  await expect(page.getByTestId("parent-login-page")).toBeVisible();
  // Use the generic alert test id to avoid coupling to localized copy.
  await expect(page.getByTestId("parent-login-alert")).toBeVisible();
});

test("Unauthenticated parent routes redirect to parent login", async ({
  page,
}) => {
  const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

  // Unauthenticated access should redirect to the parent login from /portal.
  await page.goto(buildTenantPath(tenantSlug, "/portal"));
  await page.waitForURL((url) =>
    url.pathname.endsWith(`/${tenantSlug}/parent/login`),
  );
  await expect(page.getByTestId("parent-login-page")).toBeVisible();
});
