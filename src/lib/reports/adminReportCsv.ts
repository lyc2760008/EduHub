// Escapes a single CSV value and always quotes output for spreadsheet safety.
function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const normalized = value === null || value === undefined ? "" : String(value);
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export type CsvColumn<TRow> = {
  key: string;
  header: string;
  getValue: (row: TRow) => string | number | boolean | null | undefined;
};

// Converts rows into UTF-8 CSV text with a BOM to keep Excel imports consistent.
export function toCsv<TRow>(columns: CsvColumn<TRow>[], rows: TRow[]) {
  const headerLine = columns.map((column) => escapeCsvValue(column.header)).join(",");
  const bodyLines = rows.map((row) =>
    columns.map((column) => escapeCsvValue(column.getValue(row))).join(","),
  );
  return `\uFEFF${[headerLine, ...bodyLines].join("\n")}`;
}

// Builds a deterministic export filename that includes UTC date/time.
export function buildCsvFileName(reportId: string, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${now.getUTCDate()}`.padStart(2, "0");
  const hh = `${now.getUTCHours()}`.padStart(2, "0");
  const mm = `${now.getUTCMinutes()}`.padStart(2, "0");
  return `${reportId}-${y}${m}${d}-${hh}${mm}.csv`;
}
