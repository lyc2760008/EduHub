// Smoke test for parent access-code authentication and admin route blocking.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { uniqueString } from "./helpers/data";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";
import { expectAdminBlocked } from "./helpers/parent-auth";

test("Parent access-code login works and blocks admin routes", async ({
  page,
}) => {
  const { tenantSlug } = await loginAsAdmin(page);
  const parentEmail = `${uniqueString("parent")}@example.com`;

  const createResponse = await page.request.post(
    buildTenantApiPath(tenantSlug, "/api/parents"),
    {
      data: {
        firstName: "E2E",
        lastName: "Parent",
        email: parentEmail,
        phone: "555-0100",
        notes: "E2E parent auth",
      },
    },
  );
  expect(createResponse.status()).toBe(201);

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
  expect(resetResponse.status()).toBe(200);

  const resetPayload = (await resetResponse.json()) as {
    accessCode?: string;
  };
  const accessCode = resetPayload.accessCode;
  if (!accessCode) {
    throw new Error("Expected access code in reset response.");
  }

  // Clear admin session before attempting the parent login flow.
  await page.context().clearCookies();
  await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
  await page.getByTestId("parent-login-email").fill(parentEmail);
  await page.getByTestId("parent-login-access-code").fill(accessCode);
  await page.getByTestId("parent-login-submit").click();

  const parentPath = buildTenantPath(tenantSlug, "/parent");
  await page.waitForURL((url) => url.pathname.startsWith(parentPath));
  await expect(page.getByTestId("parent-shell")).toBeVisible();

  // Parent sessions should not access admin routes.
  await page.goto(buildTenantPath(tenantSlug, "/admin"));
  await expectAdminBlocked(page);
});
