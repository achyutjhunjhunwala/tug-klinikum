import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Tracer, Span, SpanOptions } from '@opentelemetry/api';
import { ObservabilityTracer } from '@/observability/interfaces/observability-provider.interface';

export class OtelTracer implements ObservabilityTracer {
  private readonly tracer: Tracer;

  constructor(serviceName: string) {
    this.tracer = trace.getTracer(serviceName);
  }

  startSpan(name: string, options?: SpanOptions): Span {
    return this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      ...options,
    });
  }

  startActiveSpan<F extends (span: Span) => ReturnType<F>>(
    name: string,
    fnOrOptions?: F | SpanOptions,
    maybeFn?: F
  ): ReturnType<F> {
    if (typeof fnOrOptions === 'function') {
      return this.tracer.startActiveSpan(name, fnOrOptions);
    }
    
    const options = fnOrOptions || {};
    const fn = maybeFn!;
    
    return this.tracer.startActiveSpan(name, {
      kind: SpanKind.INTERNAL,
      ...options,
    }, fn);
  }

  recordException(span: Span, exception: Error): void {
    span.recordException(exception);
    span.setAttributes({
      'error.name': exception.name,
      'error.message': exception.message,
      'error.stack': exception.stack,
    });
  }

  setSpanStatus(span: Span, status: 'ok' | 'error', message?: string): void {
    const spanStatus = status === 'ok' ? SpanStatusCode.OK : SpanStatusCode.ERROR;
    if (message !== undefined) {
      span.setStatus({ code: spanStatus, message });
    } else {
      span.setStatus({ code: spanStatus });
    }
  }

  // Utility methods for common span patterns
  async wrapAsync<T>(
    name: string,
    operation: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T> {
    return this.startActiveSpan(name, options || {}, async (span) => {
      try {
        const result = await operation(span);
        this.setSpanStatus(span, 'ok');
        return result;
      } catch (error) {
        this.recordException(span, error as Error);
        this.setSpanStatus(span, 'error', (error as Error).message);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  wrapSync<T>(
    name: string,
    operation: (span: Span) => T,
    options?: SpanOptions
  ): T {
    return this.startActiveSpan(name, options || {}, (span) => {
      try {
        const result = operation(span);
        this.setSpanStatus(span, 'ok');
        return result;
      } catch (error) {
        this.recordException(span, error as Error);
        this.setSpanStatus(span, 'error', (error as Error).message);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}