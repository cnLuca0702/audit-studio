# Audit Studio 部署指南

本文档记录 Audit Studio 在服务器 `10.168.1.223:8286` 上的 Docker 部署流程，以及实际踩坑后的成功经验与错误经验。

---

## 1. 架构概览

```
浏览器
  → http://10.168.1.223:8286
  → Docker 容器 audit-studio（Next.js standalone）
  → 读写 ~/.pi/agent/（模型、设置、技能、历史等）
  → 读写 ~/sessions/（会话文件）
```

| 项目 | 说明 |
|------|------|
| 应用 | Audit Studio（Next.js 16 + pi-coding-agent） |
| 部署方式 | Docker Compose |
| 服务器路径 | `/opt/audit-studio/` |
| 容器名 | `audit-studio` |
| 端口 | `8286` |
| 配置目录（宿主机） | `/root/.pi` |
| 会话目录（宿主机） | `/root/sessions` |
| 容器内用户 | `nextjs`（uid 1001） |
| 容器内配置路径 | `/home/nextjs/.pi` |

**代码仓库**

- GitHub：https://github.com/cnLuca0702/audit-studio
- 本目录为独立 Git 仓库，**不要**再推送到 `agegr/pi-web`
- 日常提交：`./push.sh "提交说明"` 或 `git push origin main`

**依赖关系**

- 构建上下文为 **AIAgent 仓库根目录**（需同时包含 `pi-mono` 与 `projects/AuditStudio`）
- 运行时通过 `file:` 依赖加载 `pi-mono/packages/*`

---

## 2. 前置条件

### 本地开发机

- Node.js 22+（本地调试）
- Docker Desktop 或 Docker CLI（可选，用于本地验证镜像）
- SSH 免密登录服务器：`ssh root@10.168.1.223`

### 服务器

- Docker + Docker Compose
- 内网可达 `10.168.1.223`
- 8286 端口未被其他进程占用

### 仓库结构

```
AIAgent/
├── pi-mono/                    # pi SDK 源码（必须）
└── projects/
    └── AuditStudio/            # 本应用
        ├── Dockerfile
        ├── docker-compose.yml
        ├── docker-entrypoint.sh
        ├── deploy.sh           # 在服务器上执行
        └── deploy-remote.sh    # 从本机一键部署
```

---

## 3. 快速部署（推荐）

### 3.1 一键从本机部署

```bash
/Users/yaban/Documents/AIAgent/projects/AuditStudio/deploy-remote.sh
```

脚本会：

1. `rsync` 同步 `pi-mono` 到 `/opt/audit-studio/pi-mono/`
2. `rsync` 同步 `AuditStudio` 到 `/opt/audit-studio/projects/AuditStudio/`
3. SSH 到服务器执行 `deploy.sh`（构建镜像、启动容器）
4. 校验 `http://127.0.0.1:8286` 返回 HTTP 200

可通过环境变量覆盖目标：

```bash
REMOTE=root@10.168.1.223 DEPLOY=/opt/audit-studio ./deploy-remote.sh
```

### 3.2 在服务器上手动部署

```bash
ssh root@10.168.1.223
cd /opt/audit-studio/projects/AuditStudio
bash deploy.sh
```

### 3.3 验证

```bash
# 容器状态
docker ps --filter name=audit-studio

# 本机访问
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8286/

# 外网/内网访问
# http://10.168.1.223:8286
```

---

## 4. 部署文件说明

| 文件 | 作用 |
|------|------|
| `Dockerfile` | 多阶段构建：安装 pi-mono → 构建 Next standalone → 运行镜像 |
| `docker-compose.yml` | 端口映射、卷挂载、平台 `linux/amd64` |
| `docker-entrypoint.sh` | 启动前修复挂载目录权限，再以 `nextjs` 运行 |
| `deploy.sh` | 停掉旧 systemd 服务、释放 8286、构建并启动容器 |
| `deploy-remote.sh` | 本机同步代码 + 触发服务器 `deploy.sh` |
| `.dockerignore` | 排除 `node_modules`、`.next` 等（注意：构建上下文根目录在仓库根，见下文） |

### 数据持久化

`docker-compose.yml` 挂载：

```yaml
volumes:
  - /root/.pi:/home/nextjs/.pi
  - /root/sessions:/home/nextjs/sessions
```

以下功能都依赖 `/root/.pi`：

- `models.json` / `settings.json`（设置里保存模型、默认模型、系统提示词、搜索 Key）
- `auth.json`（API Key）
- `agent/data/`（应用历史、招投标知识库等）
- `agent/skills/`（技能与参考文档）

