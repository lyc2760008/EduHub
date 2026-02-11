// Shared helpers for parent auth E2E flows.
// Note: The product parent login is now magic-link based (Step 22.0+). Some helper names
// keep legacy "access code" wording to minimize churn across specs, but the underlying
// implementation uses magic links and never depends on real email inbox delivery.
import { expect, type Page } from "@playwright/test";

import { createHash, randomBytes } from "node:crypto";
import * as pg from "pg";

import { uniqueString } from "./data";
import { buildTenantApiPath, buildTenantPath } from "./tenant";

type StudentCreateResponse = {
  student?: { id?: string };
};

type ParentLinkResponse = {
  link?: { parentId?: string; parent?: { id?: string; email?: string } };
};

// `pg` does not ship ESM-friendly type exports under TS `moduleResolution: bundler`.
// Use `any` here to keep test code typecheckable without pulling database types into the app build.
const PoolCtor = (pg as unknown as { Pool?: unknown }).Pool as any;
let sharedPool: any | null = null;

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "DATABASE_URL is required for DB-backed magic-link E2E auth helpers (when E2E_TEST_SECRET is not set).",
    );
  }
  return value;
}

function getPool() {
  // Lazy init keeps helper import cheap for suites that never need DB access.
  if (!PoolCtor) {
    throw new Error("pg Pool constructor unavailable; cannot run DB-backed E2E helpers.");
  }
  if (!sharedPool) {
    sharedPool = new PoolCtor({ connectionString: requireDatabaseUrl() });
  }
  return sharedPool;
}

function getPepper() {
  // Keep hashing aligned with src/lib/auth/magicLink.ts (AUTH_SECRET preferred).
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
}

function hashIdentifier(value: string) {
  // Do not log the hashed output; it is still derived from sensitive inputs.
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
  // The DB schema uses TEXT ids without a server-side default (Prisma normally supplies cuid()).
  // Generate a stable, unique id here so tests can insert records safely without importing Prisma.
  return `${prefix}${randomBytes(16).toString("hex")}`;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getMagicLinkTtlMinutes() {
  // Keep default aligned with src/lib/auth/magicLink.ts secure defaults.
  return readPositiveInt(process.env.MAGIC_LINK_TTL_MINUTES, 15);
}

// Default base URL targets the dedicated e2e tenant host.
const DEFAULT_BASE_URL = "http://e2e-testing.lvh.me:3000";

export function resolveOtherTenantSlug(primarySlug: string) {
  // Prefer configured secondary tenant slug when available; fall back to seed default.
  const configured =
    process.env.E2E_SECOND_TENANT_SLUG ||
    (primarySlug.toLowerCase().startsWith("e2e")
      ? `${primarySlug}-secondary`
      : process.env.SEED_SECOND_TENANT_SLUG || "acme");
  // Keep a deterministic non-primary slug for cross-tenant checks.
  return configured === primarySlug ? `${primarySlug}-secondary` : configured;
}

function resolveBaseUrl() {
  // Normalize the base URL so we can safely derive cross-tenant hosts.
  const raw = process.env.E2E_BASE_URL || DEFAULT_BASE_URL;
  try {
    return new URL(raw.startsWith("http") ? raw : `http://${raw}`);
  } catch {
    return new URL(DEFAULT_BASE_URL);
  }
}

function isRetryableAuthError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /Timeout/i.test(error.message);
}

function isRetryableNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ECONNREFUSED|socket hang up/i.test(error.message);
}

async function postWithRetry(
  page: Page,
  url: string,
  options: Parameters<Page["request"]["post"]>[1],
  attempts = 3,
) {
  // Retry transient request-socket failures that can happen under heavy parallel E2E load.
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.request.post(url, options);
    } catch (error) {
      if (!isRetryableNetworkError(error) || attempt === attempts - 1) {
        throw error;
      }
      await page.waitForTimeout(200 * (attempt + 1));
    }
  }
  throw new Error("Unexpected parent-auth POST retry flow.");
}

