# Production VPS Status Audit

Date: 2026-06-18
Host: `18.61.174.6`
Domains: `hanachat.site`, `app.hanachat.site`, `api.hanachat.site`

## Executive Summary

Hana is online and the main app stack is healthy, but production is not launch-clean yet.

The biggest blocker is passwordless email for normal users. The VPS has an SMTP relay container and
DKIM material, but a live non-admin auth-start probe failed with HTTP 500. The relay logs show the
API connected and then dropped during STARTTLS, and outbound port 25 from the VPS timed out. The
configured admin account was verified through the legacy admin bypass code available at the time of
the audit.

In plain terms: admin login works, normal user email delivery is not proven and is currently broken.

## Current Runtime State

### Healthy

- Public web routes respond:
  - `https://hanachat.site/` -> `200`
  - `https://app.hanachat.site/` -> `200`
  - `https://app.hanachat.site/app` -> redirects to `/auth?next=%2Fapp` for unauthenticated users
  - `https://api.hanachat.site/health` -> `200`, `api-gateway` reports `ok`
- SEO/PWA routes respond:
  - `robots.txt`
  - `sitemap.xml`
  - `llms.txt`
  - `/.well-known/assetlinks.json`
  - Android APK download at `/downloads/hana-chat-twa.apk`
- All main Docker services are running and reported healthy where healthchecks exist:
  - `web`
  - `api-gateway`
  - `identity-service`
  - `risk-service`
  - `chat-orchestrator`
  - `memory-service`
  - `retrieval-service`
  - `graph-service`
  - `moderation-service`
  - `billing-service`
  - `creator-service`
  - `notification-service`
  - `batch-orchestrator`
  - `worker-service`
  - `postgres`
  - `redis`
  - `qdrant`
  - `neo4j`
  - `redpanda`
  - `clickhouse`
  - `smtp-relay`
- Current deployed release:
  - `/opt/hana-chat/releases/20260617-master-81a59c8`
  - `.agents`, `.codex`, and root `.env` are not present in the deployed release.
- GitHub `master` CI is green for the newer docs commit:
  - `56395ce1a5e2fbd1f7f34caa992a331febafd5c2`

### Needs Attention

- VPS deployed release is behind the current GitHub `master` by the docs-only 0G strategy commit.
  Runtime code is effectively unchanged, but deploy metadata is not at the newest commit.
- Disk usage is high:
  - `/` is at about `84%`
  - `17G` free on a `96G` root volume
  - Docker build cache, old images, old releases, and logs need a cleanup policy before repeated
    production deploys.
- Memory pressure is acceptable but not roomy:
  - `15Gi` RAM
  - about `9.7Gi` used
  - about `5.6Gi` available
  - swap exists and is being used

## Email/Auth Audit

### What Is Configured

Production env has:

