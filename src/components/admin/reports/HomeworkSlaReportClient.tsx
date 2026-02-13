"use client";

// Homework SLA report client provides admin-only aggregate metrics, breakdown rows, and filter-aware CSV export.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import AdminDataTable, {
  type AdminDataTableColumn,
} from "@/components/admin/shared/AdminDataTable";
import AdminFiltersSheet from "@/components/admin/shared/AdminFiltersSheet";
import AdminFormField from "@/components/admin/shared/AdminFormField";
import { AdminErrorPanel } from "@/components/admin/shared/AdminTableStatePanels";
import { inputBase, primaryButton, secondaryButton } from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import {
  useAdminTableQueryState,
} from "@/lib/admin-table/useAdminTableQueryState";
import type {
  AdminReportCenterOption,
  AdminReportTutorOption,
} from "@/lib/reports/adminReportOptions";

type HomeworkSlaReportClientProps = {
  tenant: string;
  tutors: AdminReportTutorOption[];
  centers: AdminReportCenterOption[];
};

type HomeworkSlaBreakdownRow = {
  centerId: string | null;
  centerName: string | null;
  tutorId: string | null;
  tutorDisplay: string | null;
  assignedCount: number;
  submittedCount: number;
  reviewedCount: number;
  reviewedDurationCount: number;
  avgReviewHours: number | null;
};

type HomeworkSlaResponse = {
  filters: Record<string, unknown>;
  countsByStatus: {
    ASSIGNED: number;
    SUBMITTED: number;
    REVIEWED: number;
  };
  avgReviewHours: number | null;
  reviewedDurationCount: number;
  breakdownRows: HomeworkSlaBreakdownRow[];
};

function toQueryString(filters: Record<string, unknown>) {
  const params = new URLSearchParams();

  const status = typeof filters.status === "string" ? filters.status : "";
  const from = typeof filters.from === "string" ? filters.from : "";
  const to = typeof filters.to === "string" ? filters.to : "";
  const tutorId = typeof filters.tutorId === "string" ? filters.tutorId : "";
  const centerId = typeof filters.centerId === "string" ? filters.centerId : "";

  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (tutorId) params.set("tutorId", tutorId);
  if (centerId) params.set("centerId", centerId);

  return params.toString();
}

function formatAvgHours(hours: number | null, t: ReturnType<typeof useTranslations>) {
  if (hours === null || !Number.isFinite(hours)) return t("generic.dash");
  return t("homeworkReport.metrics.avgReviewHoursValue", { value: hours.toFixed(2) });
}