export function buildTenantUrl(tenantSlug: string, suffix: string) {
  // Resolve a URL that works for subdomain or /t/<slug> tenant routing schemes.
  const baseUrl = resolveBaseUrl();
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  const normalizedPath = baseUrl.pathname.replace(/\/+$/, "");

  if (normalizedPath.startsWith("/t/")) {
    return `${baseUrl.origin}/t/${tenantSlug}${normalizedSuffix}`;
  }

  const normalizedHost = baseUrl.hostname.toLowerCase();
  const baseTenant = (process.env.E2E_TENANT_SLUG || "e2e-testing").toLowerCase();
  const wantsSubdomain =
    normalizedHost.startsWith(`${tenantSlug.toLowerCase()}.`) ||
    normalizedHost.startsWith(`${baseTenant}.`) ||
    normalizedHost.endsWith(".lvh.me") ||
    normalizedHost === "localhost" ||
    normalizedHost.endsWith(".localhost");

  if (!wantsSubdomain) {
    // Shared hosts (ex: Vercel preview/staging) rely on /<slug> UI routing.
    return `${baseUrl.origin}/${tenantSlug}${normalizedSuffix}`;
  }

  const hostParts = baseUrl.hostname.split(".");
  let newHost = baseUrl.hostname;

  if (hostParts.length > 2) {
    // Replace the existing subdomain with the target tenant slug.
    newHost = [tenantSlug, ...hostParts.slice(1)].join(".");
  } else if (hostParts.length === 2) {
    // Prefix the base domain (e.g. lvh.me) with the tenant slug.
    newHost = `${tenantSlug}.${baseUrl.hostname}`;
  } else if (baseUrl.hostname === "localhost") {
    // localhost supports subdomains per RFC 2606 and keeps tenant routing stable.
    newHost = `${tenantSlug}.localhost`;
  }

  const port = baseUrl.port ? `:${baseUrl.port}` : "";
  // App routes still include /{tenant} even when host-based tenancy is enabled.
  return `${baseUrl.protocol}//${newHost}${port}/${tenantSlug}${normalizedSuffix}`;
}

export async function createStudentAndLinkParent(page: Page, tenantSlug: string) {
  // API setup keeps the UI flow focused on auth and RBAC validation.
  const uniqueToken = uniqueString("parent-auth-ui");
  const firstName = `E2E${uniqueToken}`;
  const lastName = "ParentAuth";
  const parentEmail = `e2e.parent.${uniqueToken}@example.com`;

  return createStudentAndLinkParentForEmail(page, tenantSlug, parentEmail, {
    firstName,
    lastName,
  });
}

export async function createStudentAndLinkParentForEmail(
  page: Page,
  tenantSlug: string,
  parentEmail: string,
  studentName?: { firstName: string; lastName: string },
) {
  // Allow go-live/staging runs to link a specific parent email to a new student.
  const uniqueToken = uniqueString("parent-auth-ui");
  const firstName = studentName?.firstName ?? `E2E${uniqueToken}`;
  const lastName = studentName?.lastName ?? "ParentAuth";

  const createStudentResponse = await postWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/students"),
    { data: { firstName, lastName } },
  );
  expect(createStudentResponse.status()).toBe(201);
  const studentPayload =
    (await createStudentResponse.json()) as StudentCreateResponse;
  const studentId = studentPayload.student?.id;
  if (!studentId) {
    throw new Error("Expected student id in create response.");
  }

  const linkResponse = await postWithRetry(
    page,
    buildTenantApiPath(tenantSlug, `/api/students/${studentId}/parents`),
    { data: { parentEmail } },
  );
  expect(linkResponse.status()).toBe(201);
  const linkPayload = (await linkResponse.json()) as ParentLinkResponse;
  const parentId = linkPayload.link?.parentId ?? linkPayload.link?.parent?.id;
  if (!parentId) {
    throw new Error("Expected parent id in link response.");
  }

  return { studentId, parentId, parentEmail };
}

