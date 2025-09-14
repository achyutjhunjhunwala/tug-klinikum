#!/bin/bash

echo "🚀 HOSPITAL SCRAPER - PRODUCTION DEPLOYMENT"
echo "==========================================="
echo "Starting complete containerized stack..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found!"
    echo "   Copy .env.example to .env and configure for production"
    exit 1
fi

# Load environment variables
source .env
echo "✅ Environment variables loaded"

# Validate required environment variables
REQUIRED_VARS=(
    "ELASTICSEARCH_CLOUD_URL"
    "ELASTICSEARCH_API_KEY" 
    "ELASTICSEARCH_APM_URL"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ ERROR: $var is not set in .env file"
        exit 1
    fi
done
echo "✅ Required environment variables validated"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ ERROR: Docker is not running!"
    exit 1
fi
echo "✅ Docker is running"

# Generate Filebeat config from template with actual values
echo ""
echo "🔧 Generating Filebeat configuration..."
DECODED_API_KEY=$(echo "$ELASTICSEARCH_API_KEY" | base64 -d 2>/dev/null || echo "$ELASTICSEARCH_API_KEY")

# Create temporary config with substituted values
sed -e "s|ELASTICSEARCH_CLOUD_URL_PLACEHOLDER|$ELASTICSEARCH_CLOUD_URL|g" \
    -e "s|ELASTICSEARCH_API_KEY_PLACEHOLDER|$DECODED_API_KEY|g" \
    config/filebeat.yml > /tmp/filebeat-prod.yml

echo "✅ Filebeat configuration generated"

# Build and start the complete stack
echo ""
echo "🏗️  Building application image..."
docker-compose build hospital-scraper

echo ""
echo "🚀 Starting production stack..."
docker-compose up -d

# Wait for services to start
echo "⏳ Waiting for services to initialize..."
sleep 15

# Check service health
echo ""
echo "🔍 Checking service health..."
OTEL_HEALTH=$(docker inspect hospital-scraper-otel --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
APP_HEALTH=$(docker inspect hospital-scraper-app --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

echo "   OTEL Collector: $OTEL_HEALTH"
echo "   Filebeat: $(docker ps --filter name=hospital-scraper-filebeat --format '{{.Status}}')"
echo "   Application: $APP_HEALTH"

if docker ps | grep -q hospital-scraper-app && docker ps | grep -q hospital-scraper-otel && docker ps | grep -q hospital-scraper-filebeat; then
    echo ""
    echo "🎉 PRODUCTION STACK RUNNING!"
    echo "============================"
    echo "📊 Services:"
    echo "   - Application: http://localhost:3000/health"
    echo "   - OTEL Collector: http://localhost:4317 (gRPC), http://localhost:4318 (HTTP)"
    echo "   - Filebeat: Collecting logs from application container"
    echo "   - Metrics: http://localhost:8889/metrics"
    echo ""
    echo "📊 Observability in Kibana:"
    echo "   - APM: hospital-scraper service"
    echo "   - Discover: filebeat-* index"
    echo ""
    echo "🔍 Monitor:"
    echo "   - All logs: docker-compose logs -f"
    echo "   - App only: docker logs -f hospital-scraper-app"
    echo "   - OTEL only: docker logs -f hospital-scraper-otel"
    echo "   - Filebeat only: docker logs -f hospital-scraper-filebeat"
    echo ""
    echo "🛑 Stop:"
    echo "   ./prod-stop.sh"
    echo "   or: docker-compose down"
else
    echo ""
    echo "❌ Some services failed to start"
    echo "🔍 Check logs:"
    echo "   docker-compose logs"
    exit 1
fi
