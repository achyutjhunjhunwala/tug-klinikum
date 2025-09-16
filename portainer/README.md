# Hospital Scraper - Portainer Deployment

This directory contains configuration for deploying the Hospital Scraper using [Portainer](https://www.portainer.io/).

## 🚀 Quick Start

### 1. Create Stack in Portainer

1. **Access Portainer**: Open your Portainer web interface
2. **Create New Stack**:
   - Navigate to Stacks → Add Stack
   - Name: `hospital-scraper`
3. **Upload Files**:
   - Copy contents of `docker-compose.yml`
   - Copy contents of `.env.example` to environment variables

### 2. Configure Environment Variables

Set these variables in Portainer's environment section:

```env
# Essential - Get from Elasticsearch Cloud Console
ELASTICSEARCH_CLOUD_URL=https://your-deployment.es.region.gcp.cloud.es.io:9200
ELASTICSEARCH_API_KEY=your_elasticsearch_api_key_here
ELASTICSEARCH_APM_URL=https://your-deployment.apm.region.gcp.cloud.es.io:443

# Optional - Dual URL Configuration (defaults provided)
ADULT_TARGET_URL=https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle
CHILDREN_TARGET_URL=https://www.vivantes.de/klinikum-im-friedrichshain/kinder-jugendmedizin/kinderrettungsstelle
```

### 3. Deploy the Stack

Click **Deploy the Stack** in Portainer interface.

## 📊 Monitoring

### Service URLs
- **Application Health**: `http://host-ip:3000/health`
- **Metrics**: `http://host-ip:8889/metrics`
- **OTEL Collector**: `http://host-ip:4317` (gRPC), `http://host-ip:4318` (HTTP)

### Portainer Benefits
- ✅ **Visual Dashboard**: Container status and resource usage
- ✅ **Log Viewer**: Real-time log streaming
- ✅ **Easy Updates**: Pull new images with one click
- ✅ **Stack Management**: Start/stop/restart entire stack
- ✅ **Volume Management**: Persistent data handling

## 🔧 Configuration

### Port Customization
Modify ports in environment variables:

```env
APP_PORT=3001
OTEL_GRPC_PORT=4327
OTEL_HTTP_PORT=4328
METRICS_PORT=8890
```

### Proxy Configuration
If using a proxy:

```env
PROXY_SERVER=http://proxy.example.com:8080
PROXY_USERNAME=your_username
PROXY_PASSWORD=your_password
```

## 📦 Data Persistence

The stack creates persistent volumes:
- `hospital-logs`: Application and system logs
- `hospital-screenshots`: Browser screenshots for debugging
- `api-key-data`: Processed API key for Filebeat

## 🔍 Troubleshooting

### Common Issues

1. **Stack Won't Start**: Check environment variables in Portainer
2. **Port Conflicts**: Modify ports in environment variables
3. **Elasticsearch Connection**: Verify API key and URLs
4. **Health Check Fails**: Check application logs in Portainer

### Portainer-Specific Tips

- **Container Logs**: Click on individual containers to view logs
- **Stack Editor**: Use Portainer's editor to modify docker-compose
- **Resource Monitoring**: View CPU/Memory usage in dashboard
- **Quick Actions**: Restart containers individually from UI

## 📋 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ELASTICSEARCH_CLOUD_URL` | ✅ | - | Elasticsearch cluster endpoint |
| `ELASTICSEARCH_API_KEY` | ✅ | - | Base64 encoded API key |
| `ELASTICSEARCH_APM_URL` | ✅ | - | APM server endpoint |
| `ADULT_TARGET_URL` | ❌ | vivantes.de/...rettungsstelle | Adult emergency room URL |
| `CHILDREN_TARGET_URL` | ❌ | vivantes.de/.../kinderrettungsstelle | Children emergency room URL |
| `APP_PORT` | ❌ | 3000 | External port for application |
| `SCRAPING_INTERVAL` | ❌ | 30 | Scraping frequency (minutes) |
| `LOG_LEVEL` | ❌ | info | Logging level |

See `.env.example` for complete configuration options.