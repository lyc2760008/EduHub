// Query param helpers keep report/list fetch URLs and export URLs aligned to the same table state.
import type { AdminTableQueryState } from "@/lib/admin-table/useAdminTableQueryState";

type BuildAdminTableParamsOptions = {
  includePaging?: boolean;
};

// Shared serializer guarantees stable query ordering and consistent omission of empty values.
export function buildAdminTableParams(
  state: AdminTableQueryState,
  options: BuildAdminTableParamsOptions = {},
) {
  const { includePaging = true } = options;
  const params = new URLSearchParams();

  if (state.search.trim()) {
    params.set("search", state.search.trim());
  }

  if (includePaging) {
    params.set("page", String(state.page));
    params.set("pageSize", String(state.pageSize));
  }

  if (state.sortField) {
    params.set("sortField", state.sortField);
    params.set("sortDir", state.sortDir);
  }

  const filterEntries = Object.entries(state.filters).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });

  if (filterEntries.length) {
    const sorted = [...filterEntries].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    params.set("filters", JSON.stringify(Object.fromEntries(sorted)));
  }

  return params;
}