export async function resetParentAccessCode(
  page: Page,
  tenantSlug: string,
  parentId: string,
) {
  // Access-code reset endpoints were removed when parent auth moved to magic links.
  // Keep this helper as a clear failure to surface outdated specs quickly.
  // If you need a deterministic parent login for E2E, use `loginAsParentWithAccessCode`
  // (which now uses a test-issued magic link token) instead of resetting access codes.
  void page;
  void tenantSlug;
  void parentId;
  throw new Error("Parent access codes are deprecated; reset-access-code is unavailable.");
}

export async function prepareParentAccessCode(page: Page, tenantSlug: string) {
  // Backward-compatible helper name: prepare a parent that is linked to a student.
  // The returned `accessCode` is a legacy placeholder and should not be used to authenticate.
  const { studentId, parentId, parentEmail } = await createStudentAndLinkParent(page, tenantSlug);
  return { studentId, parentId, parentEmail, accessCode: "MAGIC_LINK" };
}

export async function loginAsParentWithAccessCode(
  page: Page,
  tenantSlug: string,
  email: string,
  accessCode: string,
) {
  // Legacy signature retained: `accessCode` is ignored because the product now uses magic links.
  // Preferred path:
  // - When E2E_TEST_SECRET is set (remote STAGING runs), mint a token via the test-only endpoint
  //   and then navigate through the normal verify page to establish a real session cookie.
  // Fallback path:
  // - When the endpoint is unavailable (local/CI), insert a token row directly into the DB.
  void accessCode;

  // Helper ensures the session is actually established (parent-shell exists on login page too).
  async function assertParentSession() {
    const sessionResponse = await page.request.get("/api/auth/session");
    if (sessionResponse.status() !== 200) {
      return false;
    }
    let payload: { user?: { email?: string; role?: string } } | null = null;
    try {
      // NextAuth can return `null` JSON for anonymous sessions; guard to avoid TypeError.
      payload = (await sessionResponse.json()) as {
        user?: { email?: string; role?: string };
      } | null;
    } catch {
      payload = null;
    }
    return (
      payload?.user?.role === "Parent" &&
      payload.user?.email?.toLowerCase() === email.toLowerCase()
    );
  }

  // Shared login helper keeps the parent auth flow consistent across tests.
  // Reuse an existing parent session when it already matches the expected user.
  if (await assertParentSession()) {
    const portalPath = buildTenantPath(tenantSlug, "/portal");
    await page.goto(portalPath);
    // Prefer shell visibility over strict URL waits to avoid rare callback redirect hangs.
    await Promise.race([
      page.waitForURL((url) => url.pathname.startsWith(portalPath), {
        timeout: 15_000,
      }),
      page.getByTestId("parent-shell").waitFor({
        state: "visible",
        timeout: 15_000,
      }),
    ]);
    await expect(page.getByTestId("parent-shell")).toBeVisible();
    return;
  }
  // Clear mismatched sessions before attempting the parent login UI.
  await page.context().clearCookies();

  let rawToken: string;

  const e2eSecret = process.env.E2E_TEST_SECRET;
  if (e2eSecret) {
    // Remote-friendly path: mint via the double-guarded test endpoint (no inbox, no DB access,
    // and no need for the server's AUTH_SECRET in the test runner).
    const response = await postWithRetry(
      page,
      buildTenantApiPath(tenantSlug, "/api/test/mint-parent-magic-link"),
      {
        headers: {
          "content-type": "application/json",
          "x-e2e-secret": e2eSecret,
          // Ensure tenant resolution for deployments that rely on header-based tenant routing.
          "x-tenant-slug": tenantSlug,
        },
        data: { parentEmail: email, rememberMe: true },
      },
      2,
    );

    if (!response.ok()) {
      // Avoid including PII like the email value; keep the failure actionable for operators.
      throw new Error(
        `E2E parent magic-link mint endpoint unavailable (status ${response.status()}). ` +
          "Ensure the target deployment has E2E_TEST_MODE=1 and E2E_TEST_SECRET configured.",
      );
    }

    const payload = (await response.json()) as { ok?: boolean; token?: string };
    if (!payload?.ok || !payload.token) {
      throw new Error("E2E parent magic-link mint endpoint returned no token.");
    }
    rawToken = payload.token;
  } else {
    // Local/CI fallback: insert a token row directly into the DB.
    // This requires DATABASE_URL and assumes AUTH_SECRET/NEXTAUTH_SECRET matches the app's secret,
    // because token hashes are peppered.
    const pool = getPool();
    // Pool is intentionally `any` to keep TypeScript `moduleResolution: bundler` happy.
    // Cast query results locally to avoid leaking pg typing concerns into app builds.
    const tenantResult = (await pool.query(
      `SELECT "id" FROM "Tenant" WHERE "slug" = $1 LIMIT 1`,
      [tenantSlug],
    )) as { rows: Array<{ id: string }> };
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) {
      throw new Error(`Tenant '${tenantSlug}' not found for parent login.`);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const parentResult = (await pool.query(
      `SELECT "id", "email" FROM "Parent" WHERE "tenantId" = $1 AND lower("email") = $2 LIMIT 1`,
      [tenantId, normalizedEmail],
    )) as { rows: Array<{ id: string; email: string | null }> };
    const parent = parentResult.rows[0];
    if (!parent?.id || !parent.email) {
      throw new Error("Parent not found or missing email for magic-link login.");
    }

    const linkResult = (await pool.query(
      `SELECT "id" FROM "StudentParent" WHERE "tenantId" = $1 AND "parentId" = $2 LIMIT 1`,
      [tenantId, parent.id],
    )) as { rows: Array<{ id: string }> };
    if (!linkResult.rows[0]?.id) {
      throw new Error(
        "Parent must be linked to a student to use magic-link login in tests.",
      );
    }

    const generated = generateMagicLinkToken();
    rawToken = generated.rawToken;
    const tokenHash = generated.tokenHash;

    // Test-issued tokens use an extended expiry to avoid environment timezone/parsing quirks
    // with `timestamp` columns (product TTL is enforced by the real sender).
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tokenRowId = generateRowId("e2e-mlt-");

    await pool.query(
      `INSERT INTO "ParentMagicLinkToken"
        ("id", "tenantId", "parentUserId", "tokenHash", "rememberMe", "expiresAt", "createdIpHash")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tokenRowId, tenantId, parent.id, tokenHash, true, expiresAt, hashIdentifier("e2e")],
    );
  }

  // Drive the real verify page to ensure session cookies are established in the browser context.
  const verifyPath = buildTenantPath(
    tenantSlug,
    `/parent/auth/verify?token=${encodeURIComponent(rawToken)}`,
  );
  await page.goto(verifyPath, { waitUntil: "domcontentloaded" });

  const parentRoot = buildTenantPath(tenantSlug, "/parent");
  await Promise.race([
    // Wait for the post-verify redirect. `parent-shell` is visible on the verify page too,
    // so we wait for a signed-in marker under /parent instead.
    page.waitForURL(
      (url) =>
        url.pathname.startsWith(parentRoot) &&
        !url.pathname.startsWith(`${parentRoot}/auth/verify`),
      { timeout: 20_000 },
    ),
    page.getByTestId("parent-landing").waitFor({ state: "visible", timeout: 20_000 }),
  ]);

  if (!(await assertParentSession())) {
    throw new Error("Parent login failed to establish a session.");
  }

  await expect(page.getByTestId("parent-shell")).toBeVisible();

  // Normalize post-login landing to the portal dashboard so callers can assert onboarding UI.
  const portalPath = buildTenantPath(tenantSlug, "/portal");
  await page.goto(portalPath, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();
}

export async function expectAdminBlocked(page: Page) {
  // Allow either access-denied screen or login redirect per RBAC guard behavior.
  await Promise.race([
    page.getByTestId("access-denied").waitFor({ state: "visible" }),
    page.getByTestId("login-page").waitFor({ state: "visible" }),
  ]);
}
