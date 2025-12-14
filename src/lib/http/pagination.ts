import { NextRequest } from "next/server";

type PaginationDefaults = {
  page: number;
  pageSize: number;
  maxPageSize: number;
};

export function parsePagination(
  req: NextRequest,
  defaults: PaginationDefaults = { page: 1, pageSize: 20, maxPageSize: 100 }
) {
  const url = new URL(req.url);
  const pageParam = Number(url.searchParams.get("page"));
  const pageSizeParam = Number(url.searchParams.get("pageSize"));

  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : defaults.page;
  let pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.floor(pageSizeParam) : defaults.pageSize;
  pageSize = Math.min(pageSize, defaults.maxPageSize);

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  return { page, pageSize, skip, take };
}
