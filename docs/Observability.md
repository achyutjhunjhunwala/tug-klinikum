# 📊 Observability Guide

## Overview

Complete monitoring stack using OpenTelemetry for metrics, traces, and logs - all flowing to Elasticsearch Cloud for unified observability.

## Stack Components

- **Metrics**: OpenTelemetry → Elasticsearch APM
- **Traces**: Distributed tracing with correlation IDs
- **Logs**: Structured JSON with Pino → Elasticsearch

## Key Metrics

### Business Metrics
- `hospital_wait_time`: Current wait time by department
- `hospital_patients_total`: Patient counts by type and department
- `records_inserted_total`: Successful data storage by department

### Technical Metrics
- `scraping_duration_seconds`: Time per department scraping
- `scraping_success_total`: Success/failure counters
- `database_operation_duration_seconds`: DB performance
- `browser_navigation_duration_seconds`: Browser performance

### Error Metrics
- `scraping_errors_total`: Errors by type and department
- `retry_attempts_total`: Retry operations by reason
- `browser_crashes_total`: Browser stability issues

## Distributed Tracing

### Trace Hierarchy
```
job_execution (8-12s)
├── scraping_department_adult (4-6s)
│   ├── browser_initialize (1-2s)
│   ├── page_navigation (2-3s)
│   ├── data_extraction (0.5-1s)
│   └── database_insert (0.5-1s)
└── scraping_department_children (4-6s)
    ├── browser_initialize (1-2s)
    ├── page_navigation (2-3s)
    ├── data_extraction (0.5-1s)
    └── database_insert (0.5-1s)
```

### Span Attributes
- **Business Context**: `department`, `wait_time`, `patient_count`
- **Technical Context**: `browser_type`, `retry_count`, `url`
- **Performance**: `duration_ms`, `memory_usage_mb`

## Logging Strategy

### Log Levels
- **INFO**: Successful operations, business events
- **WARN**: Retries, performance issues
- **ERROR**: Failed operations, system errors
- **DEBUG**: Detailed scraping steps (development only)

### Log Structure
```json
{
  "@timestamp": "2025-09-16T17:56:31.966Z",
  "level": "info",
  "message": "Starting scraping for department",
  "service": {"name": "hospital-scraper", "version": "1.0.0"},
  "jobId": "32a1c912-275f-426c-805f-06d02548d69b",
  "department": "adult",
  "url": "https://www.vivantes.de/...",
  "correlation_id": "598f6a5e-a7ad-487f-9460-a1c2c9d8ab9a"
}
```

### Context Enrichment
- **Correlation IDs**: Track operations across components
- **Department Context**: Always include department field
- **Performance Data**: Duration, memory usage, retry counts
- **Business Data**: Wait times, patient counts when available

## Configuration

### Environment Variables
```bash
# Observability
OTEL_SERVICE_NAME=hospital-scraper
OTEL_SERVICE_VERSION=1.0.0
LOG_LEVEL=info  # debug|info|warn|error

# Elasticsearch APM
ELASTICSEARCH_APM_URL=https://your-deployment.apm.region.cloud.es.io:443
ELASTICSEARCH_APM_SECRET_TOKEN=your_token
```

### Sampling Configuration
- **Traces**: 100% sampling (low volume application)
- **Metrics**: All metrics collected
- **Logs**: All levels in production

## Monitoring Dashboards

### Kibana APM
- **Service Map**: Dependency relationships
- **Performance**: Response times, throughput
- **Errors**: Error rates and details
- **Traces**: End-to-end request flows

### Kibana Discover
- **Index Pattern**: `filebeat-*`
- **Filters**:
  - `service.name: "hospital-scraper"`
  - `department: "adult" OR "children"`
  - Log level filtering

### Custom Dashboards
- **Hospital Metrics**: Wait times by department over time
- **System Health**: Success rates, error trends
- **Performance**: Scraping duration trends

## Health Monitoring

### Health Check Endpoint
```bash
curl http://localhost:3000/health
```

### Response Format
```json
{
  "status": "healthy",
  "uptime": 3600,
  "components": [
    {"name": "database", "status": "healthy", "responseTime": 341},
    {"name": "scraper", "status": "healthy", "responseTime": 49},
    {"name": "observability", "status": "healthy", "responseTime": 0}
  ],
  "memoryUsage": "47MB"
}
```

## Alerting (Recommended)

### Critical Alerts
- **No Data**: No successful scrapes in 60+ minutes
- **High Error Rate**: >20% failures over 30 minutes
- **System Down**: Health check failures

### Warning Alerts
- **Performance Degradation**: Scraping duration >120 seconds
- **Unusual Wait Times**: >300 minutes or data anomalies
- **Memory Issues**: Memory usage >80%

## Troubleshooting

### Common Debug Queries

#### Recent Errors
```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"service.name": "hospital-scraper"}},
        {"term": {"level": "error"}},
        {"range": {"@timestamp": {"gte": "now-1h"}}}
      ]
    }
  },
  "sort": [{"@timestamp": {"order": "desc"}}]
}
```

#### Department Performance
```json
{
  "query": {"term": {"service.name": "hospital-scraper"}},
  "aggs": {
    "by_department": {
      "terms": {"field": "department"},
      "aggs": {
        "avg_duration": {"avg": {"field": "duration_ms"}}
      }
    }
  }
}
```

### Debug Commands
```bash
# Check recent logs
docker logs hospital-scraper-app | tail -50

# Health check
curl -s http://localhost:3000/health | jq

# APM traces in Kibana
# Navigate to APM → Services → hospital-scraper
```

## OpenTelemetry Implementation

### Key Patterns Used
- **Automatic Instrumentation**: HTTP, database calls
- **Manual Spans**: Business logic spans
- **Baggage Propagation**: Context across async operations
- **Resource Attributes**: Service metadata

### Code Examples
```typescript
// Create business span
const span = tracer.startSpan('scrape_department', {
  attributes: {
    'department': 'adult',
    'url': targetUrl
  }
});

// Add business context
span.setAttributes({
  'wait_time': waitTime,
  'patient_count': patientCount
});

// Record error
span.recordException(error);
span.setStatus({ code: SpanStatusCode.ERROR });
```

---

**This observability setup provides production-ready monitoring while remaining simple and maintainable for a dual-department scraping application.**