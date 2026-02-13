// Step 23.2 shared helpers centralize fixture paths, temporary upload files, CSV parsing, and leak checks.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import * as XLSX from "xlsx";

import { findSensitiveMatch } from "./audit";

type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

function normalizeCsvCell(value: unknown) {
  // Normalize BOM and wrapper quotes so assertions remain stable across runtime/exporter differences.
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1");
}

export function parseHomeworkCsv(csvContent: string): ParsedCsv {
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

export function findHomeworkLeakMatch(value: string) {
  const sensitiveMatch = findSensitiveMatch(value);
  if (sensitiveMatch) return sensitiveMatch;
  if (/https?:\/\//i.test(value)) {
    // Homework SLA CSV should not include URLs by contract.
    return "url-present";
  }
  return null;
}

export function getHomeworkFixturePath(filename: string) {
  // Centralized fixture paths avoid duplicated process.cwd() joins in specs.
  return path.join(process.cwd(), "tests", "e2e", "fixtures", "homework", filename);
}

export async function createTempUploadFile(params: {
  filename: string;
  bytes: number;
  fillByte?: number;
}) {
  // Temp files support oversize/invalid upload assertions without committing large blobs to git.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eduhub-homework-e2e-"));
  const filePath = path.join(tmpDir, params.filename);
  const fillByte = params.fillByte ?? 65;
  const payload = Buffer.alloc(params.bytes, fillByte);
  await fs.writeFile(filePath, payload);
  return filePath;
}

export async function cleanupTempUploadFile(filePath: string) {
  // Cleanup prevents temp upload fixtures from accumulating across local/CI test runs.
  try {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures to keep assertion failure context focused on test outcomes.
  }
}
