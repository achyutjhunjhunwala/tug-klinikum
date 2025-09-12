# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
You must make sure you are always running in this folder and not outside the folder path - /Users/achyutjhunjhunwala/Workspace/tug-klinikum

## Node Version Management

**IMPORTANT**: This project uses Node.js version 24.6.0 as specified in `.nvmrc`. Always use the correct Node version:

```bash
nvm use
```

Run this command before any development work to ensure you're using the correct Node.js version. All commands below assume you're using the correct Node version.

## Development Commands

### Core Development
- `npm run dev` - Development server with hot reload using tsx
- `npm run build` - Compile TypeScript to dist/ directory
- `npm start` - Run the compiled application
- `npm run type-check` - Run TypeScript type checking without emitting

### Code Quality
- `npm run lint` - ESLint checking on src/**/*.ts
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier

### Testing
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npx jest --coverage` - Generate test coverage report

### Maintenance
- `npm run clean` - Remove dist/ directory
- `npx playwright install` - Install Playwright browsers (required for scraping)

## Architecture Overview

### Database Layer (Pluggable)
The system uses a factory pattern for database abstraction supporting multiple backends:

- **Factory**: `src/database/factory.ts` - Creates database clients based on configuration
- **Interface**: `src/database/interfaces/database-client.interface.ts` - Common interface for all database clients  
- **Implementations**: 
  - `src/database/implementations/elasticsearch-client.ts` - Elasticsearch Cloud integration
  - `src/database/implementations/postgresql-client.ts` - PostgreSQL with TimescaleDB support
- **Configuration**: Switch databases via `DB_TYPE` environment variable

### Project Structure
```
src/
├── database/           # Pluggable database abstraction layer
│   ├── factory.ts      # Database client factory
│   ├── interfaces/     # Common interfaces
│   └── implementations/ # Database-specific implementations
├── observability/      # OpenTelemetry (OTEL) integration
├── scraper/           # Playwright-based web scraping engine
├── scheduler/         # Cron job management for periodic scraping
├── models/            # TypeScript data models and types
├── config/            # Configuration management
└── health/            # Health check endpoints
```

### TypeScript Configuration
- **Target**: ES2022 with NodeNext modules
- **Path Mapping**: Uses `@/*` aliases for clean imports (configured in tsconfig.json)
- **Strict Mode**: Full TypeScript strict checking enabled
- **Output**: Compiled to `dist/` directory

### Testing Setup
- **Framework**: Jest with ts-jest preset
- **Path Mapping**: Jest configured to resolve TypeScript path aliases
- **Coverage**: Collects from all src files except tests and type definitions
- **Location**: Tests should be in `__tests__` folders or use `.test.ts` / `.spec.ts` suffixes

### Environment Configuration
Required environment variables (see `.env.example`):
- `DB_TYPE`: Database type ('elasticsearch' or 'postgresql')
- `ELASTICSEARCH_CLOUD_URL`, `ELASTICSEARCH_API_KEY`: For Elasticsearch
- `GRAFANA_CLOUD_*`: Grafana Cloud observability endpoints
- `SCRAPING_INTERVAL`: Scraping frequency in minutes
- `TARGET_URL`: Hospital website URL to scrape

### Observability Stack
Dual observability setup:
- **Elastic**: Elasticsearch + APM + Kibana
- **Grafana**: Prometheus + Loki + Tempo + Grafana Cloud
- **OTEL**: OpenTelemetry for distributed tracing and metrics

### Key Patterns
- Factory pattern for database abstraction enabling easy switching between providers
- Interface segregation for clean architecture boundaries
- Environment-driven configuration for deployment flexibility
- Comprehensive typing with strict TypeScript configuration
- Path aliases for clean, maintainable imports