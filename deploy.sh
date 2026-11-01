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

# Migrate the old host configuration before Compose creates an empty new mount.
if [ ! -e /root/.audit-studio ] && [ -d /root/.pi/agent ]; then
  cp -a /root/.pi/agent /root/.audit-studio
fi
chown -R 1001:1001 /root/.audit-studio /root/sessions 2>/dev/null || true

# 部署前备份当前运行镜像用于回滚
if docker image inspect audit-studio:latest >/dev/null 2>&1; then
  BACKUP_TAG="audit-studio:backup-$(date +%Y%m%d-%H%M%S)"
  echo "==> 备份当前镜像为: ${BACKUP_TAG} 及 audit-studio:rollback-current"
  docker tag audit-studio:latest "${BACKUP_TAG}" || true
  docker tag audit-studio:latest audit-studio:rollback-current || true
fi

echo "==> 构建最新镜像..."
docker compose build

echo "==> 移除旧版本 8286 端口容器..."
# 处理掉旧版：移除所有发布 8286 端口的旧容器（含旧镜像部署的同名容器），
# 避免与新容器产生名称或端口冲突。数据卷在宿主机 /root/.audit-studio、/root/sessions，不受影响。
docker ps --filter publish=8286 -q | xargs -r docker rm -f

echo "==> 启动新容器..."
docker compose up -d --remove-orphans

echo "==> 验证 8286 端口服务可用性..."
for i in {1..20}; do
  if curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:8286/ | grep -q "200\|304"; then
    echo "==> 部署成功！服务正常响应 (HTTP 200)。"
    docker compose ps
    exit 0
  fi
  sleep 1
done

echo "警告: 容器已启动，但在等待时间内未返回 200，请检查日志: docker logs audit-studio"
echo "如需回滚，请执行: ./rollback.sh"
docker compose ps

