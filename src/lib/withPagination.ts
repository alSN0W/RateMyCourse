// src/lib/withPagination.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { SupabaseClient } from '@supabase/supabase-js';
import { validatePaginationParams, getOffset, buildPaginationResponse } from '@/lib/pagination';

// Helper to safely extract single string from query param
export const getParam = (param: string | string[] | undefined): string | undefined =>
  Array.isArray(param) ? param[0] : param;

interface PaginatedHandlerOptions<T> {
  // Build and return the Supabase query (without range applied)
  buildQuery: (
    supabase: SupabaseClient,
    req: NextApiRequest
  ) => Promise<{
    query: any;
    error?: string; // Return an error string to short-circuit with 400
  }>;

  // Optional: transform each item before returning
  transform?: (item: any) => T;

  // Pagination config
  defaultLimit?: number;
  maxLimit?: number;
}

/**
 * Generic paginated API handler.
 *
 * Usage:
 *   export default withPagination({ buildQuery, transform })
 */
export function withPagination<T = any>({
  buildQuery,
  transform,
  defaultLimit = 10,
  maxLimit = 50,
}: PaginatedHandlerOptions<T>) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed', success: false });
    }

    try {
      // Dynamically import supabase client
      const { createClient } = await import('@/utils/supabase/server-pages');
      const supabase = createClient(req, res);

      // Parse pagination params
      const page = getParam(req.query.page);
      const limit = getParam(req.query.limit);

      const paginationParams = validatePaginationParams(page, limit, {
        defaultLimit,
        maxLimit,
      });

      // Let the caller build the query
      const { query, error: queryError } = await buildQuery(supabase, req);

      // Short-circuit if the caller returned a validation error
      if (queryError) {
        return res.status(400).json({ error: queryError, success: false });
      }

      // Apply pagination
      const offset = getOffset(paginationParams.page, paginationParams.limit);
      const { data, error, count } = await query
        .range(offset, offset + paginationParams.limit - 1);

      if (error) {
        console.error('Supabase query error:', error);
        return res.status(500).json({ error: 'Failed to fetch data', success: false });
      }

      // Optionally transform results
      const results: T[] = transform
        ? (data || []).map(transform)
        : (data || []);

      return res.status(200).json(
        buildPaginationResponse(results, count || 0, paginationParams)
      );

    } catch (error) {
      console.error('Unexpected error:', error);
      return res.status(500).json({ error: 'Internal server error', success: false });
    }
  };
}