import { useState, useEffect, useCallback, useRef } from 'react';
import type { HospitalMetricsResponse, Department, TimeRange } from '@shared/types/hospital';
import { hospitalApi } from '@/services/api';

interface UseHospitalDataOptions {
  department: Department;
  timeRange: TimeRange;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UseHospitalDataReturn {
  data: HospitalMetricsResponse | null;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refetch: () => Promise<void>;
  isConnected: boolean;
}

export const useHospitalData = ({
  department,
  timeRange,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds default
}: UseHospitalDataOptions): UseHospitalDataReturn => {
  const [data, setData] = useState<HospitalMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      setError(null);

      const result = await hospitalApi.getHospitalMetrics(department, timeRange);

      setData(result);
      setLastRefresh(new Date());
      setIsConnected(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't update state
        return;
      }

      console.error('Failed to fetch hospital data:', err);

      // Handle different types of errors
      const error = err as { statusCode?: number; retryAfter?: number; code?: string; message?: string };
      if (error.statusCode === 429) {
        setError(`Rate limit exceeded. Please wait ${error.retryAfter || 60} seconds.`);
      } else if (error.statusCode && error.statusCode >= 500) {
        setError('Server error. Please try again later.');
        setIsConnected(false);
      } else if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
        setError('Network error. Please check your connection.');
        setIsConnected(false);
      } else {
        setError(error.message || 'Failed to fetch hospital data');
      }
    } finally {
      setIsLoading(false);
    }
  }, [department, timeRange]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Initial fetch and setup auto-refresh
  useEffect(() => {
    // Fetch immediately
    fetchData();

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      const startAutoRefresh = () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible') {
            fetchData().then(() => {
              startAutoRefresh(); // Schedule next refresh
            });
          } else {
            startAutoRefresh(); // Try again if page is hidden
          }
        }, refreshInterval);
      };

      startAutoRefresh();

      // Listen for visibility changes to pause/resume auto-refresh
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // Page became visible, fetch fresh data
          fetchData();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Listen for online/offline events
      const handleOnline = () => {
        setIsConnected(true);
        fetchData();
      };

      const handleOffline = () => {
        setIsConnected(false);
        setError('You are offline. Data may be outdated.');
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, autoRefresh, refreshInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    lastRefresh,
    refetch,
    isConnected,
  };
};

// Additional hook for health checking
export const useApiHealth = () => {
  const [isHealthy, setIsHealthy] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      await hospitalApi.getBackendHealth();
      setIsHealthy(true);
      setLastCheck(new Date());
    } catch {
      setIsHealthy(false);
      setLastCheck(new Date());
    }
  }, []);

  useEffect(() => {
    checkHealth();

    const interval = setInterval(checkHealth, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [checkHealth]);

  return { isHealthy, lastCheck, checkHealth };
};