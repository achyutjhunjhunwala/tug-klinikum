// Simplified telemetry setup to avoid dependency conflicts
// For now, we'll disable OpenTelemetry and focus on structured logging

import { PinoLogger } from './logger';

let telemetryInitialized = false;
const logger = new PinoLogger();

export function initializeTelemetry(): void {
  if (telemetryInitialized) {
    return; // Already initialized
  }

  // For now, we'll just mark as initialized and log
  // OpenTelemetry setup can be enhanced later once dependencies are resolved
  telemetryInitialized = true;
  logger.info('Observability initialized (logging-focused)');
}

export function shutdownTelemetry(): Promise<void> {
  telemetryInitialized = false;
  return Promise.resolve();
}