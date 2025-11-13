'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  // Create QueryClient instance with optimized settings
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Cache data for 5 minutes by default
        staleTime: 5 * 60 * 1000,
        // Keep unused data in cache for 10 minutes
        gcTime: 10 * 60 * 1000,
        // Retry failed requests once
        retry: 1,
        // Don't refetch on window focus for better performance
        refetchOnWindowFocus: false,
        // Don't refetch on mount if data is fresh
        refetchOnMount: false,
        // Don't refetch on reconnect if data is fresh
        refetchOnReconnect: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
