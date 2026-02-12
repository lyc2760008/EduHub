// Step 22.5 regression coverage for canonical parent-home routing (/parent -> /portal).
// This suite assumes Option A auth via Playwright storageState generated in setup-parent.
import { expect, test, type Page, type Request, type Response } from "@playwright/test";

import { buildTenantUrl } from "../helpers/parent-auth";
import { resolveStep203Fixtures } from "../helpers/step203";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type DocumentRedirectTrace = {
  initialResponse: Response;
  finalResponse: Response;
  statusChain: number[];
  pathChain: string[];
};

function normalizePathname(pathname: string) {
  // Normalize trailing slashes so "/portal" and "/portal/" compare consistently.
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400;
}

function resolveOtherTenantSlug(primaryTenantSlug: string) {
  // Step 22.5 supports an explicit override for cross-tenant negative checks.
  const explicitOtherTenant = process.env.E2E_OTHER_TENANT?.trim();
  if (explicitOtherTenant) {
    return explicitOtherTenant;
  }
  const fallbackOtherTenant =
    process.env.E2E_SECOND_TENANT_SLUG?.trim() ||
    (primaryTenantSlug.toLowerCase().startsWith("e2e")
      ? `${primaryTenantSlug}-secondary`
      : "acme");
  return fallbackOtherTenant === primaryTenantSlug
    ? `${primaryTenantSlug}-secondary`
    : fallbackOtherTenant;
}

function locationPathname(
  locationHeader: string,
  requestUrl: string,
): string {
  // Location can be relative or absolute, so resolve against the original request URL.
  return normalizePathname(new URL(locationHeader, requestUrl).pathname);
}

async function navigateAndCaptureDocumentRedirect(
  page: Page,
  targetPath: string,
): Promise<DocumentRedirectTrace> {
  const finalResponse = await page.goto(targetPath, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  if (!finalResponse) {
    throw new Error(`Navigation returned no main-document response for '${targetPath}'.`);
  }

  const responseChain: Response[] = [];
  let cursor: Request | null = finalResponse.request();
  while (cursor) {
    const response = await cursor.response();
    if (response) {
      // Build the chain in request order: initial request first, final response last.
      responseChain.unshift(response);
    }
    cursor = cursor.redirectedFrom();
  }

  if (responseChain.length === 0) {
    throw new Error(`Unable to inspect response chain for '${targetPath}'.`);
  }

  return {
    initialResponse: responseChain[0],
    finalResponse,
    statusChain: responseChain.map((response) => response.status()),
    pathChain: responseChain.map((response) =>
      normalizePathname(new URL(response.url()).pathname),
    ),
  };
}

async function expectServerCanonicalRedirect(page: Page, tenantSlug: string) {
  const parentPath = normalizePathname(buildTenantPath(tenantSlug, "/parent"));
  const portalPath = normalizePathname(buildTenantPath(tenantSlug, "/portal"));
  const trace = await navigateAndCaptureDocumentRedirect(page, parentPath);

  // Silent canonicalization must begin with a server redirect from /parent.
  expect(trace.pathChain[0]).toBe(parentPath);
  expect(isRedirectStatus(trace.initialResponse.status())).toBeTruthy();

  const locationHeader = trace.initialResponse.headers().location;
  if (locationHeader) {
    // Validate the redirect target when the response exposes a Location header.
    expect(locationPathname(locationHeader, trace.initialResponse.url())).toBe(
      portalPath,
    );
  }

  // No loop: the chain should have one redirect hop and no repeated pathnames.
  const redirectStatuses = trace.statusChain.filter(isRedirectStatus);
  expect(redirectStatuses).toHaveLength(1);
  expect(trace.statusChain.length).toBeLessThanOrEqual(3);
  expect(new Set(trace.pathChain).size).toBe(trace.pathChain.length);

  // Final browser location must be the canonical portal landing path.
  expect(normalizePathname(new URL(page.url()).pathname)).toBe(portalPath);
  await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent home canonicalization (/parent -> /portal)", () => {
  test("Authenticated desktop navigation uses a silent server redirect", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    await expectServerCanonicalRedirect(page, fixtures.tenantSlug);
  });

  test("Authenticated mobile navigation uses the same silent server redirect", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    // Explicit mobile viewport coverage prevents desktop-only redirect regressions.
    await page.setViewportSize({ width: 390, height: 844 });
    await expectServerCanonicalRedirect(page, fixtures.tenantSlug);
  });

  test("Representative /portal page still loads unchanged", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    await page.goto(buildTenantPath(fixtures.tenantSlug, "/portal/students"), {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("portal-students-page")).toBeVisible();
    await expect(page.getByTestId("portal-students-error")).toHaveCount(0);
  });

  test("Unauthenticated users remain blocked on /parent and /portal", async ({
    browser,
    baseURL,
  }) => {
    const fixtures = resolveStep203Fixtures();
    // Force an empty storage state so project-level parent auth cookies cannot leak into this check.
    const unauthContext = await browser.newContext({
      ...(baseURL ? { baseURL } : {}),
      storageState: { cookies: [], origins: [] },
    });
    const unauthPage = await unauthContext.newPage();

    try {
      for (const guardedRoute of ["/parent", "/portal"] as const) {
        await unauthPage.goto(
          buildTenantPath(fixtures.tenantSlug, guardedRoute),
          { waitUntil: "domcontentloaded" },
        );
        await expect(unauthPage.getByTestId("parent-login-page")).toBeVisible();
        await expect(unauthPage.getByTestId("portal-dashboard-page")).toHaveCount(0);
      }
    } finally {
      await unauthContext.close();
    }
  });

  test("Parent cannot access another tenant portal via route manipulation", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    const otherTenantSlug = resolveOtherTenantSlug(fixtures.tenantSlug);

    // Clear explicit tenant headers so cross-tenant URLs resolve against the target slug.
    await page.context().setExtraHTTPHeaders({});
    await page.goto(buildTenantUrl(otherTenantSlug, "/portal"), {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("parent-login-page")).toBeVisible();
    await expect(page.getByTestId("portal-dashboard-page")).toHaveCount(0);

    const apiResponse = await page.request.get(
      buildTenantUrl(otherTenantSlug, "/api/portal/students?take=1&skip=0"),
    );
    expect([401, 403, 404]).toContain(apiResponse.status());
  });

  test("Parent cannot access unlinked student pages", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/portal/students/${fixtures.unlinkedStudentId}`,
      ),
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.getByTestId("portal-student-not-found")).toBeVisible();
    await expect(page.getByTestId("portal-student-detail-page")).toHaveCount(0);

    const apiResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/portal/students/${fixtures.unlinkedStudentId}`,
      ),
    );
    expect([403, 404]).toContain(apiResponse.status());
  });
});