- `ADMIN_EMAIL=mr.goblin007a@gmail.com`
- a legacy admin bypass code was present at the time of this audit
- `SMTP_HOST=smtp-relay`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_FROM=Hana Chat <no-reply@app.hanachat.site>`
- `SMTP_RELAY_HOSTNAME=mail.app.hanachat.site`
- `SMTP_RELAY_ALLOWED_SENDER_DOMAINS=app.hanachat.site`
- `MAIL_DKIM_KEYS_DIR=/opt/hana-chat/shared/opendkim-keys`
- `AUTH_ONE_ACCOUNT_PER_IP=true`
- `AUTH_ONE_ACCOUNT_PER_DEVICE=true`

DKIM files exist on the VPS:

- `/opt/hana-chat/shared/opendkim-keys/app.hanachat.site.private`
- `/opt/hana-chat/shared/opendkim-keys/app.hanachat.site.txt`

DNS records exist:

- `app.hanachat.site TXT "v=spf1 ip4:18.61.174.6 -all"`
- `mail._domainkey.app.hanachat.site TXT "v=DKIM1; ..."`
- `_dmarc.app.hanachat.site TXT "v=DMARC1; p=none; adkim=s; aspf=s"`
- `mail.app.hanachat.site A 18.61.174.6`

### What Is Broken

Normal SMTP auth is broken right now.

Evidence:

- Controlled non-admin signup probe to a Gmail plus-address returned HTTP `500`.
- API-to-relay connection reached Postfix.
- Relay log showed:
  - `connect from hana-chat-vps-api-gateway-1`
  - `SSL_accept error`
  - `lost connection after STARTTLS`
- No mail was queued.
- Production DB currently has `123` email verification rows and all are `provider=local`; there are
  `0` `provider=smtp` verification rows.
- Outbound port 25 test from the VPS timed out:
  - `aspmx.l.google.com:25` -> blocked or timeout
- Outbound port 587 test from the VPS worked:
  - `smtp.gmail.com:587` -> open

Root causes:

1. App-to-relay TLS mismatch:
   - Postfix advertises STARTTLS with a self-signed `CN=localhost` certificate.
   - Nodemailer attempts STARTTLS opportunistically and drops the connection when the certificate is
     not trusted.
   - The app has no current `SMTP_IGNORE_TLS` or `SMTP_TLS_REJECT_UNAUTHORIZED=false` config.
2. Relay-to-internet direct delivery is blocked:
   - Outbound port 25 is not usable from the VPS.
   - `SMTP_RELAY_UPSTREAM_HOST` is missing.

### Legacy Admin Bypass Status

The legacy admin bypass worked and admin APIs were reachable.

Verified:

- Admin signin with configured admin email and the legacy bypass succeeds.
- `/v1/dashboard` returns the admin role.
- `/v1/admin/analytics?rangeDays=30` responds with real admin analytics keys.

Risk:

- This is a break-glass path, not a healthy public auth path.
- It bypasses SMTP and can hide the fact that normal users cannot receive codes.
- There are many active sessions in the database, so stale session cleanup/revocation should be part
  of the hardening pass.

### Email/Auth Fix List

Priority order:

1. Add explicit SMTP TLS controls to app config.
   - Suggested envs:
     - `SMTP_IGNORE_TLS=true` for private Docker relay mode, or
     - `SMTP_TLS_REJECT_UNAUTHORIZED=false` only for the internal relay, not internet SMTP.
   - Wire these into `nodemailer.createTransport`.
   - Implemented on June 19, 2026. The VPS should use `SMTP_IGNORE_TLS=true` while the app sends to
     the private `smtp-relay` container.
2. Configure an upstream SMTP relay on port 587.
   - Set:
     - `SMTP_RELAY_UPSTREAM_HOST`
     - `SMTP_RELAY_UPSTREAM_USERNAME`
     - `SMTP_RELAY_UPSTREAM_PASSWORD`
   - Keep the app pointed at `smtp-relay`.
3. Decide direct mail vs upstream mail.
   - Direct mail currently needs outbound port 25 unblocked.
   - Direct mail also needs PTR/rDNS aligned to `mail.app.hanachat.site`.
   - If AWS will not set PTR without Elastic IP, use upstream SMTP and stop fighting direct delivery.
4. Add a production email smoke test that uses a real non-admin test inbox.
   - It must fail if DB row `provider != smtp`.
   - It must fail if Postfix queues or rejects the message.
5. Remove the legacy admin bypass path and keep admin sign-in on normal email OTP delivery.

## DNS and Mail Reputation

Good:

- `hanachat.site`, `www.hanachat.site`, `app.hanachat.site`, `api.hanachat.site`, and
  `mail.app.hanachat.site` resolve to `18.61.174.6`.
- SPF, DKIM, and DMARC records exist for `app.hanachat.site`.

Pending:

- Reverse DNS/PTR for `18.61.174.6` still resolves to the AWS EC2 hostname:
  - `ec2-18-61-174-6.ap-south-2.compute.amazonaws.com`
- It does not resolve to `mail.app.hanachat.site`.
- DMARC is still `p=none`.

Operational note:

If this remains a non-Elastic EC2 public IP, custom rDNS may not be available or stable. For mail
reputation, either move to an Elastic IP with AWS rDNS configured or use an upstream SMTP provider
over port 587.

## Product Data Snapshot

Production DB counts during audit:

- Users: `8`
- Active users: `8`
- Admin roles: `1`
- Email credentials: `7`
- Email verifications: `123`
- Email verifications in last 24h: `0`
- Account IP claims: `0`
- Account device claims: `0`
- Active sessions: `132`
- Characters: `20`
- Public approved characters: `20`
- Pending character reviews: `0`
- Conversations: `199`
- Messages: `1166`
- Messages in last 24h: `0`
- Memory facts: `205`
- Active memory facts: `139`
- Conversation evolution rows: `143`
- Model calls: `603`
- Model calls in last 24h: `0`
- Character purchases: `0`
- Paid character purchases: `0`
- Creator wallets: `2`
- Creator payout profiles: `0`
- Creator payouts: `0`

Character rating breakdown:

- Adult: `6`
- Mature: `2`
- Teen: `7`
- General: `5`

Interpretation:

- Marketplace data is real and populated.
- Memory/evolution data is real and populated.
- No current 24h product activity was observed during the audit window.
- Adult/NSFW characters exist and are public approved, so dashboard/discovery surfaces should include
  them wherever the admin view is meant to show all characters.
- No paid purchase/payout flow has been exercised in production.

## Queue and Worker Status

Outbox status:

- `published`: `1724`
- No pending, failed, or dead-letter rows were observed in the audit query.

This is good. It means worker projection is currently caught up.

Watch item:

- The status name `published` is used as the completed state. Admin/reporting copy should avoid
  calling `published` "open" or "pending."

## Monetization Status

Current:

- `MONETIZATION_ENABLED=false`
- Public paid plans and creator monetization should stay "coming soon."
- Razorpay and RazorpayX env values are present even though monetization is disabled.
- 0G strategy document exists, but no 0G runtime integration exists yet.

Pending:

- Decide final provider path:
  - crypto/0G settlement,
  - adult-friendly card processor,
  - or both.
- Remove or rotate Razorpay credentials if they are no longer intended.
- Update CSP/permissions once Razorpay is no longer the target provider.
- Add crypto payment schemas/contracts only after the provider decision.

## Memory and Chat Status

Current:

- Memory facts and conversation evolution rows exist in production.
- The documented architecture says memory is exact-scoped by user, character, and conversation.
- Qdrant, Neo4j, worker-service, graph-service, retrieval-service, and memory-service are healthy.

Pending:

- Add regression smoke that proves a fresh chat turn retrieves exact-scoped memory and does not bleed
  across rooms.
- Add production-safe harness mode that can run against a test character without polluting real user
  data.
- Add admin observability for "last memory write", "last graph projection", and "last Qdrant upsert"
  per environment.
- 0G memory snapshots are design-only at this point. No decentralized memory bridge is implemented.

## Security and Ops Findings

High priority:

- Normal email auth is broken for non-admin users.
- Static admin OTP is active in production.
- Direct outbound mail on port 25 is blocked.
- PTR/rDNS is not aligned for direct mail.
- Disk usage is high at roughly `84%`.

Medium priority:

- Active sessions count is high for an early production environment.
- Razorpay credentials are present while monetization is disabled.
- DMARC is still in monitor mode (`p=none`).
- No production email smoke test exists for a real SMTP path.
- No automated disk/cache cleanup policy is documented or scheduled.

Low priority:

- VPS is one docs-only commit behind current GitHub `master`.
- `XAI_IMAGE_MODEL` is not explicitly set in env, so the app uses the config default.
- Temporal has no Docker healthcheck even though the container is up.

## Recommended Next Sprint

### P0: Make Normal Email Work

1. Add `SMTP_IGNORE_TLS` or equivalent app config and wire it into Nodemailer.
2. Configure upstream SMTP over port 587, or complete AWS outbound 25 + PTR setup.
3. Redeploy.
4. Run a non-admin signup probe and confirm:
   - API returns `200`
   - DB stores `provider=smtp`
   - relay logs queue and hand off the message
   - test inbox receives the code

### P1: Reduce Break-Glass Risk

1. Keep admin sign-in on normal email OTP delivery.
2. Revoke stale sessions or shorten session lifetime until public launch.

### P1: Clean VPS Capacity

1. Prune old Docker build cache and dangling images.
2. Keep only the last few `/opt/hana-chat/releases/*`.
3. Add a safe disk-report command to deployment verification.
4. Add log rotation checks for Docker/Caddy/Postfix.

### P2: Monetization Path

1. Keep `MONETIZATION_ENABLED=false`.
2. Decide whether Razorpay credentials should remain on the VPS.
3. Start 0G as a design spike only; do not wire payments before contract/custody/compliance review.

### P2: Product Health Harness

1. Add a production-safe smoke suite for:
   - non-admin email auth,
   - marketplace discovery,
   - memory retrieval,
   - chat turn persistence,
   - image generation,
   - admin analytics.
2. Make it use dedicated test accounts and clean up after itself.

## Bottom Line

Hana is online, the app stack is healthy, the marketplace/memory data is real, and admin access works.
But public auth is not production-ready because normal SMTP delivery is currently broken. Fix email
first, then clean up disk/session/monetization posture before treating the VPS as launch-grade.
