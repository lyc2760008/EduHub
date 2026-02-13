// Step 22.9 shared helpers parse report CSV/URL state and scan payloads for sensitive leakage patterns.
import type { Page } from "@playwright/test";
import * as XLSX from "xlsx";

import { findSensitiveMatch } from "./audit";

type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

function normalizeCsvCell(value: unknown) {
  // Normalize BOM and wrapper quotes so assertions remain robust across runtime/exporter differences.
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1");
}

export function parseSessionResourcesCsv(csvContent: string): ParsedCsv {
  // XLSX parser handles quoted commas/newlines safely without ad-hoc split logic.
  const workbook = XLSX.read(csvContent, {
    type: "string",
    raw: false,
    dense: true,
  });
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

export function findSessionResourcesLeakMatch(
  value: string,
  options?: { forbiddenSentinel?: string },
) {
  const sensitiveMatch = findSensitiveMatch(value);
  if (sensitiveMatch) return sensitiveMatch;
  if (options?.forbiddenSentinel && value.includes(options.forbiddenSentinel)) {
    return "internal-sentinel";
  }
  return null;
}

export function parseMissingResourcesUrlState(page: Page) {
  const url = new URL(page.url());
  const filtersRaw = url.searchParams.get("filters");
  let filters: Record<string, unknown> = {};
  if (filtersRaw) {
    try {
      const parsed = JSON.parse(filtersRaw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        filters = parsed as Record<string, unknown>;
      }
    } catch {
      filters = {};
    }
  }

  return {
    search: url.searchParams.get("search") ?? "",
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "",
    sortField: url.searchParams.get("sortField") ?? "",
    sortDir: url.searchParams.get("sortDir") ?? "",
    filters,
  };
}
