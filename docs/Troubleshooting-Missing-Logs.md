# 🔧 Troubleshooting: Scraper Logs Not Reaching Elasticsearch

## Problem
Scraper is working (collecting data), but logs haven't been reaching Elasticsearch since **September 29th, 2025**.

## Diagnosis Steps

### 1. SSH to Proxmox Server
```bash
ssh root@192.168.178.92
# or your proxmox credentials
```

---

### 2. Check Container Status
```bash
docker ps --filter "name=hospital" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**Expected Output:**
```
NAMES                          STATUS              PORTS
hospital-scraper-app           Up X hours          0.0.0.0:3000->3000/tcp
hospital-ui-server             Up X hours          0.0.0.0:4000->4000/tcp
hospital-scraper-otel          Up X hours          0.0.0.0:4317-4318->4317-4318/tcp
hospital-scraper-filebeat      Up X hours
```

If any container is not running:
```bash
docker-compose -f /path/to/docker-compose.yml up -d
```

---

### 3. Check Scraper Application Logs
```bash
# Check if scraper is running and scraping
docker logs hospital-scraper-app --tail 100

# Look for:
# ✅ "Scraping job completed successfully"
# ✅ "Data saved to Elasticsearch"
# ❌ Any errors
```

---

### 4. Check OTEL Collector
```bash
# Check OTEL collector logs
docker logs hospital-scraper-otel --tail 100 2>&1

# Look for:
# ❌ "connection refused"
# ❌ "401 Unauthorized" 
# ❌ "certificate" errors
# ❌ "elasticsearch" errors
```

**Common Issues:**

#### A. OTEL Can't Connect to Elasticsearch
```bash
# Check environment variables
docker exec hospital-scraper-otel env | grep ELASTIC

# Should show:
# ELASTICSEARCH_CLOUD_URL=https://your-cluster.elastic-cloud.com
# ELASTICSEARCH_API_KEY=your-api-key
# ELASTICSEARCH_APM_URL=https://your-apm-endpoint
```

#### B. API Key Expired or Invalid
```bash
# Test Elasticsearch connection
docker exec hospital-scraper-otel wget --spider --header="Authorization: ApiKey ${ELASTICSEARCH_API_KEY}" ${ELASTICSEARCH_CLOUD_URL}
```

If this fails (401/403), your API key might be expired or revoked.

**Fix:** Regenerate API key in Kibana:
1. Go to Kibana → Stack Management → API Keys
2. Check if your key exists and is active
3. If expired/deleted, create a new one
4. Update `.env` file with new key
5. Restart containers: `docker-compose restart`

---

### 5. Check Filebeat
```bash
# Check Filebeat logs
docker logs hospital-scraper-filebeat --tail 100 2>&1

# Look for:
# ❌ "ERROR" or "FAILED"
# ❌ "Connection refused"
# ❌ "401" / "403" (authentication errors)
# ✅ "Successfully published" (good sign)
```

**Common Issues:**

#### A. Filebeat Can't Read Log Files
```bash
# Check if log files exist
docker exec hospital-scraper-filebeat ls -la /app/logs/

# Should show:
# hospital-scraper.log
```

#### B. Filebeat Can't Connect to Elasticsearch
```bash
# Check Filebeat config
docker exec hospital-scraper-filebeat cat /usr/share/filebeat/filebeat.yml | grep -A 3 "output.elasticsearch"
```

---

### 6. Check Log Files Directly
```bash
# Check scraper log file
docker exec hospital-scraper-app tail -f /app/logs/hospital-scraper.log

# Should show JSON logs like:
# {"level":"info","time":"2025-10-26T...","msg":"Scraping job started"}
```

If file is empty or doesn't exist:
- Scraper isn't writing logs to file
- Volume mount might be missing

---

### 7. Check Docker Volumes
```bash
# List volumes
docker volume ls | grep hospital

# Inspect log volume
docker volume inspect hospital-logs

# Check volume contents
docker run --rm -v hospital-logs:/data alpine ls -la /data/
```

---

### 8. Check Network Connectivity
```bash
# From scraper container to OTEL collector
docker exec hospital-scraper-app wget --spider http://otel-collector:4317

