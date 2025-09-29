# =================================================================
# Multi-stage Dockerfile for Hospital UI
# Builds both frontend (React) and backend (Express)
# In production, backend serves both API and static frontend files
# =================================================================

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies (including dev deps for build)
RUN npm ci

# Copy frontend source
COPY frontend/ ./
COPY shared/ ../shared/

# Build frontend for production
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies (including dev deps for build)
RUN npm ci

# Copy backend source
COPY backend/ ./
COPY shared/ ../shared/

# Build backend TypeScript
RUN npm run build

# Stage 3: Production Image
FROM node:20-alpine

# Install wget for healthchecks
RUN apk add --no-cache wget

WORKDIR /app

# Copy backend built files
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/

# Install only production dependencies
WORKDIR /app/backend
RUN npm ci --only=production

# Copy frontend built files (backend will serve these)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose port 4000 for the API server
EXPOSE 4000

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start the backend server (which serves both API and frontend)
CMD ["node", "dist/server.js"]
