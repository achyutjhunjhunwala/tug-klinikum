# 🌐 Nginx Proxy Manager Setup Guide

## Complete setup guide for exposing your Hospital Dashboard with HTTPS

---

## 📋 **Overview**

This guide walks you through setting up Nginx Proxy Manager to expose your Hospital Dashboard at:
- **Public URL**: `https://klinikum.ajvilla.duckdns.org`
- **Backend Target**: `http://192.168.178.92:4000`

---

## ✅ **Prerequisites**

1. ✅ Nginx Proxy Manager installed and running
2. ✅ DuckDNS account with domain: `klinikum.ajvilla.duckdns.org`
3. ✅ Port 80 and 443 forwarded to Nginx Proxy Manager
4. ✅ Hospital UI container running on port 4000

---

## 🔧 **Step 1: Update Environment Variables**

Add these to your `.env` file (or Portainer/Dockge environment variables):

```bash
# Enable HTTPS mode for production security headers
USE_HTTPS=true

# Set your public domain for CORS (no spaces!)
CORS_ORIGINS=https://klinikum.ajvilla.duckdns.org
```

**Important:** These values are read from environment variables and NOT hardcoded in docker-compose files for security.

**Action Required:** 
1. Add variables to your `.env` file or Portainer environment
2. Recreate your container to apply changes

---

## 🌐 **Step 2: Configure Nginx Proxy Manager**

### **Add Proxy Host:**

1. **Login to Nginx Proxy Manager** (usually `http://your-server:81`)

2. **Click "Proxy Hosts" → "Add Proxy Host"**

3. **Details Tab:**
   ```
   Domain Names: klinikum.ajvilla.duckdns.org
   Scheme: http
   Forward Hostname/IP: 192.168.178.92  (or container name if on same network)
   Forward Port: 4000
   Cache Assets: ✅ ON
   Block Common Exploits: ✅ ON
   Websockets Support: ✅ ON (if needed for real-time updates)
   ```

4. **SSL Tab:**
   ```
   SSL Certificate: Request a new SSL Certificate with Let's Encrypt
   Force SSL: ✅ ON
   HTTP/2 Support: ✅ ON
   HSTS Enabled: ✅ ON
   HSTS Subdomains: ✅ ON (if you want)
   
   Email Address: your-email@example.com
   Agree to Let's Encrypt Terms: ✅ ON
   ```

5. **Advanced Tab** (Optional but recommended):
   ```nginx
   # Custom Nginx Configuration
   
   # Increase timeout for long-running queries
   proxy_connect_timeout 60s;
   proxy_send_timeout 60s;
   proxy_read_timeout 60s;
   
   # Buffer settings for better performance
   proxy_buffering on;
   proxy_buffer_size 4k;
   proxy_buffers 8 4k;
   
   # Headers for better security and functionality
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   proxy_set_header X-Forwarded-Host $host;
   
   # Don't modify security headers from backend
   proxy_pass_header Cross-Origin-Opener-Policy;
   proxy_pass_header Cross-Origin-Resource-Policy;
   proxy_pass_header Content-Security-Policy;
   ```

6. **Click "Save"**

---

## 🔒 **Step 3: Verify SSL Certificate**

1. Wait 1-2 minutes for Let's Encrypt to issue the certificate
2. Check the Proxy Hosts list - SSL status should show 🔒 with expiry date
3. Visit: `https://klinikum.ajvilla.duckdns.org`
4. You should see a valid SSL certificate (green padlock in browser)

---

## 🧪 **Step 4: Test Your Setup**

### **Check HTTPS Redirect:**
```bash
curl -I http://klinikum.ajvilla.duckdns.org
# Should return 301/302 redirect to HTTPS
```

### **Check HTTPS Access:**
```bash
curl -I https://klinikum.ajvilla.duckdns.org
# Should return 200 OK with security headers
```

### **Test in Browser:**
1. Open: `https://klinikum.ajvilla.duckdns.org`
2. Check Developer Tools → Console (should have no errors)
3. Check Developer Tools → Network → Headers
4. Verify these headers are present:
   ```
   strict-transport-security: max-age=31536000; includeSubDomains; preload
   x-content-type-options: nosniff
   x-frame-options: DENY
   referrer-policy: strict-origin-when-cross-origin
   ```

