# 🏥 TUG-Klinikum UI Implementation Plan

## Overview

This document outlines the complete implementation plan for adding a web UI to the TUG-Klinikum hospital wait time scraper. The UI will democratize access to hospital wait time data through a modern, mobile-friendly React frontend backed by a Node.js API server.

## 🎯 Project Goals

- **Democratize Data**: Make hospital wait times publicly accessible without requiring Kibana access
- **Mobile-First**: Sleek, lightweight, mobile-friendly interface
- **Real-time Insights**: Display current wait times and historical trends
- **Department Separation**: Clear distinction between Adult and Children emergency departments
- **Time-based Analytics**: Historical data visualization with flexible time range filtering

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │───▶│   Node.js API   │───▶│  Elasticsearch  │
│   (Port 3001)   │    │   (Port 4000)   │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
│                      │                      │
│ - React 18          │ - Express.js        │ - Existing ES
│ - TypeScript        │ - TypeScript        │ - Hospital metrics
│ - Tailwind CSS     │ - Rate Limiting     │ - Time-series data
│ - Chart.js         │ - Security Headers  │ - Department tags
│ - Responsive       │ - CORS Protected    │ - Rich metadata
│                      │ - Pino Logging      │ - Structured data
│                      │ - Observability     │ - Performance logs
└─────────────────    └─────────────────    └─────────────────

Rate Limiting: 20 requests/minute per IP (rolling window)
Existing Scraper: Port 3000 (Health endpoint)
```

## 📁 Project Structure

```
ui/
├── frontend/                    # React application
│   ├── public/
│   │   ├── index.html
│   │   └── favicon.ico
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── common/          # Shared components
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Loading.tsx
│   │   │   │   └── ErrorBoundary.tsx
│   │   │   ├── metrics/         # Metrics display
│   │   │   │   ├── MetricCard.tsx
│   │   │   │   ├── MetricsList.tsx
│   │   │   │   └── LastUpdated.tsx
│   │   │   └── charts/          # Chart components
│   │   │       ├── LineChart.tsx
│   │   │       └── ChartContainer.tsx
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useHospitalData.ts
│   │   │   └── useTimeRange.ts
│   │   ├── services/            # API services
│   │   │   └── api.ts
│   │   ├── types/               # TypeScript types
│   │   │   └── hospital.ts
│   │   ├── utils/               # Utility functions
│   │   │   ├── timeRange.ts
│   │   │   └── formatters.ts
│   │   ├── App.tsx              # Main app component
│   │   ├── index.tsx            # React entry point
│   │   └── index.css            # Global styles
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── vite.config.ts           # Vite configuration
├── backend/                     # Node.js API server
│   ├── src/
│   │   ├── controllers/         # Route controllers
│   │   │   └── hospitalController.ts
│   │   ├── services/            # Business logic
│   │   │   └── hospitalService.ts
│   │   ├── middlewares/         # Express middlewares
│   │   │   ├── cors.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── rateLimiter.ts
│   │   │   ├── security.ts
│   │   │   └── validation.ts
│   │   ├── observability/       # Logging and monitoring
│   │   │   ├── logger.ts
│   │   │   ├── telemetry.ts
│   │   │   └── index.ts
│   │   ├── routes/              # API routes
│   │   │   ├── index.ts
│   │   │   └── hospital.ts
│   │   ├── types/               # Shared types
│   │   │   └── api.ts
│   │   ├── utils/               # Utilities
│   │   │   ├── timeRange.ts
│   │   │   └── validation.ts
│   │   ├── app.ts               # Express app setup
│   │   └── server.ts            # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── shared/                      # Shared types and utilities
│   └── types/
│       └── hospital.ts
├── package.json                 # Root package.json
└── README.md                    # UI documentation
```

## 🔌 API Design

### Base URL: `http://localhost:4000/api`

### 🛡️ API Security & Rate Limiting

#### Rate Limiting Strategy
- **Limit**: 20 requests per minute per IP address
- **Algorithm**: Rolling window (sliding window counter)
- **Implementation**: `express-rate-limit` with Redis/Memory store
- **Response Headers**:
  - `X-RateLimit-Limit`: 20
  - `X-RateLimit-Remaining`: remaining requests
  - `X-RateLimit-Reset`: window reset time
- **429 Response**: JSON error with retry-after header

