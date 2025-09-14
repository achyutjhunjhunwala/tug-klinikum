# Hospital Scraper - Dockge Deployment

This directory contains optimized configuration for deploying the Hospital Scraper in [Dockge](https://github.com/louislam/dockge) on Proxmox.

## 🚀 Quick Start

### Choose Your Deployment Method

**Option 1: Inline Configs (Recommended)**
- Everything in one docker-compose.yml file
- Use `docker-compose-inline.yml` 

**Option 2: Init Container** 
- Uses an init container to create configs
- Use `docker-compose-init.yml`

**Option 2 Only**: We provide two self-contained approaches that work perfectly with Dockge's UI-only workflow.

### 1. Deploy in Dockge UI

1. **Create New Stack**:
   - Open Dockge → Create new stack
   - Name: `hospital-scraper`

2. **Copy Files**:
   - **docker-compose.yml**: Copy contents from:
     - `docker-compose-inline.yml` (recommended)
     - OR `docker-compose-init.yml` (alternative)
   - **.env**: Copy from `.env.example` and configure

3. **Configure Environment** (in Dockge UI):
   ```env
   # Essential - Get from Elasticsearch Cloud Console
   ELASTICSEARCH_CLOUD_URL=https://your-deployment.es.region.gcp.cloud.es.io:9200
   ELASTICSEARCH_API_KEY=your_elasticsearch_api_key_here
   ELASTICSEARCH_APM_URL=https://your-deployment.apm.region.gcp.cloud.es.io:443
   ```

4. **Deploy the Stack**:
   - Click "Deploy" in Dockge UI
   - Monitor startup in Dockge logs

## 📋 Deployment Options Comparison

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **Inline Configs** | ✅ Single file<br/>✅ UI-only deployment<br/>✅ No file copying<br/>✅ Simple | ❌ Large compose file | **Recommended for Dockge** |
| **Init Container** | ✅ Dynamic config generation<br/>✅ UI-only deployment<br/>✅ Cleaner separation | ❌ Extra container<br/>❌ Slightly more complex | Advanced users |

## 📊 Monitoring & Health Checks

### Service URLs
- **Application Health**: `http://proxmox-ip:3000/health`
- **Metrics**: `http://proxmox-ip:8889/metrics`
- **OTEL Collector**: `http://proxmox-ip:4317` (gRPC), `http://proxmox-ip:4318` (HTTP)

### Dockge Benefits
- ✅ **Visual Monitoring**: Container status, logs, and resource usage
- ✅ **Easy Updates**: Pull new images and restart with one click
- ✅ **Health Checks**: Built-in monitoring with visual indicators
- ✅ **Log Management**: Centralized log viewing and searching
- ✅ **Volume Management**: Persistent data for logs and screenshots

## 🔧 Configuration Options

### Port Customization
Customize ports in `.env` to avoid conflicts:

```env
# Example: Use different ports
APP_PORT=3001
OTEL_GRPC_PORT=4327
OTEL_HTTP_PORT=4328
METRICS_PORT=8890
```

### Proxy Configuration
If your Proxmox/Dockge setup uses a proxy:

```env
PROXY_SERVER=http://proxy.example.com:8080
PROXY_USERNAME=your_username
PROXY_PASSWORD=your_password
```

### Resource Limits
Add to `docker-compose.yml` if needed:

```yaml
services:
  hospital-scraper:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

## 📦 Data Persistence

The stack creates persistent volumes:
- `hospital-logs`: Application and system logs
- `hospital-screenshots`: Browser screenshots for debugging

Data persists across container restarts and updates.

## 🔍 Troubleshooting

### Common Issues

1. **Services Won't Start**:
   ```bash
   # Check Dockge logs or run:
   docker compose logs -f
   ```

2. **Port Conflicts**:
   - Modify ports in `.env` file
   - Restart stack in Dockge

3. **Elasticsearch Connection**:
   - Verify API key has correct permissions
   - Check firewall rules on Proxmox
   - Validate URLs in `.env`

4. **Health Check Fails**:
   ```bash
   # Test directly:
   curl http://localhost:3000/health
   
   # Check application logs:
   docker logs hospital-scraper-app
   ```

### Dockge-Specific Tips

- **Restart Individual Services**: Use Dockge UI to restart only failed services
- **Resource Monitoring**: Check CPU/Memory usage in Dockge dashboard
- **Easy Updates**: Pull latest image tags and restart with one click
- **Backup Configuration**: Export stack configuration from Dockge

## 🚀 Production Considerations

### Security
- Place behind reverse proxy (Traefik, Nginx)
- Use Proxmox firewall rules
- Consider VPN access for monitoring ports

### Monitoring Integration
- **Grafana**: Connect to `http://proxmox-ip:8889/metrics`
- **Elasticsearch**: View data in Kibana
- **APM**: Monitor performance in Elastic APM

### Backup Strategy
- Export Dockge stack configuration
- Backup Elasticsearch data
- Consider volume snapshots in Proxmox

## 📋 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ELASTICSEARCH_CLOUD_URL` | ✅ | - | Elasticsearch cluster endpoint |
| `ELASTICSEARCH_API_KEY` | ✅ | - | Base64 encoded API key |
| `ELASTICSEARCH_APM_URL` | ✅ | - | APM server endpoint |
| `APP_PORT` | ❌ | 3000 | External port for application |
| `SCRAPING_INTERVAL` | ❌ | 30 | Scraping frequency (minutes) |
| `LOG_LEVEL` | ❌ | info | Logging level |
| `SCRAPING_TIMEZONE` | ❌ | Europe/Berlin | Timezone for scheduling |

See `.env.example` for complete configuration options.