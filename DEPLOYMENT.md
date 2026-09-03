# MacroChat Production Deployment Guide

## Overview
Deploy **Signaling Server** (for WebRTC calls) + **TURN Server** (for NAT traversal) + update the **app** to use production URLs.

---

## PART 1: Deploy Signaling Server (Node.js)

### Option A: Railway (Easiest, Recommended)

1. **Create Railway account**: https://railway.app (free tier available)

2. **Connect your GitHub repo**:
   - Click "New Project" → "Deploy from GitHub"
   - Select your MacroChat repo

3. **Configure environment**:
   - Railway will auto-detect Node.js
   - Go to **Variables** tab and add:
     ```
     SUPABASE_URL=your-supabase-url
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (from Supabase)
     JWT_SECRET=your-jwt-secret (optional, for legacy auth)
     JWT_AUDIENCE=authenticated
     JWT_ISSUER=https://your-supabase-url/auth/v1
     ALLOWED_ORIGINS=https://your-app-domain.com,http://localhost:8081
     REQUIRE_CONVERSATION_MEMBERSHIP=true
     ```

4. **Get the production URL**:
   - Railway generates a public URL (e.g., `https://macrochat-signaling-prod.up.railway.app`)
   - Copy this URL

5. **Done!** Railway auto-deploys on every push to main.

---

### Option B: Render (Free alternative)

1. **Create Render account**: https://render.com

2. **Create new Web Service**:
   - Repo: your MacroChat GitHub
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm run signaling-server` (or `node signaling-server/src/server.js`)

3. **Add environment variables** (same as Railway above)

4. **Get production URL**: Render provides a `.onrender.com` URL

---

### Option C: Heroku (Legacy but still works)

1. Create Heroku account, install CLI
2. `heroku login` → `heroku create macrochat-signaling`
3. `heroku config:set SUPABASE_URL=...` (set all vars)
4. `git push heroku main`

---

## PART 2: Deploy TURN Server

TURN servers help users behind firewalls connect. Use **coturn** on a cheap VPS.

### Option A: DigitalOcean Droplet ($6/month)

1. **Create Droplet**:
   - Image: Ubuntu 22.04
   - Size: $6/month Basic
   - Region: Pick one closest to your users

2. **SSH into it**:
   ```bash
   ssh root@your-droplet-ip
   ```

3. **Install coturn**:
   ```bash
   apt-get update
   apt-get install -y coturn
   ```

4. **Configure `/etc/coturn/turnserver.conf`**:
   ```
   # Copy from: infra/turn/turnserver.conf.example
   listening-port=3478
   listening-ip=0.0.0.0
   
   # Use your droplet IP or domain
   external-ip=YOUR_DROPLET_IP
   
   realm=yourdomain.com
   server-name=yourdomain.com
   
   # Generate random passwords
   user=turnuser:your-strong-password
   
   # Keep logs quiet
   log-file=/var/log/coturn/turnserver.log
   new-log-file-period=daily
   ```

5. **Start & enable**:
   ```bash
   systemctl restart coturn
   systemctl enable coturn
   ```

6. **Open firewall**:
   - DigitalOcean: add Firewall rules for **UDP 3478** and **TCP 3478**

7. **Test** (from your local machine):
   ```bash
   echo "test:test" | stunclient YOUR_DROPLET_IP 3478
   ```

---

### Option B: AWS / Linode / Vultr
Same steps, just different provider. Any $5-10/month VPS works.

---

## PART 3: Update App to Use Production URLs

### Update `src/context/AppContext.tsx`

Find the signaling server connection (search for `localhost`):

```typescript
// OLD (local):
const signalingUrl = 'http://localhost:3001';

// NEW (production):
const signalingUrl = process.env.REACT_APP_SIGNALING_URL || 'https://macrochat-signaling-prod.up.railway.app';
```

### Update `.env` or `app.json` (Expo config):

**For web (Expo web)**:
Create `.env.production`:
```
REACT_APP_SIGNALING_URL=https://your-signaling-server-url.com
REACT_APP_TURN_SERVERS=stun:your-turn-server-ip:3478
```

**For the app.json**:
```json
{
  "extra": {
    "signalingUrl": "https://your-signaling-server-url.com",
    "turnServers": [
      {
        "urls": ["stun:your-turn-server-ip:3478", "turn:your-turn-server-ip:3478"],
        "username": "turnuser",
        "credential": "your-strong-password"
      }
    ]
  }
}
```

---

## PART 4: Security Checklist

- [ ] **Signaling server**: JWT verification enabled (checks Supabase auth)
- [ ] **Signaling server**: `REQUIRE_CONVERSATION_MEMBERSHIP=true` (only members can call)
- [ ] **TURN server**: Strong password set (not "test:test")
- [ ] **TURN server**: Only UDP 3478 open (or TCP if needed), not all ports
- [ ] **App**: Uses HTTPS (not http) for signaling URLs
- [ ] **CORS**: Signaling server `ALLOWED_ORIGINS` includes your app domain

---

## PART 5: Test in Production

1. **Deploy app** to your hosting (Vercel for web, EAS for mobile)
2. **Point app** to production signaling + TURN URLs (via env vars)
3. **Test a call**:
   - Two different devices on different networks
   - Start call, audio should connect via TURN server
   - Check browser console for `connected to turn server`

---

## Rough Costs

| Component | Provider | Cost/Month |
|-----------|----------|-----------|
| Signaling Server | Railway free tier | $0 (up to 500 hrs/month) |
| TURN Server | DigitalOcean | $6 |
| App Hosting | Vercel free | $0 |
| **Total** | | **$6/month** |

---

## Troubleshooting

**Calls failing to connect?**
- Check signaling server is publicly accessible: `curl https://your-signaling-url`
- Check TURN firewall: `stunclient your-turn-ip 3478`
- Check browser console for "connection refused" errors

**JWT errors?**
- Make sure `SUPABASE_URL` is correct (matches your supabase project)
- Make sure user is logged in before calling

**TURN not being used?**
- Check `app.json` has TURN server config
- Restart app after env change
- Look for "added ICE candidate from TURN" in console

---

## Questions?

See `signaling-server/src/server.js` for detailed comments on auth flow.
