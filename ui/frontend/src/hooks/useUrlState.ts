import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Department, TimeRange } from '@shared/types/hospital';
import { isValidTimeRange } from '@/utils/timeRange';

interface UrlState {
  department: Department;
  timeRange: TimeRange;
}

interface UseUrlStateReturn extends UrlState {
  setDepartment: (department: Department) => void;
  setTimeRange: (timeRange: TimeRange) => void;
}

const isValidDepartment = (value: string): value is Department => {
  return value === 'adult' || value === 'children';
};

export const useUrlState = (): UseUrlStateReturn => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL or defaults
  const [state, setState] = useState<UrlState>(() => {
    const deptParam = searchParams.get('department');
    const timeParam = searchParams.get('timeRange');

    return {
      department: isValidDepartment(deptParam ?? '') ? deptParam as Department : 'adult',
      timeRange: isValidTimeRange(timeParam ?? '') ? timeParam as TimeRange : '6h',
    };
  });

  // Update URL when state changes
  const updateUrl = useCallback((newState: Partial<UrlState>) => {
    const params = new URLSearchParams(searchParams);

    if (newState.department) {
      params.set('department', newState.department);
    }
    if (newState.timeRange) {
      params.set('timeRange', newState.timeRange);
    }

    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // Set department and update URL
  const setDepartment = useCallback((department: Department) => {
    setState(prev => ({ ...prev, department }));
    updateUrl({ department });
  }, [updateUrl]);

  // Set time range and update URL
  const setTimeRange = useCallback((timeRange: TimeRange) => {
    setState(prev => ({ ...prev, timeRange }));
    updateUrl({ timeRange });
  }, [updateUrl]);

  // Listen for URL changes from browser back/forward
  useEffect(() => {
    const deptParam = searchParams.get('department');
    const timeParam = searchParams.get('timeRange');

    const newDepartment = isValidDepartment(deptParam ?? '') ? deptParam as Department : 'adult';
    const newTimeRange = isValidTimeRange(timeParam ?? '') ? timeParam as TimeRange : '6h';

    setState(prev => {
      if (prev.department !== newDepartment || prev.timeRange !== newTimeRange) {
        return { department: newDepartment, timeRange: newTimeRange };
      }
      return prev;
    });
  }, [searchParams]);

  return {
    department: state.department,
    timeRange: state.timeRange,
    setDepartment,
    setTimeRange,
  };
};