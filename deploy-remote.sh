#!/usr/bin/env bash
set -euo pipefail

# 一键远程部署：同步本仓库到目标机后，在远端执行 docker compose 构建启动。
# 仓库已独立（dsh CLI 走 npm 包），只需同步本仓库。

REMOTE="${REMOTE:-root@10.168.1.223}"
DEPLOY="${DEPLOY:-/opt/audit-studio/app}"
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Sync audit-studio repo..."
rsync -az --delete \
  --exclude=node_modules --exclude=.next --exclude=.git --exclude='._*' \
  "$LOCAL_ROOT/" "$REMOTE:$DEPLOY/"

echo "==> Deploy on server..."
ssh "$REMOTE" "cd $DEPLOY && chmod +x deploy.sh docker-entrypoint.sh && bash deploy.sh"

echo "==> Verify..."
ssh "$REMOTE" "curl -s -o /dev/null -w 'HTTP %{http_code}\n' --max-time 15 http://127.0.0.1:8286/"
