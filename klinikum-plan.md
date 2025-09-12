# Vivantes Friedrichshain Hospital Data Scraping & Analytics Project

## Project Overview

**Goal**: Scrape wait times and patient data from Vivantes Friedrichshain hospital every 30 minutes, store historical data, and eventually provide AI-powered insights on optimal visit times.

**Target Website**: https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle

## Technical Feasibility Analysis

### ✅ Scraping Feasibility
- **Data Available**: Real-time wait times, patient counts, ambulance arrivals, emergency cases
- **Update Frequency**: Data refreshed every ~9 minutes (based on "zuletzt aktualisiert vor 9 min")
- **Technical Challenge**: Dynamic JavaScript rendering (requires headless browser)
- **Robots.txt**: Generally permissive, emergency room page not explicitly blocked

### ⚖️ Legal & Ethical Considerations
- **Germany/EU Law**: Web scraping is legal for publicly available data with proper attribution
- **GDPR Compliance**: No personal data involved (aggregate statistics only)
- **Rate Limiting**: 30-minute intervals are respectful (much slower than their 9-minute updates)
- **Best Practices**: Use proper User-Agent, respect server resources, monitor for changes

## Architecture Design

### Phase 1: Data Scraping & Storage (Focus)
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   Scheduler     │───▶│   Scraper    │───▶│  DB Abstraction │───▶│ Elasticsearch    │
│ (Docker Cron)   │    │ (Playwright) │    │     Layer       │    │   Cloud 9.1      │
└─────────────────┘    └──────────────┘    └─────────────────┘    └──────────────────┘
         │                       │                    │                    │
         ▼                       ▼                    ▼                    ▼
   - Every 30min           - Multi-browser      - Interface-based    - Cloud-hosted
   - Error handling        - Wait strategies    - Easy DB switching  - Managed service
   - OTEL metrics          - Data extraction    - Type-safe models   - Auto-scaling
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OTEL Observability Layer                     │
├─────────────────────┬───────────────────────────────────────────┤
│   Elastic Stack     │              Grafana Stack                │
│ - APM Server        │ - Prometheus (metrics)                    │
│ - Elasticsearch     │ - Loki (logs)                             │
│ - Kibana            │ - Tempo (traces)                          │
└─────────────────────┴───────────────────────────────────────────┘
```

### Phase 2: AI Analytics (Future)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  External Data  │───▶│   AI Processor   │───▶│  Insights API   │
│ (Weather/Events)│    │ (LLM + ML Model) │    │   (REST/Graph)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                    │
         ▼                       ▼                    ▼
   - Weather APIs          - Pattern analysis    - Best visit times
   - Event calendars       - Correlation detect  - Predictions
   - Seasonal data         - Trend forecasting   - Visualization
```

## Infrastructure Recommendation

### **Recommended: Dockerized Self-Hosted with Cloud Services** 🏆

**Architecture:**
- **Application**: Dockerized on Proxmox
- **Database**: Elasticsearch Cloud 9.1 (managed)  
- **Observability**: Dual-stack (Elastic + Grafana)

**Advantages:**
- **Cost-effective**: No serverless fees, managed Elasticsearch
- **Full control**: Custom scheduling, complete debugging access
- **Playwright-friendly**: No timeout constraints, multi-browser support
- **Scalable observability**: Learn both Elastic and Grafana stacks
- **Database flexibility**: Abstracted layer for easy migration