# From OTEL collector to Elasticsearch
docker exec hospital-scraper-otel wget --spider ${ELASTICSEARCH_CLOUD_URL}
```

---

## Most Likely Root Causes

### 1. **Elasticsearch API Key Expired** (Most Common)
Elastic Cloud API keys can expire. If your key expired on Sept 29th, logs would stop.

**Fix:**
1. Go to Kibana → Stack Management → Security → API Keys
2. Check your key status
3. Create new key if expired
4. Update `.env` with new key: `ELASTICSEARCH_API_KEY=new_key_here`
5. Restart: `docker-compose restart`

---

### 2. **OTEL Collector Crashed/Restarted**
If OTEL collector restarted without proper config, it won't forward logs.

**Check:**
```bash
docker logs hospital-scraper-otel --since 2025-09-29
```

**Fix:**
```bash
docker-compose restart otel-collector
```

---

### 3. **Filebeat Configuration Issue**
Filebeat might have lost connection or configuration.

**Check:**
```bash
docker logs hospital-scraper-filebeat --since 2025-09-29 | grep -i "error\|fail"
```

**Fix:**
```bash
docker-compose restart filebeat
```

---

### 4. **Elasticsearch Index Full or Blocked**
Your Elasticsearch cluster might be full or have blocked writes.

**Check in Kibana:**
1. Go to Stack Management → Index Management
2. Look for `hospital-scraper-logs*` indices
3. Check for any errors or warnings

---

### 5. **Docker Compose File Changed**
If you deployed a new version on Sept 29th, it might have broken the logging config.

**Check:**
```bash
cd /path/to/docker-compose/directory
git log --since="2025-09-29" --until="2025-09-30" --oneline
```

---

## Quick Fix: Restart Everything

If you can't find the issue, restart the entire stack:

```bash
cd /path/to/portainer  # or dockge directory
docker-compose down
docker-compose pull
docker-compose up -d

# Wait 60 seconds for initialization
sleep 60

# Check logs
docker logs hospital-scraper-app --tail 20
docker logs hospital-scraper-otel --tail 20
docker logs hospital-scraper-filebeat --tail 20
```

---

## Verify Logs Are Flowing Again

### 1. Check Kibana (wait 2-3 minutes after restart)
```
Go to: Kibana → Discover
Index Pattern: hospital-scraper-logs*
Time Range: Last 15 minutes
```

You should see new logs appearing.

### 2. Check OTEL Collector is Sending
```bash
docker logs hospital-scraper-otel --tail 50 | grep -i "exported"
# Should show: "Logs exported: X items"
```

### 3. Check Filebeat is Publishing
```bash
docker logs hospital-scraper-filebeat --tail 50 | grep -i "publish"
# Should show: "Events published: X"
```

---

## Still Not Working?

### Get Full Diagnostic Report
Run this on your Proxmox server and share the output:

```bash
#!/bin/bash
echo "=== Container Status ===" 
docker ps --filter "name=hospital" --format "table {{.Names}}\t{{.Status}}"

echo -e "\n=== Scraper Logs (last 50) ==="
docker logs hospital-scraper-app --tail 50 2>&1 | tail -20

echo -e "\n=== OTEL Collector Logs (last 50) ==="
docker logs hospital-scraper-otel --tail 50 2>&1 | tail -20

echo -e "\n=== Filebeat Logs (last 50) ==="
docker logs hospital-scraper-filebeat --tail 50 2>&1 | tail -20

echo -e "\n=== Environment Variables ==="
docker exec hospital-scraper-otel env | grep -i elastic

echo -e "\n=== Network Test ==="
docker exec hospital-scraper-otel wget --spider ${ELASTICSEARCH_CLOUD_URL} 2>&1 | tail -5

echo -e "\n=== Volume Check ==="
docker volume inspect hospital-logs | grep Mountpoint
docker run --rm -v hospital-logs:/data alpine ls -la /data/ 2>&1

echo -e "\n=== Log File Contents (last 10 lines) ==="
docker exec hospital-scraper-app tail -10 /app/logs/hospital-scraper.log 2>&1
```

Save as `diagnostic.sh`, run `chmod +x diagnostic.sh && ./diagnostic.sh`, and share the output.

---

## Summary

**Most likely cause:** Elasticsearch API key expired on September 29th, 2025.

**Quick fix:**
1. Check API key in Kibana
2. Regenerate if needed
3. Update `.env` file
4. Restart containers: `docker-compose restart`
5. Wait 2 minutes
6. Check Kibana for new logs

This should resolve 90% of "logs stopped suddenly" issues.

