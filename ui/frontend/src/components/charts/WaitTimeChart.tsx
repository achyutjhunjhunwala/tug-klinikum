import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import type { HospitalMetricsResponse } from '@shared/types/hospital';
import { useTheme } from '@/hooks/useTheme';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface WaitTimeChartProps {
  data: HospitalMetricsResponse;
  className?: string;
}

const WaitTimeChart: React.FC<WaitTimeChartProps> = ({ data, className = '' }) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const chartData = useMemo(() => {
    const historicalData = data.data.historical || [];

    return {
      labels: historicalData.map(item => new Date(item.timestamp)),
      datasets: [
        {
          label: 'Wait Time (minutes)',
          data: historicalData.map(item => item.waitTimeMinutes),
          borderColor: isDark ? '#60A5FA' : '#2563EB',
          backgroundColor: isDark ? '#60A5FA20' : '#2563EB20',
          pointBackgroundColor: isDark ? '#60A5FA' : '#2563EB',
          pointBorderColor: isDark ? '#1E293B' : '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Total Patients',
          data: historicalData.map(item => item.totalPatients || 0),
          borderColor: isDark ? '#34D399' : '#059669',
          backgroundColor: isDark ? '#34D39920' : '#05966920',
          pointBackgroundColor: isDark ? '#34D399' : '#059669',
          pointBorderColor: isDark ? '#1E293B' : '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: false,
          yAxisID: 'y1',
        },
        {
          label: 'Ambulance Patients',
          data: historicalData.map(item => item.ambulancePatients || 0),
          borderColor: isDark ? '#F59E0B' : '#D97706',
          backgroundColor: isDark ? '#F59E0B20' : '#D9770620',
          pointBackgroundColor: isDark ? '#F59E0B' : '#D97706',
          pointBorderColor: isDark ? '#1E293B' : '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: false,
          yAxisID: 'y1',
        },
        {
          label: 'Emergency Cases',
          data: historicalData.map(item => item.emergencyCases || 0),
          borderColor: isDark ? '#EF4444' : '#DC2626',
          backgroundColor: isDark ? '#EF444420' : '#DC262620',
          pointBackgroundColor: isDark ? '#EF4444' : '#DC2626',
          pointBorderColor: isDark ? '#1E293B' : '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: false,
          yAxisID: 'y1',
        },
      ],
    };
  }, [data, isDark]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          color: isDark ? '#E5E7EB' : '#374151',
          font: {
            size: 12,
            family: 'Inter, system-ui, sans-serif',
          },
        },
      },
      title: {
        display: true,
        text: 'Historical Wait Times and Patient Metrics',
        color: isDark ? '#F3F4F6' : '#111827',
        font: {
          size: 16,
          weight: 'bold',
          family: 'Inter, system-ui, sans-serif',
        },
        padding: {
          bottom: 20,
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
        titleColor: isDark ? '#F3F4F6' : '#111827',
        bodyColor: isDark ? '#E5E7EB' : '#374151',
        borderColor: isDark ? '#374151' : '#E5E7EB',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        displayColors: true,
        callbacks: {
          title: (context) => {
            const date = new Date(context[0].parsed.x);
            return date.toLocaleString();
          },
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;

            if (label === 'Wait Time (minutes)') {
              return `${label}: ${value} minutes`;
            } else if (label.includes('Patients') || label.includes('Cases')) {
              return `${label}: ${value}`;
            }
            return `${label}: ${value}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            hour: 'HH:mm',
            day: 'MMM dd',
          },
        },
        grid: {
          color: isDark ? '#374151' : '#E5E7EB',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11,
            family: 'Inter, system-ui, sans-serif',
          },
          maxTicksLimit: 8,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Wait Time (minutes)',
          color: isDark ? '#9CA3AF' : '#6B7280',
          font: {
            size: 12,
            family: 'Inter, system-ui, sans-serif',
          },
        },
        grid: {
          color: isDark ? '#374151' : '#E5E7EB',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11,
            family: 'Inter, system-ui, sans-serif',
          },
          callback: function(value) {
            return `${value}m`;
          },
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Patient Count',
          color: isDark ? '#9CA3AF' : '#6B7280',
          font: {
            size: 12,
            family: 'Inter, system-ui, sans-serif',
          },
        },
        grid: {
          drawOnChartArea: false,
          color: isDark ? '#374151' : '#E5E7EB',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11,
            family: 'Inter, system-ui, sans-serif',
          },
          callback: function(value) {
            return `${value}`;
          },
        },
      },
    },
    elements: {
      point: {
        hoverBorderWidth: 3,
      },
    },
  }), [isDark]);

  if (!data?.data?.historical?.length) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
        <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>No historical data available</p>
            <p className="text-sm mt-1">Charts will appear when data is collected</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
      <div className="h-80">
        <Line data={chartData} options={options} />
      </div>

      {/* Chart Statistics */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Data Points</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {data.data.historical.length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Avg Wait Time</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {Math.round(
                data.data.historical.reduce((sum, item) => sum + item.waitTimeMinutes, 0) /
                data.data.historical.length
              )}m
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Min Wait Time</div>
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">
              {Math.min(...data.data.historical.map(item => item.waitTimeMinutes))}m
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Max Wait Time</div>
            <div className="text-lg font-semibold text-red-600 dark:text-red-400">
              {Math.max(...data.data.historical.map(item => item.waitTimeMinutes))}m
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaitTimeChart;