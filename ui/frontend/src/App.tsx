import React from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Header from '@/components/common/Header';
import MetricCard from '@/components/metrics/MetricCard';
import Loading from '@/components/common/Loading';
import WaitTimeChart from '@/components/charts/WaitTimeChart';
import { useHospitalData, useApiHealth } from '@/hooks/useHospitalData';
import { useUrlState } from '@/hooks/useUrlState';

const Dashboard: React.FC = () => {
  const { department, timeRange, setDepartment, setTimeRange } = useUrlState();

  const { data, isLoading, error, lastRefresh, refetch, isConnected } = useHospitalData({
    department,
    timeRange,
    autoRefresh: true,
  });

  const { isHealthy } = useApiHealth();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Emergency Warning Banner */}
      <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-center text-center">
            <div className="text-red-800 dark:text-red-200 text-sm font-medium">
              🚨 <strong>Emergency:</strong> Call 112 | <strong>Medical Advice:</strong> Call 116117 |
              The data below is for <strong>non-emergency situations only</strong>
            </div>
          </div>
        </div>
      </div>

      <Header
        department={department}
        timeRange={timeRange}
        onDepartmentChange={setDepartment}
        onTimeRangeChange={setTimeRange}
        lastRefresh={lastRefresh}
        isLoading={isLoading}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 safe-area-inset">
        {/* Connection Status */}
        {(!isConnected || !isHealthy) && (
          <div className="mb-6">
            <div className="alert alert-warning">
              <div className="flex items-center gap-2">
                <div className="status-dot status-offline"></div>
                <span>
                  {!isConnected
                    ? 'Connection issues detected. Data may be outdated.'
                    : 'API server is experiencing issues.'
                  }
                </span>
                <button
                  onClick={refetch}
                  className="btn-ghost text-xs ml-auto"
                  disabled={isLoading}
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6">
            <div className="alert alert-error">
              <div className="flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={refetch}
                  className="btn-ghost text-xs"
                  disabled={isLoading}
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !data && (
          <div className="flex justify-center py-12">
            <Loading size="lg" text="Loading hospital data..." />
          </div>
        )}

        {/* Dashboard Content */}
        {data && (
          <div className="space-y-6">
            {/* Primary Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {/* Main Wait Time Card */}
              <div className="sm:col-span-2 lg:col-span-2">
                <MetricCard
                  title="Emergency Room Wait Time"
                  value={data.data.current.waitTimeMinutes}
                  subtitle={`${department === 'adult' ? 'Adult' : 'Children'} Emergency Department`}
                  timestamp={data.data.current.lastUpdated}
                  delay={data.data.current.updateDelayMinutes}
                  variant="primary"
                  className="h-full"
                  isLoading={isLoading}
                />
              </div>

              {/* Secondary Metrics */}
              <MetricCard
                title="Total Patients"
                value={data.data.current.totalPatients || 0}
                subtitle="Currently in treatment"
                variant="secondary"
                isLoading={isLoading}
              />

              <MetricCard
                title="Ambulance Arrivals"
                value={data.data.current.ambulancePatients || 0}
                subtitle="Patients via ambulance"
                variant="secondary"
                isLoading={isLoading}
              />
            </div>

            {/* Additional Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              <MetricCard
                title="Emergency Cases"
                value={data.data.current.emergencyCases || 0}
                subtitle="Life-threatening cases"
                variant="secondary"
                isLoading={isLoading}
              />

              <MetricCard
                title="Data Quality"
                value={`${Math.round(data.data.metadata.dataQuality * 100)}%`}
                subtitle="Information accuracy"
                variant="secondary"
                isLoading={isLoading}
              />

              <MetricCard
                title="Historical Records"
                value={data.data.metadata.totalRecords}
                subtitle={`Over ${timeRange}`}
                variant="secondary"
                isLoading={isLoading}
              />
            </div>

            {/* Charts Section */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Historical Trends
              </h2>
              <WaitTimeChart data={data} />
            </div>
          </div>
        )}

        {/* Empty State */}
        {!data && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No data available
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Unable to load hospital wait time data.
              </p>
              <button onClick={refetch} className="btn-primary">
                Try Again
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              ❤️ Made with love in Berlin by TheUiGuy
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Dashboard />
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
