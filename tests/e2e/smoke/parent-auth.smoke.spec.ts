// Smoke test for parent magic-link authentication and admin route blocking.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import { uniqueString } from "..\/helpers/data";
import { buildTenantPath } from "..\/helpers/tenant";
import {
  createStudentAndLinkParentForEmail,
  expectAdminBlocked,
  loginAsParentWithAccessCode,
} from "..\/helpers/parent-auth";

// Tagged for smoke suite filtering.
test("[smoke] Parent magic-link login works and blocks admin routes", async ({
  page,
}) => {
  const { tenantSlug } = await loginAsAdmin(page);
  const parentEmail = `${uniqueString("parent")}@example.com`;

  // Magic-link issuance requires a parent linked to at least one student.
  await createStudentAndLinkParentForEmail(page, tenantSlug, parentEmail);

  // Clear admin session before attempting the parent login flow.
  await page.context().clearCookies();
  await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, "IGNORED");

  // Parent portal entry point now lives under /portal.
  const portalPath = buildTenantPath(tenantSlug, "/portal");
  await page.goto(portalPath);
  await expect(page.getByTestId("parent-shell")).toBeVisible();

  // Parent sessions should not access admin routes.
  await page.goto(buildTenantPath(tenantSlug, "/admin"));
  await expectAdminBlocked(page);
});

