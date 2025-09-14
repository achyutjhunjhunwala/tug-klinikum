#!/bin/bash

echo "🛑 STOPPING LOCAL DEVELOPMENT SETUP"
echo "===================================="

# Stop and remove containers
echo "🛑 Stopping OTEL Collector..."
docker stop hospital-scraper-otel 2>/dev/null || true
docker rm hospital-scraper-otel 2>/dev/null || true

echo "🛑 Stopping Filebeat..."
docker stop hospital-scraper-filebeat 2>/dev/null || true
docker rm hospital-scraper-filebeat 2>/dev/null || true

echo ""
echo "🧹 Cleaning up temporary files..."
rm -f /tmp/filebeat-runtime.yml

echo ""
echo "✅ All services stopped"
echo ""
echo "📁 Log files preserved in logs/ directory"
echo "🚀 To restart: ./dev-start.sh"
