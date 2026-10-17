#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

TARGET_IMAGE="${1:-audit-studio:rollback-current}"

echo "==> 准备回滚到镜像: ${TARGET_IMAGE}..."

if ! docker image inspect "${TARGET_IMAGE}" >/dev/null 2>&1; then
  echo "错误: 镜像 ${TARGET_IMAGE} 不存在！可用备份镜像列表："
  docker images --filter "reference=audit-studio:*"
  exit 1
fi

echo "==> 停止并移除当前 8286 端口容器..."
docker ps --filter publish=8286 -q | xargs -r docker rm -f

echo "==> 将 ${TARGET_IMAGE} 重新标记为 audit-studio:latest..."
docker tag "${TARGET_IMAGE}" audit-studio:latest

echo "==> 启动回滚容器..."
docker compose up -d --remove-orphans

echo "==> 等待服务启动并验证健康状态..."
for i in {1..15}; do
  if curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:8286/ | grep -q "200\|304"; then
    echo "==> 回滚成功！服务已恢复并在 8286 端口正常响应。"
    docker compose ps
    exit 0
  fi
  sleep 1
done

echo "警告: 回滚容器已启动，但端口未能及时返回 200，请检查日志: docker logs audit-studio"
docker compose ps
exit 1
