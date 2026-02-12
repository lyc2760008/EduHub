// Shared audit E2E helpers keep CSV parsing, URL-state checks, and redaction assertions consistent.
import { expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

function normalizeCsvCell(value: unknown) {
  // Normalize BOM and wrapper quotes so assertions are resilient to exporter/runtime differences.
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1");
}

const SENSITIVE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: "jwt-like-token",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/i,
  },
  {
    name: "authorization-header",
    regex: /authorization\s*:/i,
  },
  {
    name: "set-cookie-header",
    regex: /set-cookie/i,
  },
  {
    name: "cookie-header",
    regex: /\bcookie\s*:/i,
  },
  {
    name: "password-field",
    regex: /\bpassword\b/i,
  },
  {
    name: "smtp-credential",
    regex: /\bsmtp\b/i,
  },
  {
    name: "secret-field",
    regex: /\bsecret\b/i,
  },
  {
    name: "token-query",
    regex: /token=/i,
  },
  {
    name: "access-code-field",
    regex: /access[_-]?code/i,
  },
];

export function findSensitiveMatch(value: string) {
  return SENSITIVE_PATTERNS.find((entry) => entry.regex.test(value))?.name ?? null;
}

export function parseAuditCsv(csvContent: string): ParsedCsv {
  // XLSX parser handles quoted CSV values and commas safely (avoid ad-hoc split parsing).
  const workbook = XLSX.read(csvContent, { type: "string", raw: false, dense: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return { headers: [], rows: [] };
  }

  const rowsAsArrays = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: "",
  });
  const headers =
    rowsAsArrays.length > 0
      ? rowsAsArrays[0].map((entry) => normalizeCsvCell(entry))
      : [];
  const rows = rowsAsArrays
    .slice(1)
    .map((rowValues) => {
      const row: Record<string, string> = {};
      for (let index = 0; index < headers.length; index += 1) {
        const key = headers[index];
        if (!key) continue;
        row[key] = normalizeCsvCell(rowValues[index] ?? "");
      }
      return row;
    })
    .filter((row) => Object.keys(row).length > 0);

  return { headers, rows };
}

export async function waitForAuditTableReady(page: Page) {
  // Wait until loading/error states settle so row assertions run against a stable table.
  await expect(page.getByTestId("audit-log-page")).toBeVisible();
  await expect(page.getByTestId("audit-log")).toBeVisible();
  await expect(page.getByTestId("admin-table-error")).toHaveCount(0);
  await expect
    .poll(async () => {
      const loadingRows = await page
        .locator('[data-testid="audit-table"] [data-testid="admin-table-loading-row"]')
        .count();
      if (loadingRows > 0) return "loading";
      const rowCount = await page.locator('tr[data-testid^="audit-row-"]').count();
      if (rowCount > 0) return "rows";
      const emptyVisible = await page.getByTestId("admin-table-empty").isVisible();
      return emptyVisible ? "empty" : "unknown";
    })
    .toMatch(/rows|empty/);
}

export function parseAuditFiltersFromUrl(page: Page) {
  const raw = new URL(page.url()).searchParams.get("filters");
  if (!raw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
