import React from 'react';
import { formatWaitTime, formatRelativeTime, getWaitTimeStatus, getUpdateDelayStatus } from '@/utils/formatters';

interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  subtitle?: string;
  timestamp?: string;
  delay?: number;
  variant?: 'primary' | 'secondary';
  className?: string;
  isLoading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  timestamp,
  delay,
  variant = 'secondary',
  className = '',
  isLoading = false
}) => {
  // Get status styling for wait time metrics
  const waitTimeStatus = typeof value === 'number' && title.toLowerCase().includes('wait')
    ? getWaitTimeStatus(value)
    : null;

  // Get update delay status
  const delayStatus = delay ? getUpdateDelayStatus(delay) : null;

  const isPrimary = variant === 'primary';

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border transition-all duration-200
        ${isPrimary
          ? 'bg-white dark:bg-gray-800 border-primary-blue/20 shadow-lg hover:shadow-xl'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md'
        }
        ${isLoading ? 'animate-pulse' : ''}
        ${className}
      `}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="w-6 h-6 animate-spin">
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
        </div>
      )}

      {/* Status indicator for wait times */}
      {waitTimeStatus && (
        <div
          className="absolute top-0 left-0 w-full h-1"
          style={{ backgroundColor: waitTimeStatus.color }}
        />
      )}

      <div className={`p-4 ${isPrimary ? 'sm:p-6' : 'sm:p-5'}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <h3 className={`
            font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide text-xs
            ${isPrimary ? 'sm:text-sm' : ''}
          `}>
            {title}
          </h3>

          {delayStatus && (
            <span
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: delayStatus.color + '20',
                color: delayStatus.color
              }}
            >
              {delayStatus.message}
            </span>
          )}
        </div>

        {/* Main value */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className={`
            font-bold text-gray-900 dark:text-white
            ${isPrimary ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-3xl'}
            ${waitTimeStatus ? '' : ''}
          `}
          style={waitTimeStatus ? { color: waitTimeStatus.color } : {}}
          >
            {typeof value === 'number' && title.toLowerCase().includes('wait')
              ? formatWaitTime(value)
              : value
            }
          </span>
          {unit && !title.toLowerCase().includes('wait') && (
            <span className={`
              text-gray-500 dark:text-gray-400 font-medium
              ${isPrimary ? 'text-lg sm:text-xl' : 'text-base'}
            `}>
              {unit}
            </span>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {subtitle}
          </p>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatRelativeTime(timestamp)}</span>
          </div>
        )}

        {/* Wait time status message */}
        {waitTimeStatus && isPrimary && (
          <div
            className="mt-3 px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: waitTimeStatus.bgColor,
              color: waitTimeStatus.textColor
            }}
          >
            {waitTimeStatus.status === 'good' && '✅ Good - Short wait time'}
            {waitTimeStatus.status === 'moderate' && '⚠️ Moderate - Average wait time'}
            {waitTimeStatus.status === 'high' && '🟠 High - Longer wait expected'}
            {waitTimeStatus.status === 'critical' && '🔴 Critical - Very long wait'}
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;