**Docker Architecture:**
```yaml
version: '3.8'
services:
  scraper-app:
    build: .
    environment:
      # Database Configuration
      - ELASTICSEARCH_CLOUD_URL
      - ELASTICSEARCH_API_KEY
      - DB_TYPE=elasticsearch
      
      # Grafana Cloud Configuration
      - GRAFANA_CLOUD_USER_ID
      - GRAFANA_CLOUD_API_KEY
      - GRAFANA_CLOUD_PROMETHEUS_URL
      - GRAFANA_CLOUD_LOKI_URL
      - GRAFANA_CLOUD_TEMPO_URL
      
      # OTEL Configuration
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
      - OTEL_SERVICE_NAME=hospital-scraper
      - OTEL_RESOURCE_ATTRIBUTES=service.version=1.0.0
      
      # Application Configuration
      - NODE_ENV=production
      - SCRAPING_INTERVAL=30
      - TIMEZONE=Europe/Berlin
    volumes:
      - ./config:/app/config:ro
    restart: unless-stopped
    
  # Local Grafana for development (optional)
  grafana-local:
    image: grafana/grafana
    ports: ["3000:3000"]
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    # Note: Production uses Grafana Cloud Free Tier
    
  # OTEL Collector (routes to both stacks)
  otel-collector:
    image: otel/opentelemetry-collector-contrib
    volumes: ["./otel-config.yaml:/etc/otel-collector-config.yaml"]
    ports: ["4317:4317", "4318:4318"]
```

## Database Strategy

### **Primary: Elasticsearch Cloud 9.1** 🎯

**Why Elasticsearch Cloud:**
- **Managed service**: No maintenance overhead
- **Version 9.1**: Latest features and performance improvements  
- **Time-series optimized**: Built-in time-based indexing and rollover
- **Scalable**: Auto-scaling based on usage
- **Integration**: Native Kibana integration

**Abstracted Database Layer Design:**
```typescript
interface DatabaseClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  insert(data: HospitalMetric): Promise<string>;
  query(filters: QueryFilter): Promise<HospitalMetric[]>;
  aggregateByTime(interval: string): Promise<TimeAggregation[]>;
  healthCheck(): Promise<boolean>;
}

// Implementations
class ElasticsearchClient implements DatabaseClient { /* ... */ }
class PostgreSQLClient implements DatabaseClient { /* ... */ }
```

**Data Model (Version 1):**
```typescript
interface HospitalMetric {
  id: string;
  timestamp: Date;
  waitTimeMinutes: number;
  totalPatients: number;
  ambulancePatients: number;
  emergencyCases: number;
  updateDelayMinutes: number;
  scrapingSuccess: boolean;
  sourceUrl: string;
  metadata: {
    scraperId: string;
    version: string;
    processingTime: number;
  };
}
```

**Migration Strategy:**
```typescript
// Factory pattern for easy database switching
class DatabaseFactory {
  static create(type: 'elasticsearch' | 'postgresql'): DatabaseClient {
    switch (type) {
      case 'elasticsearch': return new ElasticsearchClient();
      case 'postgresql': return new PostgreSQLClient();
    }
  }
}
```

## Technology Stack

### Phase 1 Stack
- **Runtime**: Node.js 20+ with TypeScript 5.x
- **Scraping**: Playwright (multi-browser support: Chrome, Firefox, Safari)
- **Scheduling**: node-cron with timezone support
- **Database**: Elasticsearch Cloud 9.1 (abstracted)
- **Observability**: OpenTelemetry (OTEL) SDK
- **Deployment**: Docker Compose on Proxmox
- **Configuration**: Environment-based with validation

### Observability Stack
**OTEL Integration:**
```typescript
// Unified observability interface
interface ObservabilityProvider {
  logger: Logger;
  metrics: Metrics;
  tracer: Tracer;
}

// Dual-stack support
class ElasticObservability implements ObservabilityProvider { }
class GrafanaObservability implements ObservabilityProvider { }
```

**Elastic Stack:**
- **Logs**: Elasticsearch Cloud → Kibana
- **Metrics**: Elasticsearch Cloud → Kibana  
- **Traces**: Elasticsearch APM → Kibana

**Grafana Stack:**
- **Logs**: Grafana Cloud (Loki) - Free Tier
- **Metrics**: Grafana Cloud (Prometheus) - Free Tier
- **Traces**: Grafana Cloud (Tempo) - Free Tier

### Phase 2 Stack (Future)
- **AI/ML**: OpenAI API or local Ollama
- **External APIs**: OpenWeatherMap, Berlin event calendars
- **Analytics**: D3.js or Chart.js for visualization
- **API**: Express.js with TypeScript + OTEL middleware

## Implementation Plan

### 🎯 Phase 1.1: Foundation & Core Scraper (Week 1-2)

