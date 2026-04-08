import { z } from "zod";

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type ResolvedPagination = {
  page: number;
  pageSize: number;
  skip: number;
};

export type PaginationResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function resolvePagination(input: unknown, defaults: { page?: number; pageSize?: number } = {}): ResolvedPagination | undefined {
  const parsed = paginationQuerySchema.parse(input ?? {});
  if (parsed.page === undefined && parsed.pageSize === undefined) {
    return undefined;
  }

  const page = parsed.page ?? defaults.page ?? 1;
  const pageSize = parsed.pageSize ?? defaults.pageSize ?? 20;
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function toPaginationResult<T>(items: T[], total: number, pagination: ResolvedPagination): PaginationResult<T> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}
