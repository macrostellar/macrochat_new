# MacroChat Production Deployment Guide

## Android app bundle

The next Android update is version `4.0.1`, versionCode `18` (after uploaded
versionCode `17`). Keep `app.json` and `android/app/build.gradle` aligned.
Local release builds require `MACROCHAT_UPLOAD_STORE_FILE`,
`MACROCHAT_UPLOAD_STORE_PASSWORD`, `MACROCHAT_UPLOAD_KEY_ALIAS`, and
`MACROCHAT_UPLOAD_KEY_PASSWORD` in the build environment. Use the existing
registered upload keystore; release builds no longer use the debug key.
Keep keystores and passwords outside the repository. With the Android SDK and
production Supabase environment configured, run `./gradlew :app:bundleRelease`
from `android/`. The bundle is generated at
`android/app/build/outputs/bundle/release/app-release.aab`.

## iOS / TestFlight

The existing App Store app uses `com.rpp.macrochat.app`. Keep the Expo iOS
bundle identifier and both native target configurations aligned. The next local
upload is version `1.0.0`, build `4`; increase the build number for later uploads.
The native Info.plist reads the build number from `CURRENT_PROJECT_VERSION`.

From a fully downloaded local checkout:

```bash
npm ci
cd ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
open MacroChat.xcworkspace
```

Configure production `EXPO_PUBLIC_*` values locally before archiving; Xcode does
not automatically load the production environment in `eas.json`. Do not commit
local environment files. Confirm the signing team matches the existing app,
select Any iOS Device, and use Product > Archive > Distribute App > App Store
Connect. Select the processed upload in TestFlight.

### Required messaging configuration

1. Copy `.env.example` to `.env` in the project root.
2. Open the **same Supabase project used by the working web app**. In the
   Connect dialog / Project Settings > API, copy the Project URL to
   `EXPO_PUBLIC_SUPABASE_URL` and its publishable key (or legacy **anon** key) to
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Never use a secret or service-role key.
   The deployed web host's environment settings are another source for these
   existing values.
3. Copy the working production signaling URL to `EXPO_PUBLIC_SIGNALING_URL`
   for calls. TURN settings must also match the working deployment.
4. Release builds now reject missing or malformed Supabase settings, including
   masked placeholder keys. Confirm the URL and key belong to the same project;
   validation cannot verify connectivity or the live database schema.
5. To preview sample chats/approvals locally, leave both Supabase values blank
   and explicitly set `EXPO_PUBLIC_DEMO_MODE=true`. This is development-only.
   Demo identities use separate storage and are not real, recoverable accounts.

Online startup verifies the account profile in Supabase before publishing
encryption keys. A newly authenticated user must finish profile registration
first; authentication alone does not create a MacroChat profile.

The previous unconfigured build generated local-only Macro IDs and marked local
messages sent without contacting a server. Those IDs/messages were not uploaded
and cannot be delivered retroactively. After installing the configured build,
create a real online identity (or recover an existing online account), exchange
the new IDs, and resend the messages.

Before sharing the next build, test two independent online accounts on two
devices: verify each display name, send a new Macro ID chat both ways, restart
both apps and confirm history, resume after backgrounding, test media and an
approval group/request/decision, and test against the web app. Only mark a send
successful after a server confirmation. A successful archive/upload alone does
not establish message delivery or feature parity.

### iOS delivery and background notifications

The mobile reliability update isolates draft typing from the message list,
uses native-driven ambient animation, avoids rebuilding chat state when nothing
expires, refreshes read receipts while a conversation is focused, and polls
messages/receipts every three seconds while active as a realtime fallback.
Reconnection also reloads history. This does not guarantee a network delivery
time; measure on physical devices before releasing.

New media must upload successfully to private storage before sending. Device-local
paths and failed uploads are never saved as delivered attachments. Signed URLs
are refreshed from storage paths (every four minutes while active and on resume).
Old attachments saved as another device's local file cannot be recovered by
changing the receiver; the sender must resend them.

For locked-screen notifications, complete all of these steps:

1. Run `notification-preferences-migration.sql`, `push-notifications-migration.sql`,
   and `mobile-delivery-migration.sql` in the Supabase SQL Editor.
2. Set `PUSH_WEBHOOK_SECRET` in Edge Function secrets. In Supabase Vault create
   `macrochat_push_webhook_secret` with the exact same value and
   `macrochat_push_function_url` with the project's `/functions/v1/send-push` URL.
   Never place this secret in `.env`, `EXPO_PUBLIC_*`, or committed SQL.
3. Deploy `supabase functions deploy send-push --project-ref pofbkteiymgiwciamyll --no-verify-jwt`.
   The endpoint authenticates database requests with the webhook secret instead
   of a user JWT. It rejects missing configuration and verifies the saved message.
4. In Apple Developer, enable **Push Notifications** for `com.rpp.macrochat.app`.
   Regenerate/download the App Store provisioning profile after enabling it.
   The Release target's `APS_ENVIRONMENT` must be `production`; Debug uses
   `development`. Existing archives without the entitlement cannot receive APNs.
5. Run `eas credentials --platform ios` for this Expo project and configure a valid
   Apple Push Notifications key for the same signing team and bundle identifier.
   Keep Apple keys private and do not commit them.
6. Archive/upload a new iOS build, launch it on a physical iPhone, sign in, and
   allow notifications. Confirm `user_push_tokens` has an iOS token for that
   account. Registration errors are now shown rather than silently ignored.
7. Lock/background the phone and send from another account. Check Edge Function
   logs and Expo push **receipts** using the logged ticket IDs; accepted tickets
   alone do not prove APNs delivery. Check iOS Settings > Notifications > MacroChat
   for allowed Lock Screen alerts and Badges, and disable Focus for the test.
8. Read all chats and confirm the icon badge returns to zero. Test read receipts
   with both accounts' read-receipt settings enabled.

Notifications contain sender metadata and a generic message/attachment label,
not decrypted message text. Remote push alerts work independently of the app's
foreground realtime connection; iOS is not expected to keep a background socket
alive. Do not expect background JavaScript execution after force-quitting.

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
