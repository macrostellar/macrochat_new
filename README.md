# MacroChat

A dark, mobile-first private messaging MVP built with Expo Router, React Native, TypeScript, and optional Supabase.

## Included

- Anonymous onboarding with a generated public Macro ID—no email or phone field
- Secure on-device identity persistence
- Chat list, search, unread counts, online presence styling, groups, and demo conversations
- Fast optimistic text sending with delivery states, replies, and reactions UI
- New chats by Macro ID
- Updates, calls, people, profile, privacy, appearance, linked-device, and storage screens
- Attachment, voice-note, camera, video-call, and audio-call interface entry points
- Supabase anonymous authentication client, normalized SQL schema, indexes, RLS, Realtime, and private media storage policies
- Fully usable local demo mode when Supabase environment variables are absent

## Run with Expo Go

Requirements: Node.js 20 or 22 LTS, npm, and Expo Go on the phone.

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env` only when connecting Supabase.
3. Start with `npm start`.
4. Scan the QR code with Expo Go, or press `i` for the iOS Simulator / `a` for Android.

> Important: this workspace currently lives under a parent folder whose name contains a literal backslash (`Software\ Codes`). Node 25 cannot resolve Expo modules from that path. For reliable local launching, rename that parent folder to `Software Codes`, reopen the project in VS Code, and use Node 20 or 22 LTS.

## Connect Supabase

1. Create a Supabase project.
2. Enable **Authentication → Providers → Anonymous Sign-Ins**.
3. To use Google login, also enable **Authentication → Providers → Google** and add the app redirect URI `macrochat://auth/callback`.
4. Run `supabase/schema.sql` in the SQL editor. It creates only `macrochat_`-prefixed tables, indexes, and functions plus the private `macrochat-media` bucket, so unrelated existing tables are untouched.
5. Copy `.env.example` to `.env` and provide `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
6. Restart Expo and create a new identity.

### Account recovery providers

Anonymous Macro IDs remain the default and require no email or phone. To let users optionally restore the same ID on another device, configure Supabase Authentication:

- Email recovery: enable the Email provider and use an OTP email template containing `{{ .Token }}`.
- Phone recovery: enable the Phone provider and configure an SMS provider.
- Google recovery: enable Google, enable manual identity linking, and allow both `macrochat://auth/callback` and `https://chat.macrostellar.com/auth/callback` as redirect URLs.

For local OAuth testing, also add `http://localhost:8081/auth/callback` to the redirect allowlist. Under Authentication > Multi-Factor Authentication, enable TOTP enrollment before testing the 2FA page. The Phone provider remains unavailable until an SMS provider is configured.

Users connect these methods from **Settings > Account and recovery**. A Macro ID is public and is never accepted as the only account-recovery credential.

## In-app MFA and E2EE setup

After sign-in, open Settings and use:

1. Two-factor authentication: enroll TOTP and verify a 6-digit code.
2. Message encryption: set a passphrase to enable phase-1 E2EE.

Phase-1 E2EE stores ciphertext (`body_ciphertext`) and nonce (`body_nonce`) for outgoing messages while preserving current MVP compatibility.

For existing projects, run:

- `supabase/e2ee-phase1-migration.sql`
- `supabase/mfa-aal2-enforcement.sql`

Once MFA enforcement script is active, AAL2 sessions are required by RLS to access chat data.

## Privacy controls deployment

Read receipts, server-enforced contact blocking, and disappearing messages require the privacy migration and cleanup worker:

1. Run `supabase/privacy-controls-migration.sql` in the Supabase SQL Editor before deploying the updated app.
2. Authenticate and deploy the cleanup worker:
	- `supabase login`
	- `supabase functions deploy cleanup-expired-messages --project-ref pofbkteiymgiwciamyll --use-api`
3. In Supabase Vault, create `macrochat_project_url` and `macrochat_service_role_key`, then run `supabase/cleanup-expired-messages-cron.sql` in the SQL Editor. This schedules cleanup every five minutes. Never expose the service-role key in the app or web bundle.
4. Redeploy `signaling-server/` so blocked contacts are rejected before call invitations are relayed.
5. Build and upload the web app only after steps 1-4.

The database hides expired messages immediately. The scheduled worker permanently deletes expired message rows and removes queued files from the private `macrochat-media` bucket. Signed media URLs are limited to five minutes.

## Test with two users

Mobile (Expo Go):

1. Start with tunnel mode.
2. User 1 scans QR on phone A.
3. User 2 scans same QR on phone B.
4. Sign in with different accounts and test chat both directions.

Browser:

1. Open app in normal window.
2. Open same URL in Incognito or another browser profile.
3. Use a different account in each session.

## Easiest localhost sharing for browser tests

Use Cloudflare quick tunnel (no account needed):