**更新应用不会清空上述数据**，除非手动删除宿主机目录。

---

## 5. 本地开发

```bash
cd projects/AuditStudio
npm run dev
# http://localhost:8286
```

本地开发配置默认写在本机 `~/.pi/agent/`，与服务器 `/root/.pi` 相互独立。

---

## 6. 运维命令

```bash
# 查看日志
docker logs audit-studio --tail 100 -f

# 重启
cd /opt/audit-studio/projects/AuditStudio && docker compose restart

# 停止
docker compose down

# 重新构建（无缓存）
docker compose build --no-cache && docker compose up -d --force-recreate

# 进入容器（调试）
docker exec -it audit-studio sh
```

### 从 systemd 迁移到 Docker 后

旧部署使用 `pi-web.service` + `/opt/pi-deploy/pi-web-v2/`。迁移后应：

```bash
systemctl stop pi-web
systemctl disable pi-web
rm -f /etc/systemd/system/pi-web.service
systemctl daemon-reload
```

**不要**与 Docker 同时占用 8286。

---

## 7. 成功经验

### 7.1 用 Docker + 卷挂载替代直接跑 Node

- 旧方式：`systemctl` 跑 `node server.js`，升级需手动同步 standalone 产物，易漏文件。
- 现方式：镜像内自带运行时与依赖，升级 = 重新 `docker compose build` + `up`。
- `~/.pi` 挂到宿主机，模型与设置与 pi CLI 共用，换部署方式不丢配置。

### 7.2 构建上下文放在仓库根目录

`pi-coding-agent` 通过 `file:../../pi-mono/packages/*` 引用本地包。Dockerfile 在 `projects/AuditStudio/`，但 `context` 必须是 `AIAgent/` 根目录，并 COPY 两份：

- `pi-mono/`
- `projects/AuditStudio/`

构建时在容器内将路径改为 `file:./pi-mono/`。

### 7.3 standalone 产物路径不固定

Next.js 在 monorepo 下可能把 standalone 放在嵌套目录。Dockerfile 用「找最大的 `server.js`（排除 node_modules）」再复制，避免误选 1～2KB 的无关 `server.js` 导致容器秒退。

### 7.4 启动脚本修复挂载卷权限

宿主机 `/root/.pi` 常为 `root:root 700`。容器内应用以 `nextjs` 运行，**必须**在 entrypoint 里 `chown`/`chmod`，否则设置保存、会话写入全部静默失败。

### 7.5 pi SDK 用动态 import

`@earendil-works/pi-coding-agent` 含动态 `require`，不可在 API 路由顶层 `import`。统一通过 `src/lib/pi-sdk.ts` 的 `getPiSdk()` 懒加载，并在 `next.config.ts` 配置 `serverExternalPackages`（含 `pi-tui`）。

### 7.6 前端保存要检查 HTTP 状态

设置页保存必须用 `apiJson()`（或等价逻辑）处理 `!res.ok`，否则权限/磁盘错误时用户以为「已保存」。

### 7.7 离线/内网构建字体

Docker 构建若无法访问 Google Fonts，设置：

```dockerfile
ENV NEXT_FONT_GOOGLE_MOCKED=1
```

### 7.8 目标平台 linux/amd64

服务器为 x86_64（Dell）。`docker-compose.yml` 与 Dockerfile 指定 `linux/amd64`，避免在 ARM Mac 上构建出错误架构的 native 模块。

---

## 8. 错误经验（踩坑记录）

### 8.1 设置保存无效 — 挂载目录权限

| 现象 | 设置里点保存模型，刷新后丢失 |
| 原因 | `/root/.pi` 挂载进容器后为 `root:root 700`，`nextjs` 无法写入 |
| 误判 | 以为是前端或 API 逻辑 bug |
| 解决 | `docker-entrypoint.sh` 启动时 `chown nextjs:nodejs`；`deploy.sh` 宿主机 `chown 1001:1001` |
| 验证 | `docker exec -u nextjs audit-studio touch /home/nextjs/.pi/agent/test` |

**同类受影响功能**：默认模型、系统提示词、搜索 API Key、应用分组、招投标 KB、文档改写配置、应用历史等所有写 `~/.pi` 的接口。

### 8.2 容器反复重启（Exit 0）

| 现象 | `docker ps` 显示 `Restarting`，日志为空 |
| 原因 | standalone 复制了错误的 `server.js`（体积小，非 Next 启动入口） |
| 解决 | 按文件大小选取正确的 `server.js` 再 `cp` 到 `/out` |

### 8.3 Docker 构建找不到 pi-coding-agent

