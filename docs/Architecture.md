# 🏗️ Architecture Overview

## System Purpose

Simple, automated monitoring of emergency room wait times from Vivantes Friedrichshain Hospital's Adult and Children departments.

## High-Level Architecture

```
Cron Scheduler → Job Runner → Playwright Scraper → Elasticsearch
     ↓               ↓             ↓                    ↓
  Every 30min    Sequential    Browser automation    Time-series
               dual URL loop   with data extraction     storage
```

## Core Components

### 1. **Job Runner** (`src/scheduler/job-runner.ts`)
- **Purpose**: Orchestrates scraping of both department URLs sequentially
- **Flow**: Adult URL → Children URL (one after another)
- **Department Tagging**: Adds department field to each record

### 2. **Playwright Scraper** (`src/scraper/playwright-scraper.ts`)
- **Purpose**: Browser-based data extraction
- **Browser**: System Chromium in headless mode
- **Features**: Retry logic, error handling, performance tracking

### 3. **Data Extractor** (`src/scraper/data-extractor.ts`)
- **Purpose**: Parse DOM elements for hospital metrics
- **Extracts**: Wait times, patient counts, emergency cases
- **Validation**: Schema validation with Zod

### 4. **Database Client** (`src/database/implementations/elasticsearch-client.ts`)
- **Purpose**: Store time-series data in Elasticsearch
- **Index**: Single index with department classification
- **Features**: Health checks, connection retry

### 5. **Observability** (`src/observability/`)
- **Metrics**: OpenTelemetry metrics to Elasticsearch APM
- **Logs**: Structured JSON logs with correlation IDs
- **Traces**: Distributed tracing for debugging

## Data Flow

```
1. Cron triggers every 30 minutes
2. Job Runner loops through URLs:
   - Adult: https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle
   - Children: https://www.vivantes.de/.../kinder-jugendmedizin/kinderrettungsstelle
3. For each URL:
   - Launch browser
   - Navigate to page
   - Extract data (wait time, patients, etc.)
   - Tag with department
   - Store in Elasticsearch
   - Clean up browser
4. Complete after both departments processed
```

## Configuration

### Required Environment Variables
```bash
ELASTICSEARCH_CLOUD_URL=https://your-deployment.es.region.cloud.es.io:9200
ELASTICSEARCH_API_KEY=your_api_key
```

### Optional Configuration
```bash
ADULT_TARGET_URL=https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle
CHILDREN_TARGET_URL=https://www.vivantes.de/.../kinder-jugendmedizin/kinderrettungsstelle
SCRAPING_INTERVAL=30  # minutes
LOG_LEVEL=info
```

## Data Schema

Records stored in Elasticsearch with this structure:

```typescript
interface HospitalMetric {
  id: string;
  timestamp: Date;
  department: 'adult' | 'children';  // Key differentiator
  waitTimeMinutes: number;
  totalPatients?: number;
  ambulancePatients?: number;
  emergencyCases?: number;
  updateDelayMinutes?: number;
  scrapingSuccess: boolean;
  sourceUrl: string;
  metadata: {
    scraperId: string;
    version: string;
    processingTimeMs: number;
    // ... other metadata
  };
}
```

## Elasticsearch Index Management

### Production-Ready Index Strategy
- **Approach**: Automatic production infrastructure setup on first application startup
- **Method**: `ensureProductionInfrastructure()` sets up templates, ILM policies, and indices
- **Frequency**: Idempotent - safe to run multiple times, won't duplicate resources

### Index Templates & ILM Policies

The application automatically creates production-ready Elasticsearch infrastructure:

#### **Index Template**: `hospital-scraping-template`
```json
{
  "index_patterns": ["hospital-metrics*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.lifecycle.name": "hospital-scraping-ilm-policy",
      "index.refresh_interval": "30s",
      "index.codec": "best_compression"
    },
    "mappings": {
      "properties": {
        "department": { "type": "keyword", "fields": { "text": { "type": "text" } } },
        "timestamp": { "type": "date", "format": "date_time||date_time_no_millis||epoch_millis" },
        "waitTimeMinutes": { "type": "integer", "meta": { "unit": "minutes" } },
        "sourceUrl": { "type": "keyword", "index": false, "store": true },
        // ... comprehensive field mappings with metadata
      }
    }
  }
}
```

