'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Custom hook for fetching data from API endpoints with React Query
 * Provides automatic caching, request deduplication, and error handling
 *
 * @example
 * const { data, isLoading, error } = useApiQuery('inventory', '/api/inventory');
 */
export function useApiQuery<T>(
  key: string | string[],
  endpoint: string,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
  }
) {
  return useQuery<T>({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: async () => {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${endpoint}`);
      }
      return response.json();
    },
    ...options,
  });
}

/**
 * Custom hook for API mutations (POST, PUT, DELETE)
 * Automatically invalidates related queries on success
 *
 * @example
 * const { mutate, isPending } = useApiMutation(
 *   '/api/proposals/approve',
 *   ['proposals']
 * );
 */
export function useApiMutation<TData = any, TVariables = any>(
  endpoint: string,
  invalidateKeys?: string[],
  options?: {
    method?: 'POST' | 'PUT' | 'DELETE';
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
  }
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      const response = await fetch(endpoint, {
        method: options?.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variables),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${options?.method || 'POST'} ${endpoint}`);
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate related queries to trigger refetch
      if (invalidateKeys) {
        invalidateKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}

/**
 * Hook for prefetching data
 * Useful for loading data before navigation or user interaction
 *
 * @example
 * const prefetch = usePrefetch();
 * prefetch('inventory', '/api/inventory');
 */
export function usePrefetch() {
  const queryClient = useQueryClient();

  return (key: string | string[], endpoint: string) => {
    queryClient.prefetchQuery({
      queryKey: Array.isArray(key) ? key : [key],
      queryFn: async () => {
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(`Failed to prefetch ${endpoint}`);
        }
        return response.json();
      },
    });
  };
}
