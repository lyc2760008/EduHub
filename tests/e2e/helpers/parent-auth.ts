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

const DEFAULT_BASE_URL = "http://demo.lvh.me:3000";

export function resolveOtherTenantSlug(primarySlug: string) {
  // Prefer configured secondary tenant slug when available; fall back to seed default.
  const configured =
    process.env.E2E_SECOND_TENANT_SLUG ||
    process.env.SEED_SECOND_TENANT_SLUG ||
    "acme";
  return configured === primarySlug ? "acme" : configured;
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

  const createStudentResponse = await page.request.post(
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

  const linkResponse = await page.request.post(
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
  const resetResponse = await page.request.post(
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
  await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
  await page.getByTestId("parent-login-email").fill(email);
  await page.getByTestId("parent-login-access-code").fill(accessCode);

  const authResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/callback/parent-credentials"),
  );
  await page.getByTestId("parent-login-submit").click();
  await authResponsePromise;

  // Parent portal entry route now lives under /portal.
  const portalPath = buildTenantPath(tenantSlug, "/portal");
  await page.waitForURL((url) => url.pathname.startsWith(portalPath));
  await expect(page.getByTestId("parent-shell")).toBeVisible();
}

export async function expectAdminBlocked(page: Page) {
  // Allow either access-denied screen or login redirect per RBAC guard behavior.
  await Promise.race([
    page.getByTestId("access-denied").waitFor({ state: "visible" }),
    page.getByTestId("login-page").waitFor({ state: "visible" }),
  ]);
}
