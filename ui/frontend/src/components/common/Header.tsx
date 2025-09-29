import React from 'react';
import type { Department, TimeRange } from '@shared/types/hospital';
import { TIME_RANGE_OPTIONS } from '@/utils/timeRange';
import { ThemeToggle } from '@/contexts/ThemeContext';

interface HeaderProps {
  department: Department;
  timeRange: TimeRange;
  onDepartmentChange: (department: Department) => void;
  onTimeRangeChange: (timeRange: TimeRange) => void;
  lastRefresh?: Date | null;
  isLoading?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  department,
  timeRange,
  onDepartmentChange,
  onTimeRangeChange,
  lastRefresh,
  isLoading = false
}) => {
  const departments: { value: Department; label: string; icon: string }[] = [
    { value: 'adult', label: 'Adult Emergency', icon: '👥' },
    { value: 'children', label: 'Children Emergency', icon: '👶' },
  ];

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 safe-area">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Title */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                🏥 Hospital Wait Times
              </h1>
            </div>
            {lastRefresh && (
              <div className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Desktop Controls */}
          <div className="hidden sm:flex items-center gap-4">
            {/* Department Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="department" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Department:
              </label>
              <select
                id="department"
                value={department}
                onChange={(e) => onDepartmentChange(e.target.value as Department)}
                className="form-select text-sm"
                disabled={isLoading}
              >
                {departments.map((dept) => (
                  <option key={dept.value} value={dept.value}>
                    {dept.icon} {dept.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="timeRange" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Range:
              </label>
              <select
                id="timeRange"
                value={timeRange}
                onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
                className="form-select text-sm"
                disabled={isLoading}
              >
                {TIME_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 animate-spin">
                  <svg
                    className="w-full h-full text-primary-blue"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Loading...</span>
              </div>
            )}
          </div>

          {/* Mobile Theme Toggle & Loading */}
          <div className="flex sm:hidden items-center gap-2">
            <ThemeToggle />
            {isLoading && (
              <div className="w-4 h-4 animate-spin">
                <svg
                  className="w-full h-full text-primary-blue"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Controls */}
        <div className="sm:hidden pb-4 safe-area-inset">
          {lastRefresh && (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center mb-3">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
          )}

          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <div>
              <label htmlFor="department-mobile" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Department
              </label>
              <select
                id="department-mobile"
                value={department}
                onChange={(e) => onDepartmentChange(e.target.value as Department)}
                className="form-select text-sm"
                disabled={isLoading}
              >
                {departments.map((dept) => (
                  <option key={dept.value} value={dept.value}>
                    {dept.icon} {dept.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="timeRange-mobile" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Time Range
              </label>
              <select
                id="timeRange-mobile"
                value={timeRange}
                onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
                className="form-select text-sm"
                disabled={isLoading}
              >
                {TIME_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;