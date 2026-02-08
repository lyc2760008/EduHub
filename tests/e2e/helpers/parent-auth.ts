// Shared helpers for parent access-code auth E2E flows.
import { expect, type Page } from "@playwright/test";

import { uniqueString } from "./data";
import { buildTenantApiPath, buildTenantPath } from "./tenant";

type StudentCreateResponse = {
  student?: { id?: string };
};

type ParentLinkResponse = {
  link?: { parentId?: string; parent?: { id?: string; email?: string } };
};

type ResetAccessCodeResponse = {
  accessCode?: string;
};

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
  // API reset keeps non-UI tests deterministic while still exercising the handler.
  const resetResponse = await postWithRetry(
    page,
    buildTenantApiPath(
      tenantSlug,
      `/api/parents/${parentId}/reset-access-code`,
    ),
    { data: {} },
  );
  expect(resetResponse.status()).toBe(200);
  const payload = (await resetResponse.json()) as ResetAccessCodeResponse;
  if (!payload.accessCode) {
    throw new Error("Expected access code in reset response.");
  }
  return payload.accessCode;
}

export async function prepareParentAccessCode(page: Page, tenantSlug: string) {
  // Helper bundles student + parent setup with a fresh access code.
  const { studentId, parentId, parentEmail } = await createStudentAndLinkParent(
    page,
    tenantSlug,
  );
  const accessCode = await resetParentAccessCode(page, tenantSlug, parentId);
  return { studentId, parentId, parentEmail, accessCode };
}

export async function loginAsParentWithAccessCode(
  page: Page,
  tenantSlug: string,
  email: string,
  accessCode: string,
) {
  // Shared login helper keeps the parent auth flow consistent across tests.
  // Reuse an existing parent session when it already matches the expected user.
  const sessionResponse = await page.request.get("/api/auth/session");
  if (sessionResponse.status() === 200) {
    let payload: { user?: { email?: string; role?: string } } | null = null;
    try {
      // NextAuth can return `null` JSON for anonymous sessions; guard to avoid TypeError.
      payload = (await sessionResponse.json()) as {
        user?: { email?: string; role?: string };
      } | null;
    } catch {
      payload = null;
    }
    if (
      payload?.user?.role === "Parent" &&
      payload.user?.email?.toLowerCase() === email.toLowerCase()
    ) {
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
  }

  await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByTestId("parent-login-email").fill(email);
    await page.getByTestId("parent-login-access-code").fill(accessCode);

    try {
      const authResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/callback/parent-credentials"),
        { timeout: 15_000 },
      );
      await page.getByTestId("parent-login-submit").click();
      await authResponsePromise;
      break;
    } catch (error) {
      if (attempt === 0 && isRetryableAuthError(error)) {
        await page.reload();
        continue;
      }
      throw error;
    }
  }

  // Parent portal entry route now lives under /portal.
  const portalPath = buildTenantPath(tenantSlug, "/portal");
  await Promise.race([
    page.waitForURL((url) => url.pathname.startsWith(portalPath), {
      timeout: 20_000,
    }),
    page.getByTestId("parent-shell").waitFor({
      state: "visible",
      timeout: 20_000,
    }),
  ]).catch(async () => {
    // Fallback navigation keeps auth helper resilient when callback redirects are delayed.
    await page.goto(portalPath);
  });
  await expect(page.getByTestId("parent-shell")).toBeVisible();
}

export async function expectAdminBlocked(page: Page) {
  // Allow either access-denied screen or login redirect per RBAC guard behavior.
  await Promise.race([
    page.getByTestId("access-denied").waitFor({ state: "visible" }),
    page.getByTestId("login-page").waitFor({ state: "visible" }),
  ]);
}
