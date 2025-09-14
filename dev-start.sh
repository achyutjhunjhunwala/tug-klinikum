#!/bin/bash

echo "🚀 HOSPITAL SCRAPER - LOCAL DEVELOPMENT"
echo "======================================="
echo "Starting complete observability stack..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found!"
    echo "   Copy .env.example to .env and configure your Elasticsearch credentials"
    exit 1
fi

# Load environment variables
source .env
echo "✅ Environment variables loaded"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ ERROR: Docker is not running!"
    exit 1
fi
echo "✅ Docker is running"

# Create logs directory
mkdir -p logs
echo "✅ Logs directory ready"

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker stop hospital-scraper-otel hospital-scraper-filebeat 2>/dev/null || true
docker rm hospital-scraper-otel hospital-scraper-filebeat 2>/dev/null || true

echo ""
echo "🚀 Starting OTEL Collector..."
# Start OTEL Collector
docker run -d \
    --name hospital-scraper-otel \
    -p 4317:4317 \
    -p 4318:4318 \
    -p 8889:8889 \
    -v "$(pwd)/config/otel.yaml:/etc/otel-collector-config.yaml:ro" \
    -e ELASTICSEARCH_CLOUD_URL="$ELASTICSEARCH_CLOUD_URL" \
    -e ELASTICSEARCH_API_KEY="$ELASTICSEARCH_API_KEY" \
    -e ELASTICSEARCH_APM_URL="$ELASTICSEARCH_APM_URL" \
    otel/opentelemetry-collector-contrib:latest \
    --config=/etc/otel-collector-config.yaml

echo "🚀 Starting Filebeat..."
# Generate Filebeat config from template with actual values
DECODED_API_KEY=$(echo "$ELASTICSEARCH_API_KEY" | base64 -d 2>/dev/null || echo "$ELASTICSEARCH_API_KEY")

# Create temporary config with substituted values
sed -e "s|ELASTICSEARCH_CLOUD_URL_PLACEHOLDER|$ELASTICSEARCH_CLOUD_URL|g" \
    -e "s|ELASTICSEARCH_API_KEY_PLACEHOLDER|$DECODED_API_KEY|g" \
    config/filebeat.yml > /tmp/filebeat-runtime.yml

# Start Filebeat with substituted config
docker run -d \
    --name hospital-scraper-filebeat \
    --user root \
    -v "/tmp/filebeat-runtime.yml:/usr/share/filebeat/filebeat.yml:ro" \
    -v "$(pwd)/logs:/app/logs:ro" \
    docker.elastic.co/beats/filebeat:8.11.0

# Wait for services to start
echo "⏳ Waiting for services to initialize..."
sleep 8

# Check if services are running
OTEL_RUNNING=$(docker ps | grep hospital-scraper-otel | wc -l)
FILEBEAT_RUNNING=$(docker ps | grep hospital-scraper-filebeat | wc -l)

if [ "$OTEL_RUNNING" -eq 1 ] && [ "$FILEBEAT_RUNNING" -eq 1 ]; then
    echo ""
    echo "✅ ALL SERVICES RUNNING!"
    echo "========================"
    echo "📊 OTEL Collector: http://localhost:4317 (gRPC), http://localhost:4318 (HTTP)"
    echo "📝 Filebeat: Monitoring logs/ directory"
    echo "📈 Metrics: http://localhost:8889/metrics"
    echo ""
    echo "🎯 NOW RUN YOUR APP:"
    echo "   npm start"
    echo ""
    echo "📊 CHECK IN KIBANA:"
    echo "   - APM: hospital-scraper service (traces + metrics)"
    echo "   - Discover: filebeat-* index (logs with pipeline processing)"
    echo ""
    echo "🔍 MONITOR:"
    echo "   - OTEL: docker logs -f hospital-scraper-otel"
    echo "   - Filebeat: docker logs -f hospital-scraper-filebeat"
    echo "   - App logs: tail -f logs/hospital-scraper.log"
    echo ""
    echo "🛑 STOP ALL:"
    echo "   ./dev-stop.sh"
else
    echo "❌ Failed to start services"
    echo "   OTEL running: $OTEL_RUNNING"
    echo "   Filebeat running: $FILEBEAT_RUNNING"
    echo ""
    echo "🔍 Check logs:"
    echo "   docker logs hospital-scraper-otel"
    echo "   docker logs hospital-scraper-filebeat"
    exit 1
fi
