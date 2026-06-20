#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if systemctl is-active --quiet pi-web 2>/dev/null; then
  systemctl stop pi-web
  systemctl disable pi-web
  rm -f /etc/systemd/system/pi-web.service
  systemctl daemon-reload
fi

if ss -tlnp | grep -q ':8286'; then
  fuser -k 8286/tcp 2>/dev/null || true
  sleep 1
fi

chown -R 1001:1001 /root/.pi /root/sessions 2>/dev/null || true

docker compose build
docker compose up -d --remove-orphans
docker compose ps