#### Rolling Window Implementation
```typescript
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute rolling window
  max: 20, // 20 requests per window per IP
  message: {
    error: 'Too many requests',
    retryAfter: 60,
    limit: 20
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});
```

#### Additional Security Measures
- **CORS**: Restricted to specific origins
- **Helmet**: Security headers (CSP, HSTS, etc.)
- **Input Validation**: Strict parameter validation
- **Request Size Limits**: Max 1MB payload
- **Timeout**: 30-second request timeout

### Endpoints

#### 1. **GET** `/hospital/metrics`
Get hospital metrics with filtering options.

**Query Parameters:**
- `department`: `adult` | `children` (required)
- `timeRange`: `6h` | `24h` | `7d` | `15d` | `1m` | `3m` (required)
- `from`: ISO timestamp (optional, overrides timeRange)
- `to`: ISO timestamp (optional, overrides timeRange)

**Response:**
```typescript
{
  success: boolean;
  data: {
    current: {
      waitTimeMinutes: number;
      totalPatients?: number;
      ambulancePatients?: number;
      emergencyCases?: number;
      lastUpdated: string; // ISO timestamp
      updateDelayMinutes?: number;
    };
    historical: Array<{
      timestamp: string;
      waitTimeMinutes: number;
      totalPatients?: number;
      ambulancePatients?: number;
      emergencyCases?: number;
    }>;
    metadata: {
      department: 'adult' | 'children';
      timeRange: string;
      totalRecords: number;
      dataQuality: number; // 0-1 score
    };
  };
  error?: string;
}
```

#### 2. **GET** `/hospital/health`
Get API health status.

**Response:**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  database: {
    connected: boolean;
    responseTime: number;
  };
  lastDataUpdate: string;
}
```

## 🎨 UI Components Design

### 1. **Header Component**
- Department selector dropdown (Adult/Children)
- Time range selector (6h, 24h, 7d, 15d, 1m, 3m)
- Hospital branding/logo
- Mobile-optimized hamburger menu

### 2. **Metrics Dashboard**
Four main metric cards displaying:
- **Current ER Wait Time** (primary metric, large display)
- **Total Patients Now** (secondary metric)
- **Ambulance Arrivals Now** (secondary metric)
- **Emergency Cases Now** (secondary metric)
- **Last Updated** (timestamp with freshness indicator)

### 3. **Charts Section**
Four responsive line charts:
- Wait Time Trends
- Patient Count Trends
- Ambulance Arrivals Trends
- Emergency Cases Trends

### 4. **Loading & Error States**
- Skeleton loaders for metrics and charts
- Error boundaries with retry functionality
- Connection status indicators

## 🎨 Design System

### Color Palette
```css
/* Primary Colors */
--primary-blue: #2563eb;      /* Hospital/medical blue */
--primary-red: #dc2626;       /* Emergency/urgent red */
--primary-green: #16a34a;     /* Healthy/good status */

/* Neutral Colors */
--gray-50: #f9fafb;
--gray-100: #f3f4f6;
--gray-200: #e5e7eb;
--gray-500: #6b7280;
--gray-700: #374151;
--gray-900: #111827;