1. **Project Setup & Architecture**
   - Initialize TypeScript project with strict configuration
   - Set up Docker Compose with multi-stack observability
   - Create abstracted database layer interface
   - Implement OTEL observability provider interface

2. **Scraping Engine**
   - Implement Playwright-based scraper (multi-browser)
   - Handle dynamic content loading with advanced wait strategies
   - Extract all available metrics (wait time, patient counts, etc.)
   - Add comprehensive error handling and retry logic with exponential backoff

3. **Database Abstraction Layer**
   - Design and implement DatabaseClient interface
   - Create ElasticsearchClient with Cloud 9.1 support
   - Add data validation, cleaning, and transformation
   - Implement connection pooling and health checks

4. **OTEL Observability Setup**
   - Configure OTEL collector for dual-stack routing
   - Implement structured logging with context correlation
   - Add custom metrics for scraping performance
   - Set up distributed tracing across components

### 🔄 Phase 1.2: Scheduling & Reliability (Week 3)
1. **Scheduler Implementation**
   - 30-minute interval scraping with node-cron
   - Configurable scraping intervals
   - Graceful shutdown handling

2. **Error Handling & Monitoring**
   - Comprehensive logging with Winston
   - Website change detection
   - Failed scrape notifications
   - Health check endpoints

3. **Data Quality**
   - Duplicate detection and prevention
   - Data validation rules
   - Missing data handling strategies

### 📊 Phase 1.3: Basic Analytics & Monitoring (Week 4)
1. **Basic Insights**
   - Daily/weekly/monthly averages
   - Peak hour identification
   - Trend analysis queries

2. **Monitoring Dashboard**
   - Kibana or Grafana dashboards
   - Scraping success rates
   - Data quality metrics
   - System health monitoring

### 🤖 Phase 2: AI Enhancement (Future - Month 2+)
1. **External Data Integration**
   - Weather API integration
   - Berlin events calendar scraping
   - Seasonal pattern detection

2. **AI Analytics Engine**
   - Historical pattern analysis
   - Correlation detection (weather vs. wait times)
   - Predictive modeling for optimal visit times

3. **User Interface**
   - Web dashboard with recommendations
   - API for third-party integrations
   - Mobile-responsive design