| 现象 | `Module not found: @earendil-works/pi-coding-agent` |
| 原因 | ① `package-lock.json` 里锁了本机路径；② 分两次 COPY 时第二次覆盖了已 sed 的 `package.json` |
| 解决 | 构建前 `rm package-lock.json`；一次 COPY 全量源码后再 `sed` + `npm install` |

### 8.4 `Cannot find module as expression is too dynamic`

| 现象 | 构建/运行日志大量该错误 |
| 原因 | 静态 import pi-coding-agent，Turbopack 尝试打包动态 require |
| 解决 | 全部改为 `getPiSdk()` 动态 import + `serverExternalPackages` |

### 8.5 Docker 镜像拉取失败

| 现象 | `lookup docker.mirrors.ustc.edu.cn: no such host` |
| 原因 | 服务器 `daemon.json` 配置了失效镜像源 |
| 临时解决 | `docker tag docker.1panel.live/library/node:22-alpine node:22-alpine` |
| 长期建议 | 修正 `/etc/docker/daemon.json` 的 `registry-mirrors` |

### 8.6 部署后 8286 无服务

| 现象 | 停掉 systemd 后端口空闲，Docker 未起 |
| 原因 | 构建失败或 SSH/网络中断，部署未完成 |
| 解决 | 重新执行 `deploy-remote.sh`，确认 `docker ps` 为 Up |

### 8.7 前端吞掉保存错误

| 现象 | 用户点击保存无反馈，数据未写入 |
| 原因 | `catch { // ignore }` |
| 解决 | 使用 `apiJson()` + 设置页顶部 `settings-error-banner` |

### 8.8 rsync 与构建上下文

| 注意 | `.dockerignore` 在 `projects/AuditStudio/` 下，但 build context 是仓库根，**根目录的 `.dockerignore` 才会生效**；当前 Dockerfile 在 RUN 里删除 lockfile，已规避主要问题 |

### 8.9 不要用 `next build` 污染本地 dev

| 说明 | 开发时只跑 `npm run dev`，避免 `next build` 写满 `.next` 影响 dev（见仓库 AGENTS.md） |

---

## 9. 故障排查清单

按顺序检查：

1. **网络**：`ping 10.168.1.223`、`ssh root@10.168.1.223`
2. **端口**：`ss -tlnp | grep 8286` — 应为 `docker-proxy` 或容器映射
3. **容器**：`docker ps -a --filter name=audit-studio` — 应为 `Up`，非 `Restarting`
4. **日志**：`docker logs audit-studio --tail 50`
5. **权限**：
   ```bash
   ls -la /root/.pi /root/.pi/agent
   docker exec -u nextjs audit-studio touch /home/nextjs/.pi/agent/.write-test
   ```
6. **API**：
   ```bash
   curl -s http://127.0.0.1:8286/api/models-config | head
   ```
7. **保存是否落盘**：修改设置后检查 `/root/.pi/agent/models.json` 时间戳与内容

---

## 10. 与旧版 pi-web-v2 部署的差异

| 项目 | 旧版（pi-web.service） | 现版（Docker） |
|------|------------------------|----------------|
| 路径 | `/opt/pi-deploy/pi-web-v2/pi-web-v2` | `/opt/audit-studio` |
| 进程管理 | systemd | docker compose |
| 升级 | rsync standalone + restart | `deploy-remote.sh` |
| 配置目录 | 宿主机 `/root/.pi`（可共用） | 同上，挂载进容器 |
| 应用名 | pi-web | audit-studio |

配置目录路径一致，**从 pi-web 迁到 Audit Studio 通常可保留原有 `~/.pi` 配置**。

---

## 11. 安全提示

- 文档中的服务器 IP、路径按当前内网环境编写，对外暴露时请配合防火墙与 Tunnel。
- `/root/.pi` 含 API Key，勿提交到 Git；备份时注意加密。
- 生产环境建议限制 8286 仅内网访问。

---

## 12. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-20 | 从 systemd 迁移至 Docker；修复 standalone 路径、pi 动态 import、`.pi` 卷权限、设置保存错误提示 |

---

## 13. 相关文件索引

```
projects/AuditStudio/
├── DEPLOY.md                 # 本文档
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh
├── deploy.sh
├── deploy-remote.sh
├── next.config.ts            # standalone + serverExternalPackages
└── src/lib/
    ├── pi-sdk.ts             # pi-coding-agent 懒加载
    └── api.ts                # apiJson 统一错误处理
```

如有新环境（新服务器、新端口），优先修改 `docker-compose.yml` 端口与 `deploy-remote.sh` 中的 `REMOTE`/`DEPLOY`，其余流程不变。
