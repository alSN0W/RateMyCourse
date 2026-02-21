// src/hooks/usePaginatedReviews.ts
import { useState, useEffect, useCallback } from 'react';
import { PaginatedResponse } from '@/types/pagination';

interface Review {
  id: string;
  anonymous_id: string;
  rating_value: number;
  comment: string;
  votes: number;
  created_at: string;
  // ... other review fields
}

interface UsePaginatedReviewsOptions {
  targetId: string;
  targetType: 'course' | 'professor';
  initialPage?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function usePaginatedReviews({
  targetId,
  targetType,
  initialPage = 1,
  limit = 10,
  sortBy = 'created_at',
  sortOrder = 'desc',
}: UsePaginatedReviewsOptions) {
  const [data, setData] = useState<Review[]>([]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);

  const fetchReviews = useCallback(async (page: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        target_id: targetId,
        target_type: targetType,
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      const url = `/api/reviews?${params}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`Failed to fetch reviews: ${response.status}`);
      }

      const result: PaginatedResponse<Review> = await response.json();

      // Check if the response has the expected structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format');
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch reviews');
      }

      setData(result.data || []);
      setCurrentPage(result.pagination.currentPage);
      setTotalPages(result.pagination.totalPages);
      setTotalItems(result.pagination.totalItems);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);

    } catch (err) {
      console.error('Error fetching reviews:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Set empty state on error
      setData([]);
      setTotalPages(0);
      setTotalItems(0);
      setHasNextPage(false);
      setHasPreviousPage(false);
    } finally {
      setIsLoading(false);
    }
  }, [targetId, targetType, limit, sortBy, sortOrder]);

  // Initial fetch - only run when we have a valid targetId
  useEffect(() => {
    if (!targetId) {
      console.warn('usePaginatedReviews: targetId is missing');
      return;
    }
    fetchReviews(currentPage);
  }, [fetchReviews, currentPage, targetId]);

  // Navigation functions
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  }, [hasNextPage]);

  const previousPage = useCallback(() => {
    if (hasPreviousPage) {
      setCurrentPage(prev => prev - 1);
    }
  }, [hasPreviousPage]);

  const refresh = useCallback(() => {
    fetchReviews(currentPage);
  }, [fetchReviews, currentPage]);

  return {
    reviews: data,
    currentPage,
    totalPages,
    totalItems,
    isLoading,
    error,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    nextPage,
    previousPage,
    refresh,
  };
}