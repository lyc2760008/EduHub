import "server-only";

import {
  REPORT_IDS,
  reportConfigs,
  type ReportConfigMap,
  type ReportId,
} from "@/lib/reports/reportConfigs";

// Constant-time report lookup prevents branching logic in route handlers.
export function isReportId(value: string): value is ReportId {
  return (REPORT_IDS as readonly string[]).includes(value);
}

// Returns a strongly-typed report configuration for query execution.
export function getReportConfig<TReportId extends ReportId>(reportId: TReportId) {
  return reportConfigs[reportId] as ReportConfigMap[TReportId];
}