## Project Structure
```
tug-klinikum/
├── src/
│   ├── scraper/
│   │   ├── playwright-scraper.ts
│   │   ├── data-extractor.ts
│   │   ├── retry-handler.ts
│   │   └── browser-manager.ts
│   ├── database/
│   │   ├── interfaces/
│   │   │   ├── database-client.interface.ts
│   │   │   └── query-types.ts
│   │   ├── implementations/
│   │   │   ├── elasticsearch-client.ts
│   │   │   └── postgresql-client.ts
│   │   ├── factory.ts
│   │   └── migrations/
│   ├── observability/
│   │   ├── interfaces/
│   │   │   └── observability-provider.interface.ts
│   │   ├── implementations/
│   │   │   ├── elastic-observability.ts
│   │   │   └── grafana-observability.ts
│   │   ├── otel/
│   │   │   ├── tracer.ts
│   │   │   ├── metrics.ts
│   │   │   └── logger.ts
│   │   └── factory.ts
│   ├── scheduler/
│   │   ├── cron-manager.ts
│   │   └── job-runner.ts
│   ├── models/
│   │   ├── hospital-metric.ts
│   │   └── query-filters.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── scraper.ts
│   │   └── observability.ts
│   └── health/
│       └── health-check.ts
├── config/
│   ├── otel-config.yaml
│   ├── prometheus.yml
│   └── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started Prompt

Once you're ready to begin implementation, use this prompt:

---

**"I'm ready to start implementing the Vivantes hospital scraper project with the revised architecture. Please:**

1. **Set up the initial TypeScript project structure** with:
   - Modern TypeScript 5.x configuration with strict settings
   - Package.json with Playwright, Elasticsearch client, OTEL SDK, node-cron
   - Docker Compose setup with dual observability stacks (Elastic + Grafana)
   - Proper linting and formatting (ESLint + Prettier)

2. **Implement the abstracted database layer** with:
   - DatabaseClient interface for easy database switching
   - ElasticsearchClient implementation for Cloud 9.1
   - Factory pattern for database provider selection
   - Type-safe data models and query interfaces

3. **Create the OTEL observability layer** with:
   - ObservabilityProvider interface supporting dual-stack
   - OTEL collector configuration for routing to both Elastic Cloud and Grafana Cloud
   - Structured logging with correlation IDs
   - Custom metrics for scraping performance
   - Distributed tracing setup
   - Environment-based configuration for all cloud service URLs

4. **Implement the core Playwright scraper** that:
   - Uses Playwright to scrape https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle
   - Supports multiple browsers (Chrome, Firefox, Safari)
   - Handles dynamic content with advanced wait strategies
   - Extracts all available metrics with proper typing
   - Includes comprehensive error handling and exponential backoff retry
   - Integrates with OTEL for full observability

5. **Add scheduling and health monitoring**:
   - 30-minute interval scraping with timezone-aware node-cron
   - Health check endpoints for all components
   - Graceful shutdown handling

Make sure all code follows TypeScript best practices, uses proper abstractions for easy component replacement, and includes comprehensive OTEL instrumentation. The scraper should be respectful with appropriate delays and user agent strings."

---

## Implementation Status

### ✅ **Completed Phases:**
- **Phase 1A**: TypeScript project foundation with tooling ✅
- **Phase 1B**: Database abstraction layer with Elasticsearch client ✅
- **Phase 1C**: OTEL observability dual-stack system ✅
- **Phase 1D**: Core Playwright scraper engine ✅
- **Phase 1E**: Integration layer with scheduling and health checks ✅
- **Phase 1F**: Docker setup and production deployment ✅

### 🎉 **PHASE 1 COMPLETE!**
All core functionality implemented and production-ready!

### 🛡️ **Security Updates Applied:**
- Fixed CVE-2025-54313 in eslint-config-prettier (updated to v9.1.2)
- Fixed eslint-plugin-prettier (updated to v5.2.1)
- Protected against npm supply chain attack

### 🔧 **Code Quality Improvements (September 2025):**
- ✅ **TypeScript Error Resolution**: Fixed all TypeScript compilation errors
  - Resolved unused import issues in observability interfaces
  - Fixed OpenTelemetry API usage and import patterns
  - Corrected exact optional property type issues throughout codebase
  - Added proper DOM type declarations for browser globals
  - Removed unused variables and functions
  - Fixed method signature mismatches in logging system
- ✅ **Strict Type Checking**: Project now passes full TypeScript compilation with strict configuration
- ✅ **Code Cleanup**: Removed dead code and improved type safety

### 🚨 **Critical Bug Resolution (September 2025): OpenTelemetry Instrumentation Conflict**

#### **Issue Discovered:**
The application was failing to connect to Elasticsearch with `ResponseError: 400 Bad Request` despite:
- ✅ Correct API credentials (verified with working project comparison)
- ✅ Valid Elasticsearch Cloud URL
- ✅ Proper client configuration
- ✅ Successful standalone test scripts

#### **Root Cause Analysis:**
**Problem**: OpenTelemetry `getNodeAutoInstrumentations()` was intercepting and modifying ALL HTTP/HTTPS requests, including those made by the Elasticsearch client, causing malformed requests to Elasticsearch Cloud.

**Location**: `src/observability/implementations/base-observability.ts:65`
```typescript
// PROBLEMATIC CODE:
instrumentations: [getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-fs': { enabled: false },
})]
```

#### **Investigation Process:**
1. **Symptom**: Elasticsearch client receiving 400 errors consistently
2. **Hypothesis Testing**: 
   - ✅ Isolated test scripts worked → Configuration was correct
   - ✅ Compared with working project `/Users/achyutjhunjhunwala/Workspace/tug-plugs` → Same credentials worked
   - ✅ Bypassed observability initialization → Database connected successfully
3. **Root Cause**: Auto-instrumentation was modifying HTTP requests to Elasticsearch

#### **Solution Implemented:**
**Strategy**: Initialize database BEFORE OpenTelemetry SDK to avoid instrumentation interference

**Code Changes:**
```typescript
// File: src/index.ts - Modified startup sequence
async start(): Promise<void> {
  // 1. Validate environment and configuration
  await this.validateEnvironment();

  // 2. Initialize database BEFORE observability (CRITICAL FIX)
  await this.initializeDatabaseEarly();

  // 3. Initialize observability after database is connected
  await this.initializeObservability();

  // 4. Verify database connection with observability logging
  await this.initializeDatabase();

  // 5. Continue with other services...
  await this.initializeScraper();
}