/* Status Colors */
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
```

### Typography
- **Font Family**: Inter (clean, medical-appropriate)
- **Scale**: Tailwind's default scale
- **Hierarchy**: Clear distinction between metrics, labels, and body text

### Spacing & Layout
- **Mobile-First**: Starting with 320px viewport
- **Breakpoints**: sm:640px, md:768px, lg:1024px, xl:1280px
- **Grid System**: CSS Grid for main layout, Flexbox for components
- **Spacing**: Tailwind's 4px base unit

## 📱 Mobile Optimization

### Responsive Breakpoints
- **Mobile** (320px-639px): Single column, stacked metrics
- **Tablet** (640px-1023px): Two-column grid for metrics
- **Desktop** (1024px+): Four-column grid with sidebar charts

### Touch Interactions
- **Minimum Touch Target**: 44px (iOS/Android standard)
- **Swipe Gestures**: Horizontal swipe between time ranges
- **Pull-to-Refresh**: Native mobile pattern support

### Performance
- **Bundle Size**: Target <100KB gzipped
- **Time to Interactive**: <3 seconds on 3G
- **Lighthouse Score**: 90+ on all metrics

## 🔧 Technology Stack

### Frontend
- **React 18**: Latest stable with concurrent features
- **TypeScript 5**: Full type safety
- **Vite**: Fast development and optimized builds
- **Tailwind CSS**: Utility-first styling
- **Chart.js**: Lightweight charting library
- **Axios**: HTTP client with interceptors
- **Date-fns**: Lightweight date manipulation

### Backend
- **Node.js 20+**: Latest LTS version
- **Express.js**: Minimal web framework
- **TypeScript**: Shared with frontend
- **Existing Database Client**: Reuse Elasticsearch client

#### Security & Rate Limiting
- **express-rate-limit**: Rolling window rate limiting (20 req/min)
- **CORS**: Cross-origin resource sharing with origin restrictions
- **Helmet**: Comprehensive security headers (CSP, HSTS, etc.)
- **express-validator**: Request validation and sanitization
- **Morgan**: HTTP request logging with IP tracking

#### Optional Enhancements
- **Redis**: For distributed rate limiting (production)
- **express-slow-down**: Progressive delay for high-traffic IPs
- **express-brute**: Brute force attack protection

## 📊 Observability & Monitoring

### Structured Logging with Pino
- **Service Identification**: All logs include service name and version
- **Request Tracking**: API requests logged with duration, status codes, and client IPs
- **Error Logging**: Comprehensive error tracking with stack traces and context
- **Rate Limiting**: Violations logged with client details and limit information
- **Validation Errors**: Parameter validation failures with detailed error messages
- **Database Operations**: Query performance and connection health monitoring

### Log Formats
```json
{
  "level": "info",
  "time": "2025-09-28T17:29:13.096Z",
  "service": "tug-klinikum-api",
  "version": "1.0.0",
  "pid": 31299,
  "msg": "API Server started successfully",
  "port": "4000",
  "endpoints": {
    "health": "http://localhost:4000/health",
    "api": "http://localhost:4000/api"
  }
}
```

### Key Monitoring Metrics
- **API Performance**: Response times, throughput, error rates
- **Rate Limiting**: Client request patterns and violations
- **Database Health**: Connection status, query performance
- **Resource Usage**: Memory, CPU utilization
- **Error Tracking**: Application errors, validation failures

## 🚀 Development Scripts

### Root Package.json Scripts
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:frontend": "cd ui/frontend && npm run dev -- --port 3001",
    "dev:backend": "cd ui/backend && npm run dev",
    "dev:scraper": "npm run dev",

    "build": "npm run build:backend && npm run build:frontend",
    "build:frontend": "cd ui/frontend && npm run build",
    "build:backend": "cd ui/backend && npm run build",

    "start:ui": "concurrently \"npm run start:backend\" \"npm run start:frontend\"",
    "start:frontend": "cd ui/frontend && npm run preview -- --port 3001",
    "start:backend": "cd ui/backend && npm start",

    "start:production": "concurrently \"npm start\" \"npm run start:ui\"",

    "install:ui": "cd ui/frontend && npm install && cd ../backend && npm install",

    "ports:check": "lsof -i :3000,:3001,:4000 || echo 'Ports available'",
    "ports:kill": "pkill -f 'node.*3000|node.*3001|node.*4000' || echo 'No processes killed'"
  }
}
```

### Port Configuration
- **Scraper Health Endpoint**: `http://localhost:3000/health` (existing)
- **React UI**: `http://localhost:3001` (new, avoiding collision)
- **API Server**: `http://localhost:4000/api` (new)
- **Production**: All services can run concurrently without conflicts

## 📦 Installation & Setup

### 1. **Bootstrap UI Components**
```bash
# Create UI directory structure
mkdir -p ui/{frontend,backend,shared}

# Initialize frontend (React + Vite)
cd ui/frontend
npm create vite@latest . -- --template react-ts
npm install tailwindcss chart.js axios date-fns

# Initialize backend (Express + TypeScript)
cd ../backend
npm init -y
npm install express cors helmet morgan express-rate-limit express-validator
npm install -D @types/express @types/cors typescript tsx

# Install shared dependencies
cd ../..
npm install concurrently
```

