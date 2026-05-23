#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-/opt/hana-chat/shared/.env.vps}"
MODE="${2:-webroot}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${VPS_PUBLIC_IP:?Set VPS_PUBLIC_IP in the VPS env file}"
: "${ACME_EMAIL:?Set ACME_EMAIL in the VPS env file}"

CERTBOT_IMAGE="${CERTBOT_IMAGE:-certbot/certbot:latest}"
CERTBOT_WEBROOT_PATH="${CERTBOT_WEBROOT_PATH:-/opt/hana-chat/shared/certbot-webroot}"
LETSENCRYPT_PATH="${LETSENCRYPT_PATH:-/opt/hana-chat/shared/letsencrypt}"

mkdir -p "$CERTBOT_WEBROOT_PATH" "$LETSENCRYPT_PATH"

if [ "$MODE" = "standalone" ]; then
  CHALLENGE_ARGS="--standalone"
  DOCKER_PORT_ARGS="-p 80:80"
else
  CHALLENGE_ARGS="--webroot --webroot-path /var/www/certbot"
  DOCKER_PORT_ARGS=""
fi

# IP-address certificates from Let's Encrypt use the short-lived profile and require frequent renewal.
# The command is intentionally idempotent: Certbot keeps the current cert until it is close to renewal.
docker run --rm \
  $DOCKER_PORT_ARGS \
  -v "$LETSENCRYPT_PATH:/etc/letsencrypt" \
  -v "$CERTBOT_WEBROOT_PATH:/var/www/certbot" \
  "$CERTBOT_IMAGE" certonly \
  --non-interactive \
  --agree-tos \
  --email "$ACME_EMAIL" \
  --preferred-profile shortlived \
  $CHALLENGE_ARGS \
  --ip-address "$VPS_PUBLIC_IP" \
  --keep-until-expiring

if docker ps --format '{{.Names}}' | grep -qx 'hana-chat-vps-caddy-1'; then
  docker exec hana-chat-vps-caddy-1 caddy reload --config /etc/caddy/Caddyfile || \
    docker kill -s HUP hana-chat-vps-caddy-1
fi
