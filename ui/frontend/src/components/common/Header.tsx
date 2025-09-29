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
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 safe-area shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-4 gap-3">
          {/* Left: Hospital Info + Title */}
          <div className="flex items-start gap-3">
            {/* Hospital Icon */}
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm-1 14h2v2h-2v-2zm0-8h2v6h-2V8z"/>
                </svg>
              </div>
            </div>

            {/* Hospital Name & Title */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                  Vivantes Klinikum Friedrichshain
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                  🚨 Live
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Berlin, Germany
                </span>
                <a
                  href="https://www.vivantes.de/kfh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors font-medium"
                >
                  <span>Hospital Website</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                {lastRefresh && (
                  <span className="hidden md:inline text-xs">
                    • Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Controls (Desktop) */}
          <div className="hidden sm:flex items-center gap-3">
            {/* Department Selector */}
            <select
              id="department"
              value={department}
              onChange={(e) => onDepartmentChange(e.target.value as Department)}
              className="form-select text-sm min-w-[200px]"
              disabled={isLoading}
            >
              {departments.map((dept) => (
                <option key={dept.value} value={dept.value}>
                  {dept.icon} {dept.label}
                </option>
              ))}
            </select>

            {/* Time Range Selector */}
            <select
              id="timeRange"
              value={timeRange}
              onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
              className="form-select text-sm min-w-[120px]"
              disabled={isLoading}
            >
              {TIME_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Loading Indicator */}
            {isLoading && (
              <div className="w-5 h-5 animate-spin">
                <svg
                  className="w-full h-full text-red-600"
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

          {/* Mobile: Theme Toggle & Loading */}
          <div className="flex sm:hidden items-center gap-2 ml-auto">
            <ThemeToggle />
            {isLoading && (
              <div className="w-5 h-5 animate-spin">
                <svg
                  className="w-full h-full text-red-600"
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
        <div className="sm:hidden border-t border-gray-200 dark:border-gray-700 pt-3 pb-4 safe-area-inset">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="department-mobile" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Department
              </label>
              <select
                id="department-mobile"
                value={department}
                onChange={(e) => onDepartmentChange(e.target.value as Department)}
                className="form-select text-sm w-full"
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
              <label htmlFor="timeRange-mobile" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Time Range
              </label>
              <select
                id="timeRange-mobile"
                value={timeRange}
                onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
                className="form-select text-sm w-full"
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