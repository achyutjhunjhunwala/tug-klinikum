#!/bin/bash

echo "🛑 STOPPING DEPLOYMENT"
echo "======================"

# Stop all services
docker-compose down

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -f /tmp/filebeat-runtime.yml

# Optional: Remove volumes (uncomment if you want to clean up completely)
# echo "🗑️  Removing volumes..."
# docker-compose down -v

echo ""
echo "✅ Stack stopped"
echo "🚀 To restart: ./start.sh"
