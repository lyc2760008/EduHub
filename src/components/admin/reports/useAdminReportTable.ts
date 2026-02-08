// Shared report-table hook reuses Step 21.3A JSON/CSV endpoints with one query-state contract.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import type { AdminTableQueryState } from "@/lib/admin-table/useAdminTableQueryState";

type ReportResponse<TRow> = {
  rows: TRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: {
    field: string;
    dir: "asc" | "desc";
  };
  appliedFilters: Record<string, unknown>;
};

type UseAdminReportTableArgs = {
  tenant: string;
  reportId: string;
  tableState: AdminTableQueryState;
};

function toCsvFileName(reportId: string) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  const hh = `${now.getHours()}`.padStart(2, "0");
  const min = `${now.getMinutes()}`.padStart(2, "0");
  return `${reportId}-${yyyy}${mm}${dd}-${hh}${min}.csv`;
}

export function useAdminReportTable<TRow>({
  tenant,
  reportId,
  tableState,
}: UseAdminReportTableArgs) {
  const t = useTranslations();
  const [rows, setRows] = useState<TRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const listUrl = useMemo(() => {
    const params = buildAdminTableParams(tableState);
    const query = params.toString();
    return buildTenantApiUrl(
      tenant,
      `/admin/reports/${reportId}${query ? `?${query}` : ""}`,
    );
  }, [reportId, tableState, tenant]);

  const exportUrl = useMemo(() => {
    const params = buildAdminTableParams(tableState, { includePaging: false });
    const query = params.toString();
    return buildTenantApiUrl(
      tenant,
      `/admin/reports/${reportId}/export${query ? `?${query}` : ""}`,
    );
  }, [reportId, tableState, tenant]);

  const reload = useCallback(() => {
    setReloadNonce((current) => current + 1);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await fetchJson<ReportResponse<TRow>>(listUrl);
    if (!result.ok) {
      setError(t("admin.table.state.error.body"));
      setRows([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    setRows(result.data.rows ?? []);
    setTotalCount(result.data.totalCount ?? 0);
    setIsLoading(false);
  }, [listUrl, t]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(handle);
  }, [load, reloadNonce]);

  const exportCsv = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch(exportUrl, { method: "GET" });
      if (!response.ok) {
        setExportError(t("admin.table.state.error.body"));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = toCsvFileName(reportId);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t("admin.table.state.error.body"));
    } finally {
      setIsExporting(false);
    }
  }, [exportUrl, reportId, t]);

  return {
    rows,
    totalCount,
    isLoading,
    error,
    exportError,
    isExporting,
    reload,
    exportCsv,
  };
}
