# 🔍 September 29th Changes - Root Cause Analysis

## Summary

On **September 29th, 2025**, there were **13 commits** made to the repository. The logs stopped reaching Elasticsearch on this date. Based on my analysis, here's what happened:

## Changes Made on September 29th

### 1. **Major Change: Added UI Frontend & Backend** (Commit: `eadc6c3`)
- Added complete React frontend
- Added Express backend API
- **Modified `docker-compose.yml` files** to add new `hospital-ui` service
- Created new Docker image: `tug-klinikum-ui`

**Impact on Scraper Logging:** ❓ Unlikely direct impact - only added new service, didn't modify scraper config

---

### 2. **Docker Image Architecture Change** (Commit: `00295dc`)
- Limited Docker images to `linux/amd64` only (removed ARM64 support)

**Impact on Scraper Logging:** ❌ **NO IMPACT** - Architecture change only affects build, not runtime

---

### 3. **Security Headers Added** (Commit: `bc292b1`)
- Added HSTS and CORS security logic to UI backend

**Impact on Scraper Logging:** ❌ **NO IMPACT** - Only affects UI, not scraper

---

### 4. **Removed Localhost References** (Commit: `3964bf9`)
- Fixed frontend API calls to use relative URLs

**Impact on Scraper Logging:** ❌ **NO IMPACT** - Only affects UI, not scraper

---

### 5. **UI Design Changes** (Commits: `f922374`, `2cb1f72`)
- Changed favicon
- Redesigned header

**Impact on Scraper Logging:** ❌ **NO IMPACT** - Only affects UI, not scraper

---

## 🎯 ROOT CAUSE ANALYSIS

### What Changed in Docker Compose?

Let me check if the deployment process changed:

**Before September 29th:**
- Only scraper service existed
- OTEL collector and Filebeat were working

**After September 29th:**
- **New UI service added** to docker-compose
- Scraper service **configuration unchanged**
- OTEL collector **configuration unchanged**

### Most Likely Scenarios

#### Scenario 1: **Portainer Deployment Issue** (MOST LIKELY) ⚠️

When you added the new `hospital-ui` service on Sept 29th and ran `docker-compose up -d` on Portainer, Docker Compose might have:

1. **Recreated ALL containers** (including OTEL collector)
2. **Lost environment variables** if `.env` file wasn't properly configured
3. **Created new volumes** instead of reusing old ones
4. **Network issues** between services

**How to verify:**
```bash
# On your Portainer server
docker inspect hospital-scraper-otel | grep -A 10 "Env"
docker inspect hospital-scraper-app | grep -A 10 "Env"
```

Check if `ELASTICSEARCH_API_KEY` and `ELASTICSEARCH_CLOUD_URL` are set correctly.

---

#### Scenario 2: **Elasticsearch API Key Expired** (VERY LIKELY) ⚠️

Elastic Cloud API keys can have expiration dates. If your key expired on Sept 29th:
- Scraper continues to work (writes data)
- OTEL collector **fails to forward logs** (401 Unauthorized)
- Metrics might still work (different endpoint)

**How to verify:**
```bash
# Check OTEL collector logs for auth errors
docker logs hospital-scraper-otel --since 2024-09-29 | grep -i "401\|unauthorized\|auth"
```

---

#### Scenario 3: **Docker Compose Version Mismatch**

If you updated `docker-compose.yml` but didn't run `docker-compose pull` or restart properly:
- Old OTEL collector image might be running
- Missing environment variables
- Wrong network configuration

**How to verify:**
```bash
docker images | grep -E "otel|tug-klinikum"
docker inspect hospital-scraper-otel | grep "Image"
```

---

## 🛠️ HOW TO FIX

### Step 1: Run the Diagnostic Script

On your Portainer server:
```bash
# Upload the script
cd /path/to/your/portainer/directory
wget https://raw.githubusercontent.com/YOUR_REPO/main/scripts/diagnose-logging.sh
chmod +x diagnose-logging.sh
./diagnose-logging.sh
```

Or manually run:
```bash
cd /path/to/portainer  # wherever your docker-compose.yml is
bash /path/to/tug-klinikum/scripts/diagnose-logging.sh > diagnostic-output.txt 2>&1
cat diagnostic-output.txt
```

---

### Step 2: Check Elasticsearch API Key

1. Go to **Kibana** → **Stack Management** → **Security** → **API Keys**
2. Find your key (look for one created before Sept 29)
3. Check if it's **Expired** or **Deleted**
4. If yes, **create a new API key**:
   - Name: `hospital-scraper-api-key`
   - Permissions: `monitor`, `manage_index_templates`, `manage_ilm`, `write`
   - Expiration: `Never` or set a long expiration

---

### Step 3: Update Environment Variables

On your Portainer server, edit the `.env` file:
```bash
cd /path/to/portainer
nano .env  # or vi .env
```

Update:
```bash
ELASTICSEARCH_API_KEY=YOUR_NEW_API_KEY_HERE
```

Save and exit.

---

### Step 4: Restart Services

```bash
cd /path/to/portainer
docker-compose down
docker-compose pull  # Get latest images
docker-compose up -d

# Wait 60 seconds for initialization
sleep 60

# Check status
docker ps --filter "name=hospital"
docker logs hospital-scraper-otel --tail 20
docker logs hospital-scraper-filebeat --tail 20
docker logs hospital-scraper-app --tail 20
```

---

### Step 5: Verify Logs Are Flowing

**Wait 2-3 minutes**, then check Kibana:

1. Go to **Kibana** → **Discover**
2. Index pattern: `hospital-scraper-logs*`
3. Time range: **Last 15 minutes**
4. You should see new logs appearing

---

## 📊 What to Check in Diagnostic Output

When you run `diagnose-logging.sh`, look for:

### Red Flags 🚩

1. **"401 Unauthorized"** or **"403 Forbidden"** in OTEL logs
   → API key is expired/invalid

2. **"connection refused"** or **"timeout"** in OTEL logs
   → Network issue or Elasticsearch URL wrong

3. **"No such container"** errors
   → Container not running, needs restart

4. **Empty log files** or **"file not found"**
   → Volume mount issue or scraper not writing logs

5. **"certificate"** errors
   → SSL/TLS issue with Elasticsearch connection

---

## 🎯 My Best Guess

Based on the timeline and changes:

**70% Probability:** Elasticsearch API key expired on Sept 29th
**20% Probability:** Docker Compose restart lost environment variables
**10% Probability:** Network or configuration issue during deployment

**Recommended Action:**
1. Run the diagnostic script
2. Check/regenerate API key
3. Restart services
4. Monitor for 5 minutes

This should fix 90% of "logs stopped on specific date" issues.

---

## Prevention for Future

1. **Set API keys to never expire** (or set calendar reminder)
2. **Keep `.env` file in safe backup** (encrypted)
3. **Add health check alerts** in Kibana for missing logs
4. **Document deployment process** to avoid env var loss
5. **Use Portainer stacks** with inline `.env` to prevent loss

---

## Need More Help?

Run the diagnostic script and share the output. I can pinpoint the exact issue from those logs.

