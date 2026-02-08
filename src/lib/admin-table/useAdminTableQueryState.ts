// URL-backed admin table state hook keeps list/search/filter/sort in sync with browser navigation.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

export type AdminTableSortDir = "asc" | "desc";

export type AdminTableQueryState = {
  search: string;
  page: number;
  pageSize: number;
  sortField: string | null;
  sortDir: AdminTableSortDir;
  filters: Record<string, unknown>;
};

export type UseAdminTableQueryStateOptions = {
  defaultPageSize?: number;
  maxPageSize?: number;
  allowedPageSizes?: number[];
  defaultSortField?: string | null;
  defaultSortDir?: AdminTableSortDir;
  allowedFilterKeys?: readonly string[];
};

type SetQueryOptions = {
  usePush?: boolean;
};

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSortDir(value: string | null, fallback: AdminTableSortDir) {
  if (value === "asc" || value === "desc") return value;
  return fallback;
}

function parseFilters(
  value: string | null,
  allowedFilterKeys?: readonly string[],
) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const entries = Object.entries(parsed).filter(([key, entryValue]) => {
      if (allowedFilterKeys && !allowedFilterKeys.includes(key)) return false;
      if (entryValue === null || entryValue === undefined) return false;
      if (typeof entryValue === "string") return entryValue.trim().length > 0;
      if (Array.isArray(entryValue)) return entryValue.length > 0;
      return true;
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function serializeFilters(filters: Record<string, unknown>) {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
  if (!entries.length) return null;
  const sortedEntries = [...entries].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify(Object.fromEntries(sortedEntries));
}

// Reusable query-state hook keeps table UI deterministic across refresh/back-forward navigation.
export function useAdminTableQueryState(
  options: UseAdminTableQueryStateOptions = {},
) {
  const {
    defaultPageSize = 25,
    maxPageSize = 100,
    allowedPageSizes = [25, 50, 100],
    defaultSortField = null,
    defaultSortDir = "asc",
    allowedFilterKeys,
  } = options;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = useMemo<AdminTableQueryState>(() => {
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const rawPageSize = parsePositiveInt(
      searchParams.get("pageSize"),
      defaultPageSize,
    );
    const sanitizedPageSize = Math.min(rawPageSize, maxPageSize);
    const pageSize = allowedPageSizes.includes(sanitizedPageSize)
      ? sanitizedPageSize
      : defaultPageSize;

    const sortFieldRaw = searchParams.get("sortField");
    const sortField = sortFieldRaw?.trim()
      ? sortFieldRaw.trim()
      : defaultSortField;
    const sortDir = parseSortDir(searchParams.get("sortDir"), defaultSortDir);

    return {
      search: searchParams.get("search")?.trim() ?? "",
      page,
      pageSize,
      sortField,
      sortDir,
      filters: parseFilters(searchParams.get("filters"), allowedFilterKeys),
    };
  }, [
    allowedFilterKeys,
    allowedPageSizes,
    defaultPageSize,
    defaultSortDir,
    defaultSortField,
    maxPageSize,
    searchParams,
  ]);

  const applyState = useCallback(
    (
      patch: Partial<AdminTableQueryState>,
      { usePush = false }: SetQueryOptions = {},
    ) => {
      const next: AdminTableQueryState = {
        ...state,
        ...patch,
      };
      const params = new URLSearchParams(searchParams.toString());
      if (next.search.trim()) params.set("search", next.search.trim());
      else params.delete("search");

      params.set("page", String(Math.max(1, next.page)));
      params.set(
        "pageSize",
        String(
          allowedPageSizes.includes(next.pageSize)
            ? next.pageSize
            : defaultPageSize,
        ),
      );

      if (next.sortField?.trim()) {
        params.set("sortField", next.sortField.trim());
        params.set("sortDir", next.sortDir);
      } else {
        params.delete("sortField");
        params.delete("sortDir");
      }

      const filtersParam = serializeFilters(next.filters);
      if (filtersParam) params.set("filters", filtersParam);
      else params.delete("filters");

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (usePush) {
        router.push(url);
      } else {
        router.replace(url);
      }
    },
    [
      allowedPageSizes,
      defaultPageSize,
      pathname,
      router,
      searchParams,
      state,
    ],
  );

  const setSearch = useCallback(
    (search: string) => {
      applyState({ search, page: 1 });
    },
    [applyState],
  );

  const setFilter = useCallback(
    (key: string, value: unknown) => {
      const nextFilters = { ...state.filters };
      if (
        value === null ||
        value === undefined ||
        (typeof value === "string" && !value.trim()) ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete nextFilters[key];
      } else {
        nextFilters[key] = value;
      }
      applyState({ filters: nextFilters, page: 1 });
    },
    [applyState, state.filters],
  );

  const clearFilters = useCallback(() => {
    applyState({ filters: {}, page: 1 });
  }, [applyState]);

  const setSort = useCallback(
    (field: string | null, dir: AdminTableSortDir = defaultSortDir) => {
      applyState({ sortField: field, sortDir: dir, page: 1 });
    },
    [applyState, defaultSortDir],
  );

  const setPage = useCallback(
    (page: number) => {
      applyState({ page: Math.max(1, page) }, { usePush: true });
    },
    [applyState],
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      const bounded = Math.min(pageSize, maxPageSize);
      const normalized = allowedPageSizes.includes(bounded)
        ? bounded
        : defaultPageSize;
      applyState({ pageSize: normalized, page: 1 });
    },
    [allowedPageSizes, applyState, defaultPageSize, maxPageSize],
  );

  return {
    state,
    setSearch,
    setFilter,
    clearFilters,
    setSort,
    setPage,
    setPageSize,
  };
}

// Shared debounce helper avoids per-page timeout logic for admin list search fields.
export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [delayMs, value]);
  return debounced;
}