// Added early database initialization method:
private async initializeDatabaseEarly(): Promise<void> {
  console.log('🔗 Initializing database (before observability)...');
  
  this.database = DatabaseFactory.createFromEnv();
  await this.database.connect();
  
  const health = await this.database.healthCheck();
  if (!health.connected) {
    throw new Error(`Database connection failed: ${health.lastError}`);
  }
}
```

**Observability Configuration:**
```typescript
// File: src/observability/implementations/base-observability.ts
// Disabled HTTP/HTTPS instrumentation to prevent interference
instrumentations: [getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-fs': { enabled: false },
  '@opentelemetry/instrumentation-http': { enabled: false },  // DISABLED
  '@opentelemetry/instrumentation-https': { enabled: false }, // DISABLED
  // Keep other useful instrumentations enabled
  '@opentelemetry/instrumentation-express': { enabled: true },
  '@opentelemetry/instrumentation-dns': { enabled: true },
})],
```

#### **Results After Fix:**
- ✅ **Elasticsearch Connection**: Working successfully (1469ms response time)
- ✅ **Observability**: Both Elastic APM and Grafana Cloud functioning
- ✅ **Database Operations**: Index creation, health checks, and queries working
- ✅ **Application Flow**: Scraper and scheduler components initializing properly

#### **Key Learnings:**
1. **Auto-instrumentation can interfere with specialized HTTP clients** like Elasticsearch
2. **Order of initialization matters** when using OpenTelemetry in Node.js applications
3. **Standalone testing is crucial** for isolating configuration vs. instrumentation issues
4. **Comparison with working implementations** helps identify environmental vs. code issues

#### **Production Recommendations:**
- **Database initialization should precede observability setup** for applications using specialized HTTP clients
- **Selective instrumentation** is safer than auto-instrumentation for complex applications
- **Health checks should be implemented at multiple layers** to isolate component failures
- **Comprehensive logging** during initialization helps with troubleshooting

This critical fix ensures the application can run in production with full observability while maintaining reliable database connectivity.

## Estimated Timeline

- **Phase 1.1**: 2 weeks (Core functionality) - ✅ 100% Complete
- **Phase 1.2**: 1 week (Reliability & monitoring)  
- **Phase 1.3**: 1 week (Basic analytics)
- **Total Phase 1**: ~4 weeks for production-ready scraper

**Phase 2 can be planned once Phase 1 is stable and collecting data.**

## Budget Considerations

### Revised Cost Analysis:

**Self-hosted + Cloud Services:**
- Proxmox hardware: Already available ✅
- Electricity: ~€5-10/month
- Elasticsearch Cloud: €0/month (existing instance access ✅)
- Grafana Cloud Free Tier: €0/month (14-day metrics, 50GB logs, 50GB traces)
- Cloud backup: €2-5/month (Backblaze/AWS S3)
- **Total**: €7-15/month

**Full AWS Serverless:**
- Lambda: ~€15-25/month (720 invocations)
- CloudWatch: €5-10/month
- OpenSearch/RDS: €30-50/month  
- **Total**: €50-85/month

**Hybrid approach remains cost-effective while providing managed database benefits.**

## Key Architectural Advantages

### ✅ **Why Playwright > Puppeteer:**
- **Multi-browser**: Test across Chrome, Firefox, Safari
- **Better reliability**: More stable element waiting
- **Built-in network interception**: Better debugging
- **Auto-waiting**: Smarter element interaction
- **Parallel execution**: Faster scraping potential

### ✅ **Abstracted Database Layer Benefits:**
```typescript
// Easy database switching
const db = DatabaseFactory.create(process.env.DB_TYPE);
await db.connect();
await db.insert(hospitalData);

