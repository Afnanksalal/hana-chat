# Email Auth and Admin Access

This document explains the production auth posture for Hana Chat.

## Public Auth Model

Hana uses passwordless email auth:

- Signup asks for username and email.
- Signin asks for email.
- The API sends a short-lived numeric verification code through SMTP/Nodemailer.
- The configured owner email can use a static numeric code from env for break-glass admin access.
- The verification code is HMAC-hashed at rest, expires quickly, and is rate-limited by email, IP,
  and device.
- Email addresses are normalized, HMAC-hashed for lookup, and encrypted separately for support and
  delivery records.
- Google/OAuth and password login are not part of the public auth flow.

Browser clients cannot expose a trustworthy MAC address. The strict one-account controls therefore
use a server-observed IP hash plus an app-generated device id hash:

```bash
AUTH_ONE_ACCOUNT_PER_IP=true
AUTH_ONE_ACCOUNT_PER_DEVICE=true
```

These controls are intentionally strict for launch and can block shared networks. Treat support
appeal/recovery as an operational requirement before wide release.

## SMTP Setup

The VPS deployment runs a lightweight internal Postfix relay container. The app sends to the relay
over the private Docker network:

```bash
SMTP_HOST=smtp-relay
SMTP_PORT=587
SMTP_SECURE=false
SMTP_IGNORE_TLS=true
SMTP_TLS_REJECT_UNAUTHORIZED=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Hana Chat <no-reply@app.hanachat.site>
SMTP_POOL_MAX_CONNECTIONS=3
SMTP_POOL_MAX_MESSAGES=100
SMTP_RELAY_HOSTNAME=mail.app.hanachat.site
SMTP_RELAY_ALLOWED_SENDER_DOMAINS=app.hanachat.site
MAIL_DKIM_KEYS_DIR=/opt/hana-chat/shared/opendkim-keys
```

The relay binds to `127.0.0.1:1587` for VPS-local testing and is not exposed as a public open relay.
`SMTP_IGNORE_TLS=true` is intentional for the private Docker-network hop from the app to the local
relay. If the app is pointed directly at an internet SMTP provider instead, leave
`SMTP_IGNORE_TLS=false` and only set `SMTP_TLS_REJECT_UNAUTHORIZED=false` for a trusted private
relay with a self-signed certificate.

If the VPS provider blocks outbound port 25, set `SMTP_RELAY_UPSTREAM_HOST`,
`SMTP_RELAY_UPSTREAM_USERNAME`, and `SMTP_RELAY_UPSTREAM_PASSWORD` to use an approved upstream SMTP
relay while keeping the app configured to `smtp-relay`.

Production fails closed if SMTP delivery is not configured. Local development may return the
verification code in the API response for test harnesses.

Generate DKIM material on the VPS:

```bash
pnpm mail:dkim app.hanachat.site mail /opt/hana-chat/shared/opendkim-keys
```

Required sender DNS for direct VPS delivery:

- `A mail.app.hanachat.site -> 18.61.174.6`
- `TXT app.hanachat.site -> "v=spf1 ip4:18.61.174.6 -all"`
- `TXT mail._domainkey.app.hanachat.site ->` the value printed by `pnpm mail:dkim`
- `TXT _dmarc.app.hanachat.site -> "v=DMARC1; p=none; adkim=s; aspf=s"`

Also set the VPS provider reverse DNS/PTR for `18.61.174.6` to `mail.app.hanachat.site`. PTR is set
at the VPS/cloud provider, not in the domain DNS zone. Move DMARC from `p=none` to `quarantine` or
`reject` after delivery is stable.

## Admin Access Model

Admin access is server-side only:

- A user must have a valid `identity.sessions` row.
- The session token must pass HMAC verification and match the stored token hash.
- Admin APIs call `requireAdmin`, which requires `identity.user_roles.role = admin`.
- The app sidebar/mobile nav only shows the Admin item when `/v1/dashboard` returns the admin role.
- Frontend hiding is only UX. Backend role checks are the security boundary.

The owner/admin bootstrap is controlled by env:

```bash
ADMIN_EMAIL=owner@example.com
ADMIN_STATIC_OTP=123456
```

When `ADMIN_EMAIL` signs in, the API keeps the normal email/code workflow, grants the admin role,
enables the owner defaults, and uses `ADMIN_STATIC_OTP` instead of sending an SMTP message when the
static code is configured. The static code is a live secret and must stay in private env only.
