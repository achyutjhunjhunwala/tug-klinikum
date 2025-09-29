import { formatDistanceToNow, format, parseISO } from 'date-fns';

/**
 * Format wait time in minutes to a human-readable string
 */
export function formatWaitTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format timestamp to relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Format timestamp to absolute time
 */
export function formatAbsoluteTime(timestamp: string | Date, formatString = 'MMM d, HH:mm'): string {
  const date = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
  return format(date, formatString);
}

/**
 * Format data quality score to percentage
 */
export function formatDataQuality(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Format large numbers with appropriate suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Get status color based on wait time
 */
export function getWaitTimeStatus(minutes: number): {
  color: string;
  bgColor: string;
  textColor: string;
  status: 'good' | 'moderate' | 'high' | 'critical';
} {
  if (minutes <= 30) {
    return {
      status: 'good',
      color: '#10b981',
      bgColor: '#d1fae5',
      textColor: '#065f46'
    };
  } else if (minutes <= 60) {
    return {
      status: 'moderate',
      color: '#f59e0b',
      bgColor: '#fef3c7',
      textColor: '#92400e'
    };
  } else if (minutes <= 120) {
    return {
      status: 'high',
      color: '#f97316',
      bgColor: '#fed7aa',
      textColor: '#9a3412'
    };
  } else {
    return {
      status: 'critical',
      color: '#ef4444',
      bgColor: '#fecaca',
      textColor: '#991b1b'
    };
  }
}

/**
 * Get update delay status
 */
export function getUpdateDelayStatus(delayMinutes: number): {
  status: 'fresh' | 'recent' | 'stale' | 'very_stale';
  color: string;
  message: string;
} {
  if (delayMinutes <= 5) {
    return {
      status: 'fresh',
      color: '#10b981',
      message: 'Live data'
    };
  } else if (delayMinutes <= 15) {
    return {
      status: 'recent',
      color: '#f59e0b',
      message: 'Recent data'
    };
  } else if (delayMinutes <= 60) {
    return {
      status: 'stale',
      color: '#f97316',
      message: 'Delayed data'
    };
  } else {
    return {
      status: 'very_stale',
      color: '#ef4444',
      message: 'Old data'
    };
  }
}