export default function HomeworkSlaReportClient({
  tenant,
  tutors,
  centers,
}: HomeworkSlaReportClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [report, setReport] = useState<HomeworkSlaResponse | null>(null);

  const { state, setFilter, clearFilters } = useAdminTableQueryState({
    allowedFilterKeys: ["status", "from", "to", "tutorId", "centerId"],
  });

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const query = toQueryString(state.filters);
    const url = buildTenantApiUrl(
      tenant,
      `/admin/reports/homework-sla${query ? `?${query}` : ""}`,
    );

    const result = await fetchJson<HomeworkSlaResponse>(url, { cache: "no-store" });
    if (!result.ok) {
      setReport(null);
      setError(t("homeworkReport.error.body"));
      setIsLoading(false);
      return;
    }

    setReport(result.data);
    setIsLoading(false);
  }, [state.filters, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadReport();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadReport]);

  const onExportCsv = async () => {
    setIsExporting(true);
    setBannerMessage(null);

    const query = toQueryString(state.filters);
    const url = buildTenantApiUrl(
      tenant,
      `/admin/reports/homework-sla.csv${query ? `?${query}` : ""}`,
    );

    try {
      const response = await fetch(url);
      if (!response.ok) {
        setBannerMessage(t("homeworkReport.export.toast.error.title"));
        setIsExporting(false);
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "homework-sla.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setBannerMessage(t("homeworkReport.export.toast.success.title"));
    } catch {
      setBannerMessage(t("homeworkReport.export.toast.error.title"));
    } finally {
      setIsExporting(false);
    }
  };

  const rows = report?.breakdownRows ?? [];

  const columns = useMemo<AdminDataTableColumn<HomeworkSlaBreakdownRow>[]>(
    () => [
      {
        key: "center",
        label: t("homeworkReport.table.center"),
        renderCell: (row) => row.centerName ?? t("generic.dash"),
      },
      {
        key: "tutor",
        label: t("homeworkReport.table.tutor"),
        renderCell: (row) => row.tutorDisplay ?? t("generic.dash"),
      },
      {
        key: "assigned",
        label: t("homeworkReport.metrics.assigned"),
        renderCell: (row) => row.assignedCount,
      },
      {
        key: "submitted",
        label: t("homeworkReport.metrics.submitted"),
        renderCell: (row) => row.submittedCount,
      },
      {
        key: "reviewed",
        label: t("homeworkReport.metrics.reviewed"),
        renderCell: (row) => row.reviewedCount,
      },
      {
        key: "avgReview",
        label: t("homeworkReport.metrics.avgReviewTime"),
        renderCell: (row) => formatAvgHours(row.avgReviewHours, t),
      },
    ],
    [t],
  );

  const emptyState = {
    title: t("homeworkReport.empty.title"),
    body: t("homeworkReport.empty.body"),
    ctaLabel: t("homeworkReport.empty.cta"),
    onCta: () => clearFilters(),
  };

  return (
    <div className="flex flex-col gap-4" data-testid="homework-sla-report-page">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setIsFilterSheetOpen(true)}
          >
            {t("admin.table.filters.label")}
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => clearFilters()}
          >
            {t("admin.table.filters.clearAll")}
          </button>
        </div>

        <button
          type="button"
          className={primaryButton}
          onClick={() => void onExportCsv()}
          disabled={isExporting || !rows.length}
        >
          {isExporting ? t("homeworkReport.export.exporting") : t("homeworkReport.export.csv")}
        </button>
      </section>

      {bannerMessage ? (
        <section className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {bannerMessage}
        </section>
      ) : null}

      {error ? (
        <AdminErrorPanel
          title={t("homeworkReport.error.title")}
          body={error}
          onRetry={() => void loadReport()}
        />
      ) : null}

      {!error && report ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{t("homeworkReport.metrics.assigned")}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{report.countsByStatus.ASSIGNED}</p>
          </article>
          <article className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{t("homeworkReport.metrics.submitted")}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{report.countsByStatus.SUBMITTED}</p>
          </article>
          <article className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{t("homeworkReport.metrics.reviewed")}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{report.countsByStatus.REVIEWED}</p>
          </article>
          <article className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{t("homeworkReport.metrics.avgReviewTime")}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatAvgHours(report.avgReviewHours, t)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {t("homeworkReport.metrics.reviewedCount", {
                count: report.reviewedDurationCount,
              })}
            </p>
          </article>
        </section>
      ) : null}

      {!error ? (
        <AdminDataTable<HomeworkSlaBreakdownRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => `homework-sla-row-${row.centerId ?? "none"}-${row.tutorId ?? "none"}`}
          isLoading={isLoading}
          emptyState={emptyState}
          sortField={state.sortField}
          sortDir={state.sortDir}
          // Local sorting is intentionally disabled for this aggregate table in v1.
          onSortChange={() => undefined}
          testId="homework-sla-report-table"
        />
      ) : null}

      <AdminFiltersSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        onReset={() => clearFilters()}
      >
        <AdminFormField label={t("homeworkReport.filters.status")} htmlFor="homework-sla-status">
          <select
            id="homework-sla-status"
            className={inputBase}
            value={typeof state.filters.status === "string" ? state.filters.status : "ALL"}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="ALL">{t("homeworkReport.filters.statusAll")}</option>
            <option value="ASSIGNED">{t("homework.status.assigned")}</option>
            <option value="SUBMITTED">{t("homework.status.submitted")}</option>
            <option value="REVIEWED">{t("homework.status.reviewed")}</option>
          </select>
        </AdminFormField>

        <AdminFormField label={t("homeworkReport.filters.dateFrom")} htmlFor="homework-sla-from">
          <input
            id="homework-sla-from"
            type="date"
            className={inputBase}
            value={typeof state.filters.from === "string" ? state.filters.from : ""}
            onChange={(event) => setFilter("from", event.target.value || null)}
          />
        </AdminFormField>

        <AdminFormField label={t("homeworkReport.filters.dateTo")} htmlFor="homework-sla-to">
          <input
            id="homework-sla-to"
            type="date"
            className={inputBase}
            value={typeof state.filters.to === "string" ? state.filters.to : ""}
            onChange={(event) => setFilter("to", event.target.value || null)}
          />
        </AdminFormField>

        <AdminFormField label={t("homeworkReport.filters.tutor")} htmlFor="homework-sla-tutor">
          <select
            id="homework-sla-tutor"
            className={inputBase}
            value={typeof state.filters.tutorId === "string" ? state.filters.tutorId : ""}
            onChange={(event) => setFilter("tutorId", event.target.value || null)}
          >
            <option value="">{t("homeworkReport.filters.tutorAll")}</option>
            {tutors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </AdminFormField>

        <AdminFormField label={t("homeworkReport.filters.center")} htmlFor="homework-sla-center">
          <select
            id="homework-sla-center"
            className={inputBase}
            value={typeof state.filters.centerId === "string" ? state.filters.centerId : ""}
            onChange={(event) => setFilter("centerId", event.target.value || null)}
          >
            <option value="">{t("homeworkReport.filters.centerAll")}</option>
            {centers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </AdminFormField>
      </AdminFiltersSheet>

      <p className="text-xs text-slate-500" data-testid="homework-sla-generated-at">
        {t("homeworkReport.generatedAt", {
          value: new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date()),
        })}
      </p>
    </div>
  );
}
