# Hana Chat SMTP Relay

The VPS deployment includes a lightweight Postfix relay container for transactional email.

- The app connects to `smtp-relay:587` on the private Docker network.
- The relay only accepts mail from private Docker networks and is bound to `127.0.0.1:1587` for VPS-local testing.
- Sender mail uses `no-reply@app.hanachat.site`.
- DKIM keys live outside the repo at `/opt/hana-chat/shared/opendkim-keys`.

Generate DKIM keys on the VPS:

```bash
cd /opt/hana-chat/current
set -a; . /opt/hana-chat/shared/.env.vps; set +a
pnpm mail:dkim app.hanachat.site mail /opt/hana-chat/shared/opendkim-keys
```

Then add the printed `mail._domainkey.app.hanachat.site` TXT record at the DNS provider.

If outbound port 25 is blocked by the VPS provider, set `SMTP_RELAY_UPSTREAM_HOST`,
`SMTP_RELAY_UPSTREAM_USERNAME`, and `SMTP_RELAY_UPSTREAM_PASSWORD` in `.env.vps` to relay through an
approved upstream SMTP provider while keeping the app wired to `smtp-relay`.