### 2. **Environment Configuration**
```bash
# ui/backend/.env
PORT=4000
NODE_ENV=development
ELASTICSEARCH_CLOUD_URL=<from_root_env>
ELASTICSEARCH_API_KEY=<from_root_env>

# Rate limiting configuration
RATE_LIMIT_WINDOW_MS=60000        # 1 minute window
RATE_LIMIT_MAX_REQUESTS=20        # 20 requests per window
RATE_LIMIT_SKIP_SUCCESSFUL=false  # Count all requests

# Security configuration
CORS_ORIGINS=http://localhost:3001,http://localhost:3000
API_TIMEOUT_MS=30000
MAX_REQUEST_SIZE=1mb

# ui/frontend/.env
VITE_API_URL=http://localhost:4000/api
VITE_APP_TITLE=Hospital Wait Times
VITE_REFRESH_INTERVAL=30000       # 30 seconds data refresh
```

## 🔄 Integration Strategy

### Phase 1: Backend API (Week 1)
1. Set up Express server with TypeScript
2. Integrate existing Elasticsearch client
3. Implement hospital metrics endpoints
4. Add CORS and security middleware
5. Create API documentation and testing

### Phase 2: Frontend Base (Week 2)
1. Set up React + Vite + TypeScript
2. Configure Tailwind CSS and design system
3. Create component library (Header, MetricCard, etc.)
4. Implement API service layer
5. Build responsive layout structure

### Phase 3: Data Integration (Week 3)
1. Connect frontend to backend API
2. Implement real-time data fetching
3. Add loading states and error handling
4. Create time range filtering
5. Implement department switching

### Phase 4: Charts & Polish (Week 4)
1. Integrate Chart.js for historical data
2. Add smooth animations and transitions
3. Optimize for mobile devices
4. Performance testing and optimization
5. Documentation and deployment scripts

## 🧪 Testing Strategy

### Backend Testing
- **Unit Tests**: Jest for service layer
- **Integration Tests**: API endpoint testing
- **Database Tests**: Mock Elasticsearch responses

### Frontend Testing
- **Component Tests**: React Testing Library
- **E2E Tests**: Playwright (reuse existing setup)
- **Visual Regression**: Chromatic or similar

### Performance Testing
- **Lighthouse CI**: Automated performance monitoring
- **Bundle Analysis**: Webpack Bundle Analyzer
- **API Load Testing**: Artillery or similar

## 🚢 Deployment Strategy

### Development
- **Frontend**: `http://localhost:3001` (React UI)
- **Backend**: `http://localhost:4000` (API Server with rate limiting)
- **Scraper**: `http://localhost:3000` (existing health endpoint)

### Production
- **Single Container**: Extend existing Docker setup
- **Static Frontend**: Serve React build from Express
- **Environment Variables**: Reuse existing configuration
- **Health Checks**: Extend existing health endpoints

### Docker Integration
```dockerfile
# Add to existing Dockerfile
COPY ui/frontend/dist /app/ui/frontend/dist
COPY ui/backend/dist /app/ui/backend/dist

# Update start script to include UI server
```

## 📊 Success Metrics

### Technical Metrics
- **Page Load Time**: <2 seconds
- **Bundle Size**: <100KB gzipped
- **Lighthouse Score**: 90+ across all categories
- **API Response Time**: <500ms for all endpoints

### User Experience Metrics
- **Mobile Usability**: Touch-friendly interface
- **Accessibility**: WCAG 2.1 AA compliance
- **Cross-browser Support**: Chrome, Firefox, Safari, Edge
- **Offline Graceful Degradation**: Service worker caching

### Business Metrics
- **Data Freshness**: Real-time updates within 30 minutes
- **Uptime**: 99.9% availability
- **Error Rate**: <1% API error rate
- **User Engagement**: Time spent on page, return visits

## 🔒 Security Considerations

### API Security
- **CORS Configuration**: Specific origin allowlist (`localhost:3001`, `localhost:3000`)
- **Rate Limiting**: 20 requests/minute per IP with rolling window
- **Input Validation**: Strict parameter validation with express-validator
- **Security Headers**: Helmet.js with CSP, HSTS, X-Frame-Options

### Rate Limiting Deep Dive

