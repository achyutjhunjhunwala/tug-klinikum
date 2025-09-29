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

# Install ALL dependencies (needed for build)
RUN npm ci

# Copy frontend source
COPY frontend/ ./
COPY shared/ ../shared/

# Build frontend for production (outputs to dist/)
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install ALL dependencies (needed for TypeScript compilation)
RUN npm ci

# Copy backend source
COPY backend/ ./

# Compile TypeScript to JavaScript (outputs to dist/)
RUN npm run build

# Stage 3: Production Runtime Dependencies
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install ONLY production dependencies (no dev dependencies)
RUN npm ci --omit=dev && \
    npm cache clean --force

# Stage 4: Production Runtime Image
FROM node:20-alpine

# Install dumb-init for proper signal handling and wget for healthchecks
RUN apk add --no-cache dumb-init wget

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy only what's needed to run the application
COPY --from=backend-builder --chown=nodejs:nodejs /app/backend/dist ./backend/dist
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./backend/node_modules
COPY --from=backend-builder --chown=nodejs:nodejs /app/backend/package.json ./backend/package.json
COPY --from=frontend-builder --chown=nodejs:nodejs /app/frontend/dist ./frontend/dist

# Switch to non-root user
USER nodejs

WORKDIR /app/backend

# Expose port
EXPOSE 4000

# Environment variables
ENV NODE_ENV=production \
    PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]
