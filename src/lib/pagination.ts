import { PaginationParams, PaginationMeta, PaginationOptions } from '@/types/pagination';

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
  totalItems: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / limit);
  const currentPage = Math.max(1, Math.min(page, totalPages));

  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: limit,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
}

/**
 * Validate and normalize pagination parameters
 */
export function validatePaginationParams(
  page?: number | string,
  limit?: number | string,
  options: PaginationOptions = {}
): PaginationParams {
  const defaultLimit = options.defaultLimit || 10;
  const maxLimit = options.maxLimit || 100;

  const normalizedPage = Math.max(1, parseInt(String(page || 1), 10) || 1);
  const normalizedLimit = Math.min(
    maxLimit,
    Math.max(1, parseInt(String(limit || defaultLimit), 10) || defaultLimit)
  );

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}

/**
 * Calculate offset for SQL queries
 */
export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Build pagination response
 */
export function buildPaginationResponse<T>(
  data: T[],
  totalItems: number,
  params: PaginationParams
) {
  return {
    data,
    pagination: calculatePagination(totalItems, params.page, params.limit),
    success: true,
  };
}