#### Implementation Details
```typescript
// Rolling window rate limiter configuration
import rateLimit from 'express-rate-limit';

const createRateLimiter = () => rateLimit({
  windowMs: 60 * 1000, // 1 minute rolling window
  max: 20, // Limit to 20 requests per window per IP
  message: {
    error: 'Too many requests from this IP',
    retryAfter: 60,
    limit: 20,
    remaining: 0
  },
  standardHeaders: true, // Return rate limit info in the headers
  legacyHeaders: false, // Disable X-RateLimit-* headers

  // Custom key generator (can be enhanced for user-based limiting)
  keyGenerator: (req) => req.ip,

  // Skip function for health checks
  skip: (req) => req.path === '/health',

  // Custom handler for when limit is exceeded
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
      retryAfter: 60,
      limit: 20
    });
  }
});
```

#### Response Headers
When rate limiting is active, the API returns these headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Time when the window resets
- `Retry-After`: Seconds to wait before next request (when limited)

#### Monitoring & Alerting
- Track rate limit violations per IP
- Alert on suspicious patterns (multiple IPs hitting limits)
- Log rate limit events for security analysis
- Monitor API response times under load

### Data Privacy
- **No Personal Data**: Only aggregate hospital metrics
- **Public Data**: All displayed data is public information
- **Secure Transmission**: HTTPS in production
- **Error Logging**: No sensitive data in logs

## 🎯 Future Enhancements

### Phase 2 Features
- **PWA Support**: Offline capability and push notifications
- **Multiple Hospitals**: Expand beyond Vivantes Friedrichshain
- **Predictive Analytics**: ML-based wait time predictions
- **Real-time Alerts**: Notifications for significant changes

### Phase 3 Features
- **Comparative Analytics**: Compare departments/hospitals
- **Historical Reports**: Monthly/yearly trend analysis
- **API Public Access**: Rate-limited public API
- **Embedding Support**: Widget for third-party sites

## 📝 Implementation Checklist

### Backend Setup
- [x] Initialize Express TypeScript project
- [x] Integrate existing Elasticsearch client
- [x] Create hospital metrics service
- [x] Implement API endpoints with validation
- [x] Add CORS and security middleware
- [x] Implement rate limiting (20 req/min per IP)
- [x] Add structured logging with Pino
- [x] Integrate observability and monitoring
- [ ] Write API tests
- [ ] Create API documentation

### Frontend Setup
- [ ] Initialize React + Vite project
- [ ] Configure Tailwind CSS
- [ ] Set up TypeScript and ESLint
- [ ] Create component library
- [ ] Implement responsive layout
- [ ] Add Chart.js integration
- [ ] Write component tests

### Integration
- [ ] Connect frontend to backend API
- [ ] Implement error handling and loading states
- [ ] Add real-time data fetching
- [ ] Create time range filtering
- [ ] Add department switching
- [ ] Optimize for mobile devices
- [ ] Performance testing and optimization

### Deployment
- [ ] Update Docker configuration
- [ ] Create production build scripts
- [ ] Set up CI/CD pipeline
- [ ] Configure environment variables
- [ ] Add health check endpoints
- [ ] Deploy and monitor

## 🎯 Implementation Status

### ✅ Phase 1: Backend API (COMPLETED)

**🏆 Production-Ready Backend API Server**
- **Express.js API**: Full TypeScript implementation with comprehensive error handling
- **Hospital Metrics Service**: Integration with existing Elasticsearch database
- **Rate Limiting**: 20 requests/minute per IP with rolling window algorithm
- **Security**: Helmet security headers, CORS protection, input validation
- **API Endpoints**: `/api/hospital/metrics` with department and time range filtering
- **Observability**: Structured logging with Pino, request tracking, error monitoring
- **Data Quality**: Validation, sanitization, and quality scoring
- **Build System**: Proper TypeScript configuration with clean build artifact separation

**📊 Key Features Delivered:**
- Real hospital data from Vivantes Friedrichshain (Adult & Children departments)
- Time range support: 6h, 24h, 7d, 15d, 1m, 3m
- Historical data with 12-point time series
- Comprehensive error handling and validation
- Production-grade logging and monitoring
- Development and production deployment readiness

**🔗 API Access:**
- Health Check: `http://localhost:4000/health`
- Metrics API: `http://localhost:4000/api/hospital/metrics`
- Rate limited and CORS protected

### 🚧 Phase 2: React Frontend (PENDING)
Next phase will implement the React UI to consume the completed API.

### 📋 Phase 3: Integration & Testing (PENDING)
Final phase for end-to-end testing and production deployment.

---

**Phase 1 delivers a robust, production-ready API foundation that maintains the high standards of observability and reliability established in the existing scraper system, ready for frontend integration.**