// Future migration example:
// Change DB_TYPE=elasticsearch to DB_TYPE=postgresql
// Zero code changes needed
```

### ✅ **OTEL Dual-Stack Observability:**
```typescript
// Single instrumentation, dual destinations
const obs = ObservabilityFactory.create(['elastic', 'grafana-cloud']);
obs.logger.info('Scraping started', { correlationId });
obs.metrics.counter('scrapes.total').inc();
obs.tracer.startSpan('scrape.execution');

// Routes automatically to:
// - Elasticsearch Cloud + Kibana
// - Grafana Cloud (Free Tier) - Loki + Prometheus + Tempo
```

### ✅ **Grafana Cloud Free Tier Benefits:**
- **50GB logs/month**: More than enough for hospital scraping
- **14-day metrics retention**: Perfect for trend analysis
- **50GB traces/month**: Full distributed tracing coverage
- **No setup required**: Managed Loki, Prometheus, Tempo
- **Learn production Grafana**: Same as enterprise setups

## 🔧 **Connection Configuration**

### Elasticsearch Cloud Setup:
1. **Create Elasticsearch Cloud account** at https://cloud.elastic.co
2. **Create deployment** (choose Free tier)
3. **Get connection details:**
   ```bash
   ELASTICSEARCH_CLOUD_URL=https://your-deployment.es.europe-west1.gcp.cloud.es.io:9243
   ELASTICSEARCH_API_KEY=your_base64_encoded_api_key
   ```

### Grafana Cloud Setup:
1. **Create Grafana Cloud account** at https://grafana.com/auth/sign-up/create-user
2. **Get Stack details** from your stack page:
   ```bash
   GRAFANA_CLOUD_USER_ID=123456  # Your User ID
   GRAFANA_CLOUD_API_KEY=your_api_key  # Service Account key
   ```
3. **Get service URLs** from "Send Data" section:
   ```bash
   # Prometheus (Metrics)
   GRAFANA_CLOUD_PROMETHEUS_URL=https://prometheus-prod-01-eu-west-0.grafana.net/api/prom/push
   
   # Loki (Logs)  
   GRAFANA_CLOUD_LOKI_URL=https://logs-prod-eu-west-0.grafana.net/loki/api/v1/push
   
   # Tempo (Traces)
   GRAFANA_CLOUD_TEMPO_URL=https://tempo-eu-west-0.grafana.net:443
   ```

### OTEL Collector Configuration:
```yaml
# config/otel-config.yaml
exporters:
  # Elasticsearch APM
  otlp/elastic:
    endpoint: ${ELASTICSEARCH_CLOUD_URL}
    headers:
      authorization: "ApiKey ${ELASTICSEARCH_API_KEY}"
  
  # Grafana Cloud Prometheus
  prometheusremotewrite:
    endpoint: ${GRAFANA_CLOUD_PROMETHEUS_URL}
    headers:
      authorization: "Basic ${GRAFANA_CLOUD_USER_ID}:${GRAFANA_CLOUD_API_KEY}"
  
  # Grafana Cloud Loki
  loki:
    endpoint: ${GRAFANA_CLOUD_LOKI_URL}
    headers:
      authorization: "Basic ${GRAFANA_CLOUD_USER_ID}:${GRAFANA_CLOUD_API_KEY}"
  
  # Grafana Cloud Tempo
  otlp/tempo:
    endpoint: ${GRAFANA_CLOUD_TEMPO_URL}
    headers:
      authorization: "Basic ${GRAFANA_CLOUD_USER_ID}:${GRAFANA_CLOUD_API_KEY}"

service:
  pipelines:
    metrics:
      exporters: [otlp/elastic, prometheusremotewrite]
    logs:
      exporters: [otlp/elastic, loki]
    traces:
      exporters: [otlp/elastic, otlp/tempo]
```

---

This plan provides a solid foundation for your hospital data analytics project with clear phases, technical decisions, and implementation guidance. The architecture is designed to be maintainable, scalable, and legally compliant while keeping costs minimal.