// Interfaces
export type {
  ObservabilityProvider,
  ObservabilityConfig,
  ObservabilityMetrics,
  ObservabilityLogger,
  ObservabilityTracer,
} from './interfaces/observability-provider.interface';

// OTEL implementations
export { OtelMetrics } from './otel/metrics';
export { OtelTracer } from './otel/tracer';

// Provider implementations
export { BaseObservabilityProvider } from './implementations/base-observability';
export { ElasticObservabilityProvider } from './implementations/elastic-observability';

// Factory
export { ObservabilityFactory } from './factory';
export type { ObservabilityProviderType } from './factory';
