# 📝 Logging Architecture

## Overview

This document explains how logging works across all services in the TUG-Klinikum hospital monitoring system.

## Logging Flow

```
┌─────────────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Hospital Scraper   │─────▶│     OTEL     │─────▶│ Elasticsearch   │
│   (Main App)        │ OTLP │  Collector   │      │  (hospital-     │
│                     │      │              │      │   scraper-logs) │
└─────────────────────┘      └──────────────┘      └─────────────────┘
                                    ▲
                                    │ OTLP
                                    │
┌─────────────────────┐             │
│   UI Backend API    │             │
│   (Express/Node)    │─────────────┘
│                     │
│  Also writes to:    │
│  /app/logs/*.log    │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│     Filebeat        │
│  (Log Collector)    │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│   Elasticsearch     │
│   (filebeat-*)      │
└─────────────────────┘
```

## Services and Their Logs

### 1. Hospital Scraper (Main Application)

**Log Destination:**
- Sends logs via **OTLP protocol** to OTEL Collector
- Also writes to file: `/app/logs/hospital-scraper.log`

**Elasticsearch Index:**
- `hospital-scraper-logs` (via OTEL Collector)

**How to View in Kibana:**
```
Index Pattern: hospital-scraper-logs*
Filter: service: "hospital-scraper"
```

---

### 2. UI Backend API (Express Server)

**Log Destination:**
- Writes to file: `/app/logs/hospital-ui-api.log`
- Collected by **Filebeat** from Docker volume: `hospital-ui-logs`

**Elasticsearch Index:**
- `filebeat-*` (default Filebeat index)

**How to View in Kibana:**
```
Index Pattern: filebeat-*
Filter: app: "hospital-ui"
Fields to check:
  - app: "hospital-ui"
  - service: "tug-klinikum-api"
  - level: "info" | "warn" | "error" | "debug"
```

**Sample Log Structure:**
```json
{
  "@timestamp": "2025-10-26T12:34:56.789Z",
  "level": "info",
  "service": "tug-klinikum-api",
  "version": "1.0.0",
  "environment": "production",
  "message": "API request completed",
  "app": "hospital-ui",
  "http": {
    "method": "GET",
    "path": "/api/hospital/recent",
    "status_code": 200,
    "duration_ms": 45
  }
}
```

---

### 3. OTEL Collector

**Internal Logs:**
- Console output (check Docker logs: `docker logs hospital-scraper-otel`)
- Log level: `info` (configured in telemetry section)

**What it does:**
- Receives logs from applications via OTLP (port 4317/4318)
- Forwards to Elasticsearch with proper formatting
- Handles traces, metrics, and logs

---

### 4. Filebeat

**Internal Logs:**
- `/var/log/filebeat/filebeat` (inside container)
- Console output (check Docker logs: `docker logs hospital-scraper-filebeat`)

**What it monitors:**
```yaml
Paths:
  - /app/logs/scraper/*.log  → app: "hospital-scraper"
  - /app/logs/ui/*.log       → app: "hospital-ui"
```

---

## Troubleshooting

### UI Backend Logs Not Appearing in Kibana

1. **Check if logs are being written to file:**
   ```bash
   docker exec hospital-ui-server ls -la /app/logs/
   docker exec hospital-ui-server cat /app/logs/hospital-ui-api.log
   ```

2. **Check Filebeat is running:**
   ```bash
   docker logs hospital-scraper-filebeat
   ```

3. **Check Filebeat configuration:**
   ```bash
   docker exec hospital-scraper-filebeat cat /usr/share/filebeat/filebeat.yml
   ```

4. **Check Elasticsearch connectivity:**
   ```bash
   docker logs hospital-scraper-filebeat | grep -i "error\|connection"
   ```

5. **Verify volume is mounted:**
   ```bash
   docker inspect hospital-ui-server | grep -A 10 "Mounts"
   docker inspect hospital-scraper-filebeat | grep -A 10 "Mounts"
   ```

### OTEL Collector Not Forwarding Logs

1. **Check OTEL collector logs:**
   ```bash
   docker logs hospital-scraper-otel
   ```

2. **Check if OTEL collector can reach Elasticsearch:**
   ```bash
   docker exec hospital-scraper-otel wget --spider ${ELASTICSEARCH_CLOUD_URL}
   ```

3. **Check environment variables:**
   ```bash
   docker exec hospital-scraper-otel env | grep ELASTIC
   ```

---

## Kibana Query Examples

### View All UI Backend Logs
```
index: filebeat-*
filter: app: "hospital-ui"
sort: @timestamp desc
```

### View API Errors
```
index: filebeat-*
filter: app: "hospital-ui" AND level: "error"
sort: @timestamp desc
```

### View Rate Limit Events
```
index: filebeat-*
filter: app: "hospital-ui" AND message: "Rate limit*"
sort: @timestamp desc
```

### View API Performance (duration > 1000ms)
```
index: filebeat-*
filter: app: "hospital-ui" AND http.duration_ms: >1000
sort: http.duration_ms desc
```

---

## Log Levels

All services use the `LOG_LEVEL` environment variable:

- `debug` - Verbose logging (development)
- `info` - Standard logging (production default)
- `warn` - Warnings only
- `error` - Errors only

Set in `.env`:
```bash
LOG_LEVEL=info
```

---

## Log Retention

**Elasticsearch:**
- Configure ILM (Index Lifecycle Management) policies
- Default: depends on your Elasticsearch Cloud plan

**Docker Volumes:**
- Logs persist in named volumes
- Clean up old logs manually if needed:
  ```bash
  docker exec hospital-ui-server sh -c "find /app/logs -name '*.log' -mtime +7 -delete"
  ```

---

## Future Enhancements

1. **Unified OTLP Logging:** Migrate UI backend to send logs directly to OTEL Collector instead of using Filebeat
2. **Log Aggregation:** Add correlation IDs across services for distributed tracing
3. **Alerting:** Set up Kibana Watcher alerts for error spikes
4. **Metrics Dashboard:** Create Kibana dashboards for API performance monitoring

