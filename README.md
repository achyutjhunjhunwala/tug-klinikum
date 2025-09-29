# 🏥 Hospital Emergency Room Scraper

[![Build and Push Docker Images](https://github.com/achyutjhunjhunwala/tug-klinikum/actions/workflows/docker-build.yml/badge.svg?branch=main)](https://github.com/achyutjhunjhunwala/tug-klinikum/actions/workflows/docker-build.yml)

Real-time monitoring of emergency room wait times for Vivantes Friedrichshain Hospital (Adult & Children departments).

## Features

### 🤖 **Data Collection (Scraper)**
- **Dual Department Monitoring**: Scrapes both Adult and Children emergency rooms sequentially
- **Department Classification**: Data tagged with department (`adult` or `children`)
- **Automated Scheduling**: Runs every 30 minutes via cron
- **Elasticsearch Storage**: Time-series data with full observability
- **Robust Error Handling**: Automatic retries and comprehensive logging

### 🌐 **Web Dashboard (Complete Full-Stack)**
- **Real-time Monitoring**: Live hospital wait time dashboard with auto-refresh
- **Interactive Visualizations**: Chart.js-powered historical data analysis
- **Responsive Design**: Mobile-first, touch-optimized interface for all devices
- **Theme Support**: Light/Dark mode with automatic system preference detection
- **Department Switching**: Toggle between Adult and Children emergency departments
- **Time Range Filtering**: View data across multiple periods (6h, 24h, 7d, 15d, 1m, 3m)
- **Production API**: Rate-limited, CORS-protected backend with security headers
- **TypeScript Throughout**: Full type safety across frontend and backend
- **Modern Tech Stack**: React 18, Vite, Tailwind CSS, Express.js, Chart.js

## Quick Start

```bash
# 1. Setup environment
cp env.example .env
# Edit .env with your Elasticsearch credentials

# 2. Install dependencies
npm install

# 3. Build and start
npm run build
npm start
```

## 🌐 Complete Web Dashboard

### 🎉 **Full-Stack Hospital Dashboard (Complete)**

**Frontend React App**: `http://localhost:3001`
- ✅ **Real-time Dashboard**: Live hospital wait time metrics with auto-refresh
- ✅ **Interactive Charts**: Historical data visualization with Chart.js
- ✅ **Dark/Light Theme**: System preference detection with manual toggle
- ✅ **Mobile Optimized**: Touch-friendly responsive design for all devices
- ✅ **Department Filtering**: Switch between Adult and Children emergency departments
- ✅ **Time Range Selection**: View data across multiple time periods (6h to 3m)

**Backend API**: `http://localhost:4000`
- ✅ **Production Ready**: Rate limiting, CORS protection, security headers
- ✅ **Hospital Metrics API**: `/api/hospital/metrics` with comprehensive data
- ✅ **Health Monitoring**: `/health` endpoint for system status
- ✅ **Real-time Data**: Direct integration with Elasticsearch

### 🚀 Quick Start (Complete UI)

```bash
# 1. Start backend API server
cd ui/backend
npm install
npm run dev
# Backend runs on http://localhost:4000

# 2. Start frontend React app (new terminal)
cd ui/frontend
npm install
npm run dev
# Frontend runs on http://localhost:3001

# 3. Access the dashboard
open http://localhost:3001
```

### API Usage Examples
```bash
# Get current wait times for Adult department (6 hour range)
curl "http://localhost:4000/api/hospital/metrics?department=adult&timeRange=6h"

# Get Children department data for last 24 hours
curl "http://localhost:4000/api/hospital/metrics?department=children&timeRange=24h"

# Health check
curl "http://localhost:4000/health"
```

### Root Project Development
```bash
# Start both scraper and API server concurrently
npm run dev:all

# Start just the API server for UI development
npm run dev:backend

# Scraper health check on port 3000, API on port 4000
```

## Configuration

Required environment variables in `.env`:

```bash
# Elasticsearch Cloud
ELASTICSEARCH_CLOUD_URL=https://your-deployment.es.region.cloud.es.io:9200
ELASTICSEARCH_API_KEY=your_api_key

# Optional - URLs to scrape
ADULT_TARGET_URL=https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle
CHILDREN_TARGET_URL=https://www.vivantes.de/klinikum-im-friedrichshain/kinder-jugendmedizin/kinderrettungsstelle
```

## 🚀 Deployment

I have provided easy deployment options using popular container orchestration tools:

### Container Management Platforms

- **[Dockge](./dockge/README.md)** - Recommended for Proxmox environments
  - UI-only deployment workflow
  - Visual monitoring and log management
  - One-click updates and container management
  - Perfect for self-hosted setups

- **[Portainer](./portainer/README.md)** - Universal Docker management
  - Web-based Docker management
  - Stack deployment with environment variables
  - Real-time monitoring and log streaming
  - Works on any Docker host

Both options include:
- ✅ Complete docker-compose configurations
- ✅ Environment variable templates
- ✅ Health checks and monitoring setup
- ✅ Persistent data volumes
- ✅ OpenTelemetry observability stack

Choose the deployment method that best fits your infrastructure setup.

## 🛠️ Development Scripts

- **`scripts/cleanup-elasticsearch.js`** - Cleans up Elasticsearch index, template, and ILM policy for fresh testing

## Data Schema

Each scraping run produces records with:

| Field | Type | Description |
|-------|------|-------------|
| `department` | `string` | `"adult"` or `"children"` |
| `waitTimeMinutes` | `number` | Current wait time |
| `totalPatients` | `number` | Patients in treatment/waiting |
| `ambulancePatients` | `number` | Patients arrived by ambulance |
| `emergencyCases` | `number` | Life-threatening cases |
| `updateDelayMinutes` | `number` | Data freshness (minutes since last update) |
| `timestamp` | `Date` | When data was scraped |
| `sourceUrl` | `string` | Source hospital URL |

## Architecture

```
Job Runner → Playwright Scraper → Data Extractor → Elasticsearch
     ↓              ↓                    ↓              ↓
Sequential     Browser automation   DOM parsing    Time-series
dual URL       with Chromium       & validation     storage
processing
```

**Core Components:**
- **Job Runner**: Orchestrates sequential scraping of both URLs
- **Playwright Scraper**: Browser-based data extraction
- **Data Extractor**: DOM parsing and data validation
- **Database Client**: Elasticsearch storage with observability
- **Retry Handler**: Error recovery and resilience

## Development

```bash
# Build
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Start development
npm run dev
```

## Monitoring

- **Health Check**: `http://localhost:3000/health`
- **Logs**: Structured JSON logs with correlation IDs
- **Metrics**: OpenTelemetry metrics exported to Elasticsearch APM
- **Traces**: Distributed tracing for debugging

## Project Structure

```
├── src/             # Main scraper application
│   ├── config/      # Configuration management
│   ├── database/    # Elasticsearch client
│   ├── scraper/     # Playwright scraping engine
│   ├── scheduler/   # Cron job runner
│   ├── observability/ # Logging & metrics
│   └── models/      # Data models & validation
├── ui/              # Complete Web Dashboard (✅ Full-Stack)
│   ├── shared/      # Shared TypeScript types
│   │   └── types/   # Common interfaces (backend/frontend)
│   ├── backend/     # Express.js API server (✅ Complete)
│   │   ├── src/     # TypeScript API implementation
│   │   │   ├── controllers/  # Route handlers
│   │   │   ├── services/     # Business logic & Elasticsearch
│   │   │   ├── middlewares/  # Express middlewares & security
│   │   │   ├── observability/ # Pino logging & monitoring
│   │   │   └── routes/       # API routes
│   │   └── package.json
│   └── frontend/    # React Dashboard (✅ Complete)
│       ├── src/     # React + TypeScript application
│       │   ├── components/   # React components
│       │   │   ├── charts/   # Chart.js visualizations
│       │   │   ├── common/   # Shared UI components
│       │   │   └── metrics/  # Metric display components
│       │   ├── contexts/     # React contexts (theme, etc.)
│       │   ├── hooks/        # Custom React hooks (data fetching)
│       │   ├── services/     # API integration (Axios)
│       │   └── utils/        # Utility functions
│       ├── index.html        # PWA-ready HTML template
│       ├── tailwind.config.js # Tailwind CSS configuration
│       ├── vite.config.ts    # Vite build configuration
│       └── package.json
├── docs/            # Architecture & observability docs
├── portainer/       # Portainer deployment configs
└── dockge/          # Dockge deployment configs
```

## Documentation

- **[📖 Architecture.md](./docs/Architecture.md)**: Complete system architecture and technical details
- **[📊 Observability.md](./docs/Observability.md)**: Monitoring, logging, and metrics guide
- **[🌐 Complete UI Documentation](./ui/README.md)**: Full-stack web dashboard (backend + frontend)
- **[🧪 UI Testing Plan](./ui/TESTING_PLAN.md)**: Comprehensive testing strategy for the web dashboard

## License

This project is licensed under a **Custom Attribution-NonCommercial License**.

### ✅ **Allowed (Non-Commercial Use):**
- Personal projects and learning
- Academic research and education
- Open source projects
- Non-profit organizations
- Community contributions

### ❌ **Requires Permission (Commercial Use):**
- Commercial products or services
- Revenue-generating applications
- Proprietary commercial solutions
- Selling or licensing the software

### 📋 **Requirements:**
- **Attribution**: Must credit Achyut Jhunjhunwala (TheUiGuy) and link to original repository
- **Commercial Permission**: Contact author for commercial use rights

**For commercial licensing, please reach out through GitHub issues or repository discussions.**

See the full [LICENSE](./LICENSE) file for complete terms and conditions.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

**Real-time emergency room data to help patients make informed decisions.**

> *Built with ❤️ in Berlin for better healthcare accessibility by TheUiGuy*