1. Install `cloudflared`.
2. Run `cloudflared tunnel --url http://localhost:8081`.
3. Share the generated `https://*.trycloudflare.com` link.

That is the fastest way to let other people test your local web app in their browser.

## Deploy chat.macrostellar.com on SiteGround

Keep mobile and web in this Expo project. Shared authentication, Supabase messaging, encryption, types, and state stay in `src/`; web-only desktop presentation lives in `src/components/WebMessenger.tsx`. Split into a separate web app only if the web product later needs a fundamentally different framework or release team.

1. Set production `EXPO_PUBLIC_*` values in `.env`. Never add a Supabase service-role key.
2. Run `npm run build:web`.
3. In SiteGround, point `chat.macrostellar.com` to an empty document root.
4. Upload the **contents** of `dist/` to that document root, including the generated `.htaccess` file.
5. Enable SSL and force HTTPS in SiteGround.
6. Add `https://chat.macrostellar.com` and `https://chat.macrostellar.com/auth/callback` to Supabase Authentication redirect URLs.

Each release repeats steps 2 and 4. The `.htaccess` fallback allows direct links and browser refreshes on Expo Router routes.

## In-app call stack (self-hosted foundation)

This repo now includes a custom call-stack foundation:

- Signaling server: `signaling-server/`
- TURN config template: `infra/turn/turnserver.conf.example`
- App signaling client helper: `src/lib/calls.ts`
- Call history schema: `supabase/calls-schema.sql`

### Start signaling server

1. `cd signaling-server`
2. `cp .env.example .env`
3. Set `JWT_SECRET`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`
4. `npm install`
5. `npm start`

### Harden signaling for private calls

Use these production defaults in `signaling-server/.env`:

- `REQUIRE_CONVERSATION_MEMBERSHIP=true`
- `JWT_AUDIENCE=authenticated`
- `JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1`
- `ALLOWED_ORIGINS=https://your-app-domain.example`

What this enforces:

- only authenticated JWT users can connect,
- only users who are both members of the same conversation can initiate calls,
- only call participants can relay offer/answer/ICE/hangup events,
- basic rate-limits reduce signaling abuse.

Also ensure your app uses a TLS signaling URL in production:

- `EXPO_PUBLIC_SIGNALING_URL=https://signal.your-domain.example`

For WebRTC relay privacy, deploy TURN with TLS (`turns:`) using `infra/turn/turnserver.conf.example` and avoid open STUN-only operation in production networks.

### Enable call history persistence

Run `supabase/calls-schema.sql` in SQL editor.

### App configuration

Set in app `.env`:

- `EXPO_PUBLIC_SIGNALING_URL=http://localhost:4000` (or your deployed signaling URL)

### Important note

Current app still uses browser meeting links for immediate call actions while this self-hosted signaling stack is being integrated into full in-app WebRTC media flow. The included foundation is the required next step toward WhatsApp-style native calls.

### Enforce 2FA (AAL2) for chat data

1. In Supabase, enable MFA/TOTP under Authentication settings.
2. Run `supabase/mfa-aal2-enforcement.sql` in SQL editor.
3. After this, users must complete MFA (AAL2) before they can read/send messages under `macrochat_*` tables.

This enforcement happens at RLS policy level, so direct API access is blocked when a session is only AAL1.

The anon key is intended for clients; authorization is enforced by Row Level Security. Never put the service-role key in this app.

## Anonymous auth risk in shared projects

Enabling Anonymous Sign-Ins does not automatically expose all your data, but every anonymous session gets the `authenticated` role. That means any existing policy in your project that allows broad access to `authenticated` also applies to anonymous users.

MacroChat resources are namespaced (`macrochat_*`) and include strict membership-based RLS. For the rest of your shared project, run `supabase/security-audit.sql` and review any non-MacroChat policies that grant broad `authenticated` or `public` access.

## Privacy and production notes

Supabase anonymous auth creates a random auth UUID and MacroChat creates a separate shareable Macro ID. Removing app data can permanently lose an anonymous identity unless a recovery mechanism is added. Signal traditionally requires a phone number for registration; MacroChat intentionally uses a different anonymous-ID model.

This repository is an MVP, not yet a production-equivalent replacement for a mature messenger. The UI marks the encryption flow as designed for end-to-end encryption, but production E2EE still requires an audited protocol implementation, device key management, safety-number verification, encrypted attachments, multi-device session handling, abuse prevention, push notifications, and security review. Calls, media upload, stories, and voice recording currently expose polished interface entry points and require their production transport services.

Current state summary:

- Transport security: HTTPS/TLS via Supabase APIs.
- At-rest protection: Supabase managed storage/database encryption.
- End-to-end encryption: not yet implemented in this MVP.
- Database-enforced 2FA: available with `supabase/mfa-aal2-enforcement.sql`.

## Validation

- `npm run typecheck`
- `npm run lint`
