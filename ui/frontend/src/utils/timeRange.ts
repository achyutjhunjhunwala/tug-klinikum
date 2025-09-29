import type { TimeRange } from '@shared/types/hospital';

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; description: string }[] = [
  { value: '6h', label: '6 Hours', description: 'Last 6 hours' },
  { value: '24h', label: '24 Hours', description: 'Last 24 hours' },
  { value: '7d', label: '7 Days', description: 'Last 7 days' },
  { value: '15d', label: '15 Days', description: 'Last 15 days' },
  { value: '1m', label: '1 Month', description: 'Last month' },
  { value: '3m', label: '3 Months', description: 'Last 3 months' },
];

export function getTimeRangeLabel(timeRange: TimeRange): string {
  const option = TIME_RANGE_OPTIONS.find(opt => opt.value === timeRange);
  return option?.label || timeRange;
}

export function getTimeRangeDescription(timeRange: TimeRange): string {
  const option = TIME_RANGE_OPTIONS.find(opt => opt.value === timeRange);
  return option?.description || timeRange;
}

export function isValidTimeRange(value: string): value is TimeRange {
  return TIME_RANGE_OPTIONS.some(opt => opt.value === value);
}