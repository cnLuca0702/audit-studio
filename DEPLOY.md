# Audit Studio 部署指南

本文档记录 Audit Studio 在服务器 `10.168.1.223:8286` 上的 Docker 部署流程，以及实际踩坑后的成功经验与错误经验。

---

## 1. 架构概览

```
浏览器
  → http://10.168.1.223:8286
  → Docker 容器 audit-studio（Next.js standalone）
  → 读写 ~/.audit-studio/（模型、设置、技能、历史等）
  → ACP stdio 子进程 dsh（独立 DSH_HOME，关闭遥测）
  → transcript + dsh/sessions 保存新会话；~/sessions/ 旧会话只读
```

| 项目 | 说明 |
|------|------|
| 应用 | Audit Studio（Next.js 16 + dsh ACP） |
| 部署方式 | Docker Compose |
| 服务器路径 | `/opt/audit-studio/app/` |
| 容器名 | `audit-studio` |
| 端口 | `8286` |
| 配置目录（宿主机） | `/root/.audit-studio` |
| 旧会话目录（宿主机，只读展示） | `/root/sessions` |
| 容器内用户 | `nextjs`（uid 1001） |
| 容器内配置路径 | `/home/nextjs/.audit-studio` |

**代码仓库**

- GitHub：https://github.com/cnLuca0702/audit-studio
- 本目录为独立 Git 仓库，**不要**再推送到 `agegr/pi-web`
- 日常提交：`./push.sh "提交说明"` 或 `git push origin main`

**依赖关系**

- 仓库已独立：`@deepseek-ai/dsh` 固定 **0.2.1-rc.5**，ACP SDK 固定 1.4.0，使用 `npm ci`；不要使用指向旧版 0.0.1 的 npm latest
- 构建上下文为**本仓库根目录**（`docker compose build` 即可）
- Node.js 前置条件 >= 22.19.0

---

## 2. 前置条件

### 本地开发机

- Node.js >=22.19（本地调试）
- Docker Desktop 或 Docker CLI（可选，用于本地验证镜像）
- SSH 免密登录服务器：`ssh root@10.168.1.223`

### 服务器

- Docker + Docker Compose
- 内网可达 `10.168.1.223`
- 8286 端口未被其他进程占用

### 仓库结构

```
audit-studio/                 # 本仓库（独立，自包含）
├── Dockerfile                # 构建上下文 = 仓库根目录
├── docker-compose.yml
├── docker-entrypoint.sh
├── deploy.sh                 # 在服务器上执行（需 root）
└── deploy-remote.sh          # 从本机一键部署
```

---

## 3. 快速部署（推荐）

### 3.1 一键从本机部署

```bash
./deploy-remote.sh
```

脚本会：

1. `rsync` 同步本仓库到 `/opt/audit-studio/app/`
2. SSH 到服务器执行 `deploy.sh`（首次复制旧配置、构建镜像、启动容器）
3. 校验 `http://127.0.0.1:8286` 返回 HTTP 200

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
| `Dockerfile` | 多阶段构建：npm ci → 打包 MCP + Next standalone → 运行镜像 |
| `docker-compose.yml` | 端口映射、卷挂载、平台 `linux/amd64` |
| `docker-entrypoint.sh` | 启动前修复挂载目录权限，再以 `nextjs` 运行 |
| `deploy.sh` | 停掉旧 systemd 服务、释放 8286、构建并启动容器 |
| `deploy-remote.sh` | 本机同步代码 + 触发服务器 `deploy.sh` |
| `.dockerignore` | 排除 `node_modules`、`.next` 等（注意：构建上下文根目录在仓库根，见下文） |

### 数据持久化

`docker-compose.yml` 挂载：

```yaml
volumes:
  - /root/.audit-studio:/home/nextjs/.audit-studio
  - /root/sessions:/home/nextjs/sessions
```

以下功能都依赖 `/root/.audit-studio`：

