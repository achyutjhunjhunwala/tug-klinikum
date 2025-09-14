#!/bin/bash

echo "🛑 STOPPING PRODUCTION DEPLOYMENT"
echo "=================================="

# Stop all services
docker-compose down

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -f /tmp/filebeat-prod.yml

# Optional: Remove volumes (uncomment if you want to clean up completely)
# echo "🗑️  Removing volumes..."
# docker-compose down -v

echo ""
echo "✅ Production stack stopped"
echo "🚀 To restart: ./prod-start.sh"
