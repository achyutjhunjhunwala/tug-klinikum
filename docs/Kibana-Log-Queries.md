# 🔍 Quick Reference: Where to Find Logs in Kibana

## UI Backend API Server Logs

### Index Pattern
```
filebeat-*
```

### Filters to Use
```
app: "hospital-ui"
```

### Common Queries

**All UI Backend Logs:**
```
app:"hospital-ui"
```

**API Errors:**
```
app:"hospital-ui" AND level:"error"
```

**API Requests (with duration):**
```
app:"hospital-ui" AND http.method:*
```

**Rate Limit Warnings:**
```
app:"hospital-ui" AND message:"Rate limit"
```

**Slow API Calls (>500ms):**
```
app:"hospital-ui" AND http.duration_ms:>500
```

**Validation Errors:**
```
app:"hospital-ui" AND validation_errors:*
```

---

## Hospital Scraper Logs

### Index Pattern
```
hospital-scraper-logs*
```

### Filters to Use
```
service: "hospital-scraper"
```

---

## OTEL Collector Logs

### How to Access
```bash
docker logs hospital-scraper-otel
```

These logs are NOT in Elasticsearch (they're the collector's own logs).

---

## Filebeat Logs

### How to Access
```bash
docker logs hospital-scraper-filebeat
```

To check if Filebeat is collecting UI logs:
```bash
docker logs hospital-scraper-filebeat | grep -i "hospital-ui\|ui/"
```

---

## Verification Steps

### 1. Check if UI Backend is writing logs to file
```bash
docker exec hospital-ui-server cat /app/logs/hospital-ui-api.log
```

### 2. Check if Filebeat can see the logs
```bash
docker exec hospital-scraper-filebeat ls -la /app/logs/ui/
```

### 3. Check Filebeat is processing logs
```bash
docker logs hospital-scraper-filebeat --tail 50
```

### 4. Query Kibana Discovery
- Go to Kibana → Discover
- Select index pattern: `filebeat-*`
- Add filter: `app: "hospital-ui"`
- Set time range appropriately

---

## If Logs Are Still Missing

### Restart the stack to apply changes:
```bash
cd /path/to/portainer  # or dockge
docker-compose down
docker-compose up -d
```

### Wait 30 seconds for initialization, then test:
```bash
# Generate some logs by hitting the API
curl http://localhost:4000/health

# Check the log file
docker exec hospital-ui-server cat /app/logs/hospital-ui-api.log

# Check Filebeat
docker logs hospital-scraper-filebeat --tail 20

# Then check Kibana after ~1 minute
```

---

## Important Notes

1. **Filebeat creates indices with timestamp suffixes**
   - Example: `filebeat-2025.10.26`
   - Use pattern: `filebeat-*` to see all

2. **UI logs have field `app: "hospital-ui"`**
   - Always filter by this field to isolate UI backend logs

3. **Logs may take 30-60 seconds to appear in Kibana**
   - Filebeat batches logs before sending
   - Elasticsearch needs to index them

4. **Log files rotate automatically**
   - Pino writes to a single file (no rotation by default)
   - Consider adding log rotation for production

---

## Docker Compose Changes Applied

✅ Added volume mount for UI logs: `hospital-ui-logs:/app/logs`
✅ Updated Filebeat to monitor UI log directory: `/app/logs/ui/*.log`
✅ Added `app` field to distinguish between scraper and UI logs
✅ UI backend now writes to `/app/logs/hospital-ui-api.log`

**You need to restart the Docker stack for these changes to take effect!**