- `models.json` / `settings.json`（设置里保存模型、默认模型、系统提示词、搜索 Key）
- `auth.json`（API Key）
- `data/`（应用历史、招投标知识库等）
- `dsh/skills/`（技能与参考文档）

**更新应用不会清空上述数据**，除非手动删除宿主机目录。

---

## 5. 本地开发

```bash
cd projects/AuditStudio
npm run dev
# http://localhost:8286
```

本地开发配置默认写在本机 `~/.audit-studio/`，与服务器 `/root/.audit-studio` 相互独立。

---

## 6. 运维命令

```bash
# 查看日志
docker logs audit-studio --tail 100 -f

# 一键回滚到上一版本（或指定镜像）
./rollback.sh
# 或指定回滚镜像标签：
./rollback.sh audit-studio:backup-20261018-000810

# 重启
docker compose restart

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
- `~/.audit-studio` 挂到宿主机，配置由应用独立管理，dsh 通过子进程环境变量接收密钥，换部署方式不丢配置。

### 7.2 构建上下文 = 仓库根目录

早期版本通过 `file:../../pi-mono/packages/*` 引用本地 SDK 源码，构建上下文必须是外层 monorepo 根。现已改为 npm 发布版依赖，`docker-compose.yml` 的 `context: .` 直接指向本仓库根，Dockerfile 内 `npm ci` 安装依赖，自包含可构建。

### 7.3 standalone 产物路径不固定

Next.js 在 monorepo 下可能把 standalone 放在嵌套目录。Dockerfile 用「找最大的 `server.js`（排除 node_modules）」再复制，避免误选 1～2KB 的无关 `server.js` 导致容器秒退。

### 7.4 启动脚本修复挂载卷权限

宿主机 `/root/.audit-studio` 常为 `root:root 700`。容器内应用以 `nextjs` 运行，**必须**在 entrypoint 里 `chown`/`chmod`，否则设置保存、会话写入全部静默失败。

### 7.5 dsh ACP 与文档 MCP 服务

Next 后端通过 `@agentclientprotocol/sdk` 连接本地 `node_modules/.bin/dsh --profile acp --patch`。运行时是 globalThis 单例，崩溃自动重启；配置保存后重启，退出时终止子进程。API Key 仅通过环境变量传给 dsh，patch 只含 apiKeyEnv 名称，不转发原始子进程日志。

Docker 必须包含完整 node_modules 和 `dist-mcp/audit-tools.mjs`；`npm run build` 会先打包 MCP 服务。镜像安装 Chromium、中文字体和 bash。dsh 的 Node 需求是 >=22.19。

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
| 原因 | `/root/.audit-studio` 挂载进容器后为 `root:root 700`，`nextjs` 无法写入 |
| 误判 | 以为是前端或 API 逻辑 bug |
| 解决 | `docker-entrypoint.sh` 启动时 `chown nextjs:nodejs`；`deploy.sh` 宿主机 `chown 1001:1001` |
| 验证 | `docker exec -u nextjs audit-studio touch /home/nextjs/.audit-studio/test` |

**同类受影响功能**：默认模型、系统提示词、搜索 API Key、应用分组、招投标 KB、文档改写配置、应用历史等所有写 `~/.audit-studio` 的接口。

### 8.2 容器反复重启（Exit 0）

| 现象 | `docker ps` 显示 `Restarting`，日志为空 |
| 原因 | standalone 复制了错误的 `server.js`（体积小，非 Next 启动入口） |
| 解决 | 按文件大小选取正确的 `server.js` 再 `cp` 到 `/out` |

### 8.3 无法启动 dsh

| 现象 | 无法创建会话或 dsh 启动失败 |
| 原因 | Node 版本不足、缺少 node_modules/.bin/dsh 或默认模型配置无效 |
| 解决 | 使用 Node >=22.19，执行 npm ci，检查默认 provider/model；镜像保留完整 node_modules |

### 8.4 文档 MCP 工具未加载

| 现象 | 对话没有 export_document 或文档生成失败 |
| 原因 | dist-mcp 缺失、工作目录不可写或 Chromium/字体未安装 |
| 解决 | npm run build:mcp，确认镜像复制 dist-mcp，检查目录权限和 CHROMIUM_PATH；恢复/新建会话 |

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
   ls -la /root/.audit-studio /root/.audit-studio
   docker exec -u nextjs audit-studio touch /home/nextjs/.audit-studio/.write-test
   ```
6. **API**：
   ```bash
   curl -s http://127.0.0.1:8286/api/models-config | head
   ```
7. **保存是否落盘**：修改设置后检查 `/root/.audit-studio/models.json` 时间戳与内容

---

## 10. 与旧版 pi-web-v2 部署的差异

| 项目 | 旧版（pi-web.service） | 现版（Docker） |
|------|------------------------|----------------|
| 路径 | `/opt/pi-deploy/pi-web-v2/pi-web-v2` | `/opt/audit-studio` |
| 进程管理 | systemd | docker compose |
| 升级 | rsync standalone + restart | `deploy-remote.sh` |
| 配置目录 | 宿主机 `/root/.audit-studio`（可共用） | 同上，挂载进容器 |
| 应用名 | pi-web | audit-studio |

从 Pi 迁移时，首次启动仅在新目录不存在时复制旧 `~/.pi/agent/`，不删除旧目录。Docker 旧宿主机应先备份，再将旧目录内容复制到新挂载目录；不要把旧 agent 层级原样嵌套进去。

---

## 11. 安全提示

- 文档中的服务器 IP、路径按当前内网环境编写，对外暴露时请配合防火墙与 Tunnel。
- `/root/.audit-studio` 含 API Key，勿提交到 Git；备份时注意加密。
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
    ├── app-config.ts         # 统一配置与一次性迁移
    ├── dsh/                  # ACP 运行时、事件翻译、历史持久化
    └── api.ts                # apiJson 统一错误处理
```

如有新环境（新服务器、新端口），优先修改 `docker-compose.yml` 端口与 `deploy-remote.sh` 中的 `REMOTE`/`DEPLOY`，其余流程不变。


## 14. dsh 迁移说明与验收

配置根目录默认为 `~/.audit-studio`，可用 `AUDIT_STUDIO_HOME` 覆盖。模型、设置、凭据、data/、session-index.json、transcripts/ 统一放在该目录。应用功能仍直连同一配置的 OpenAI 兼容 API。

dsh 使用隔离的 `dsh/` 子目录；技能安装到 `dsh/skills/`，首次复制原 skills/。新会话的模型上下文存储在 dsh/sessions，展示历史存储在 transcripts；备份需同时保留两者。旧工作目录 sessions/*.jsonl 标记为 Pi 历史会话，只能查看，不能续聊。

**行为变化：对话中 steer 插话和 followUp 都排队到本轮结束后发送，不再即时生效。** 停止会清空队列并取消当前轮；切换模型和思考强度需等待本轮结束。

Word/PDF 导出由 MCP `export_document` 执行，保存到工作目录 outputs/，右栏支持预览与下载。本地运行需 `npx playwright install chromium` 及系统中文字体，也可设置 CHROMIUM_PATH；Docker 已包含 Chromium/Noto CJK。工作目录需要存在且 nextjs 可写。

```bash
npm test
npm run lint
npm run build
node scripts/mock-llm-server.mjs
# 另一个终端
node scripts/dsh-acp-smoke.mjs
# 有 Docker 访问权限的 Linux 环境
node scripts/verify-dsh-docker.mjs
```

本次协议证据、已通过的检查、lint 既有债务处理以及 **尚未完成的 Docker 环境验收**，均明确记录在 [docs/DSH_MIGRATION.md](docs/DSH_MIGRATION.md)。没有将容器验收标为通过。