#### **ILM Policy**: `hospital-scraping-ilm-policy`
```json
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_size": "50GB", "max_age": "30d", "max_docs": 1000000 },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "allocate": { "number_of_replicas": 0 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "90d",
        "actions": {
          "allocate": { "number_of_replicas": 0 },
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": { "delete": {} }
      }
    }
  }
}
```

### Production Infrastructure Setup

#### ✅ **Automated Setup Process**
1. **ILM Policy Creation**: Sets up 4-phase data lifecycle management
2. **Index Template Creation**: Defines settings and mappings for all future indices
3. **Index Creation**: Creates initial index following template standards
4. **Graceful Fallback**: Falls back to basic index if template setup fails

#### ✅ **Production Benefits**
- **Cost Management**: Automatic data lifecycle with tier transitions
- **Performance Optimization**: Compression, refresh intervals, segment merging
- **Storage Efficiency**: Replica reduction, force merging in warm phase
- **Automatic Cleanup**: Data deletion after 1 year
- **Rollover Management**: Prevents indices from growing too large

#### ✅ **Operational Excellence**
- **Zero Configuration**: Fully automated setup, no manual Kibana configuration needed
- **Idempotent Operations**: Safe to restart application multiple times
- **Comprehensive Logging**: Clear status messages for infrastructure setup
- **Error Resilience**: Continues with basic functionality if advanced features fail

#### **Data Lifecycle Flow**
```
Hot Tier (0-30d)    →    Warm Tier (30-90d)    →    Cold Tier (90-365d)    →    Deleted (365d+)
High priority             Reduced replicas            Lowest priority             Automatic cleanup
Fast access              Optimized storage           Archive storage             Cost control
Rollover triggers        Force merged                 No replicas                 
```

#### **Infrastructure Methods**
```typescript
// Available on DatabaseClient interface
await client.setupILMPolicies();           // Create lifecycle policies
await client.setupIndexTemplates();        // Create index templates  
await client.ensureProductionInfrastructure(); // Full setup orchestration
```

### Index Naming & Management

- **Pattern**: `hospital-metrics` (single index) with template pattern `hospital-metrics*`
- **Rollover**: Automatic when hitting 50GB, 30 days, or 1M documents
- **Aliases**: Write alias for seamless rollover operations
- **Department Classification**: Single index with `department` field for both Adult and Children data

## Error Handling

### Retry Strategy
- **Max Attempts**: 5 with exponential backoff
- **Retryable Errors**: Network timeouts, browser crashes
- **Non-retryable**: Data parsing errors, authentication failures

### Resilience
- **Browser Crashes**: Automatic cleanup and restart
- **Network Issues**: Configurable timeouts and retries
- **Database Outages**: Local queuing (memory-based)

## Monitoring

### Health Checks
- **Endpoint**: `http://localhost:3000/health`
- **Components**: Database, scraper, observability

### Key Metrics
- `scraping_duration_seconds`: Time per department
- `records_inserted_total`: Success counter by department
- `hospital_wait_time`: Current wait time gauge
- `scraping_errors_total`: Error counter by type

### Logs
- **Format**: Structured JSON with ECS compliance
- **Context**: Correlation IDs, department, performance data
- **Levels**: DEBUG, INFO, WARN, ERROR

## Deployment

### Development
```bash
npm install
npm run build
npm start
```

### Production (Docker)
```bash
./start.sh  # Full containerized stack
```

### Architecture Benefits
- **Simple**: Single application, dual URL processing
- **Reliable**: Robust error handling and retries
- **Observable**: Comprehensive logging and metrics
- **Maintainable**: Clean separation of concerns
- **Scalable**: Can easily add more hospitals/departments

---

**Key Design Principle**: Solve the specific problem (dual URL scraping) with minimal complexity while maintaining production-grade reliability and observability.