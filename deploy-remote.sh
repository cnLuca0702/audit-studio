#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-root@10.168.1.223}"
DEPLOY="${DEPLOY:-/opt/audit-studio}"
LOCAL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> Sync pi-mono..."
rsync -az --delete \
  --exclude=node_modules --exclude=.git --exclude='._*' \
  "$LOCAL_ROOT/pi-mono/" "$REMOTE:$DEPLOY/pi-mono/"

echo "==> Sync AuditStudio..."
rsync -az --delete \
  --exclude=node_modules --exclude=.next --exclude=.git --exclude='._*' \
  "$LOCAL_ROOT/projects/AuditStudio/" "$REMOTE:$DEPLOY/projects/AuditStudio/"

echo "==> Deploy on server..."
ssh "$REMOTE" "cd $DEPLOY/projects/AuditStudio && chmod +x deploy.sh && bash deploy.sh"

echo "==> Verify..."
ssh "$REMOTE" "curl -s -o /dev/null -w 'HTTP %{http_code}\n' --max-time 15 http://127.0.0.1:8286/"
