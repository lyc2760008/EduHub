// Shared Step 22.8 E2E helpers centralize CSV parsing, leak scanning, and i18n-key sanity checks.
import { expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

import { findSensitiveMatch } from "./audit";

type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

const ANNOUNCEMENTS_I18N_KEY_PATTERN =
  /(^|\s)(adminAnnouncements|portalAnnouncements|announcementsReport)\.[a-z0-9_.-]+/i;

function normalizeCsvCell(value: unknown) {
  // Normalize BOM + wrapper quotes so CSV assertions stay stable across browser/runtime differences.
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1");
}

export function parseAnnouncementsCsv(csvContent: string): ParsedCsv {
  // XLSX parsing handles quoted commas/newlines safely; avoid ad-hoc split(",") parsing.
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

export function findAnnouncementsLeakMatch(
  value: string,
  options?: { forbiddenSentinel?: string },
) {
  const baseMatch = findSensitiveMatch(value);
  if (baseMatch) return baseMatch;

  if (options?.forbiddenSentinel && value.includes(options.forbiddenSentinel)) {
    return "forbidden-sentinel";
  }

  return null;
}

export async function expectNoRawAnnouncementI18nKeys(page: Page) {
  const bodyText = await page.locator("body").innerText();
  // Allow emails/usernames while still catching unresolved key paths.
  expect(ANNOUNCEMENTS_I18N_KEY_PATTERN.test(bodyText)).toBeFalsy();
}

export function parsePageUrl(page: Page) {
  return new URL(page.url());
}

export function readFiltersFromUrl(page: Page) {
  const raw = parsePageUrl(page).searchParams.get("filters");
  if (!raw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
