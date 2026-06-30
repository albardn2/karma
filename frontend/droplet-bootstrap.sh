#!/usr/bin/env bash
#
# One-time prep for a frontend droplet (Ubuntu, run as root) so the
# CI/CD deploy workflows can ship to it.
#
#   - installs Docker Engine + the `docker compose` v2 plugin
#   - creates /root/app/frontend (where the workflow scps the compose + Caddyfile)
#   - opens ports 22/80/443 (Caddy handles TLS itself — no certbot needed)
#   - adds a 2G swap file on tiny droplets
#
# Usage (on the droplet):
#   bash droplet-bootstrap.sh
#
set -euo pipefail

echo "==> Updating apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

echo "==> Installing Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi
systemctl enable --now docker

# get.docker.com ships the compose plugin; install it explicitly as a fallback.
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

echo "==> Docker versions:"
docker --version
docker compose version

echo "==> Creating app directory"
mkdir -p /root/app/frontend

echo "==> Configuring firewall (ufw)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp    # SSH
  ufw allow 80/tcp    # HTTP (ACME challenge + redirect)
  ufw allow 443/tcp   # HTTPS
  ufw --force enable
  ufw status verbose || true
else
  echo "    ufw not present; skipping (ensure 22/80/443 are open another way)"
fi

echo "==> Ensuring swap exists (helps on 1GB droplets)"
if [[ "$(free -m | awk '/^Swap:/ {print $2}')" -eq 0 ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    added 2G swap"
else
  echo "    swap already present"
fi

echo "==> Done. Droplet is ready for the frontend deploy workflow."
echo "    Reminder: point the crm-* DNS A record at this droplet BEFORE the first"
echo "    deploy, so Caddy can complete the TLS certificate challenge."