---

## 🎯 **Architecture Flow**

```
Internet
    ↓
DuckDNS (klinikum.ajvilla.duckdns.org)
    ↓
Your Router (Port 443 forward)
    ↓
Nginx Proxy Manager (Port 443)
    ↓ SSL Termination
    ↓ HTTP (internal network - secure)
Hospital UI Container (Port 4000)
    ↓
Elasticsearch Cloud
```

---

## 🔍 **Troubleshooting**

### **Issue: SSL Certificate Failed**

**Solution:**
1. Check that ports 80 and 443 are forwarded to Nginx Proxy Manager
2. Verify DuckDNS is pointing to your public IP
3. Check Nginx Proxy Manager logs: `docker logs nginx-proxy-manager`

### **Issue: 502 Bad Gateway**

**Solution:**
1. Verify hospital-ui container is running: `docker ps | grep hospital-ui`
2. Check container logs: `docker logs hospital-ui-server`
3. Verify the IP address (192.168.178.92) is correct
4. Test direct access: `curl http://192.168.178.92:4000/health`

### **Issue: CORS Errors in Browser**

**Solution:**
1. Verify `CORS_ORIGINS` includes your HTTPS domain
2. Recreate container after environment variable update
3. Check backend logs for CORS rejections

### **Issue: Assets Not Loading (ERR_SSL_PROTOCOL_ERROR)**

**Solution:**
1. Verify `USE_HTTPS=true` is set in environment
2. Check that Force SSL is enabled in Nginx Proxy Manager
3. Clear browser cache and reload

### **Issue: Mixed Content Warnings**

**Solution:**
- This should not happen with `USE_HTTPS=true`
- If it does, check that all assets are loaded via relative paths

---

## 🔐 **Security Checklist**

After setup, verify:

- ✅ HTTPS is enforced (HTTP redirects to HTTPS)
- ✅ Valid SSL certificate (not self-signed)
- ✅ HSTS header present
- ✅ Security headers visible in browser dev tools
- ✅ No console errors about mixed content
- ✅ Rate limiting working (test with rapid requests)
- ✅ Health endpoint accessible: `https://klinikum.ajvilla.duckdns.org/health`

---

## 📊 **Monitoring**

### **Check Application Health:**
```bash
curl https://klinikum.ajvilla.duckdns.org/health
```

### **Check SSL Certificate Expiry:**
```bash
echo | openssl s_client -servername klinikum.ajvilla.duckdns.org -connect klinikum.ajvilla.duckdns.org:443 2>/dev/null | openssl x509 -noout -dates
```

### **View Access Logs:**
In Nginx Proxy Manager, click on your proxy host → View Logs

---

## 🎯 **Final Configuration Summary**

| Item | Value |
|------|-------|
| **Public URL** | `https://klinikum.ajvilla.duckdns.org` |
| **Backend** | `http://192.168.178.92:4000` |
| **SSL** | Let's Encrypt (auto-renew) |
| **HTTPS Mode** | Enabled (`USE_HTTPS=true`) |
| **CORS Origin** | `https://klinikum.ajvilla.duckdns.org` |
| **Force HTTPS** | Yes |
| **HSTS** | Enabled (1 year) |
| **Security Headers** | Production-grade |

---

## 🚀 **Going Live**

Once everything is tested:

1. ✅ Update any bookmarks to use HTTPS URL
2. ✅ Share the public URL: `https://klinikum.ajvilla.duckdns.org`
3. ✅ Monitor logs for the first few hours
4. ✅ Set up Let's Encrypt renewal reminders (auto-renews 30 days before expiry)

---

## 📚 **Related Documentation**

- [Ports.md](./Ports.md) - Complete port mapping
- [Architecture.md](./Architecture.md) - System architecture
- [UI README](../ui/README.md) - Frontend and backend details

---

**Your Hospital Dashboard is now publicly accessible with enterprise-grade security!** 🎉
