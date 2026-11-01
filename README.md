# Audit Studio

审计工作助手，提供 Agent 对话、文档生成、文档改写/合并、城市研究、招投标审查和价格分析。

需要 **Node.js >=22.19**。Agent 使用精确锁定的 **@deepseek-ai/dsh 0.2.1-rc.5**，通过 ACP stdio 子进程通信；不要安装 npm `latest`（旧版本 0.0.1）。

```bash
npm ci
npm run dev
```

打开 http://localhost:8286，在设置中配置 OpenAI 兼容模型服务、默认模型和思考强度。`dev` 和 `build` 都会先构建文档 MCP 服务。

配置统一存放在 `~/.audit-studio/`，可通过 `AUDIT_STUDIO_HOME` 指定独立目录。首次启动若新目录不存在，会从旧 `~/.pi/agent` 复制配置，不删除旧目录。包含 models.json、settings.json、auth.json、data/、session-index.json、transcripts/。dsh 使用独立的 `dsh/` 子目录，技能安装在 `dsh/skills/`，首次会复制旧 skills/。

模型密钥由应用设置保管；传给 dsh 时只使用子进程环境变量 `AUDIT_STUDIO_KEY_*`。生成的 patch 只含环境变量名称，不含密钥；不转发子进程原始日志。应用功能仍直接调用同一配置中的 OpenAI 兼容接口。

新会话采用 dsh sessionId；刷新后从应用 transcript 恢复展示，续聊通过 ACP resume 恢复模型上下文。旧 `<cwd>/sessions/*.jsonl` 会话标为 **Pi 历史会话（只读）**，可查看和管理列表，不能续聊。

**行为变化：对话进行中追加消息（包括 steer 插话）会排队到本轮结束后再发送，不再即时打断本轮。** 停止按钮取消当前轮并清空待发队列；切换模型和思考强度须等待本轮结束。

对话通过 MCP `export_document` 生成 Word、PDF、Markdown、txt，保存在 `<cwd>/outputs/`。右栏可预览、下载，Word 显示正文，PDF 内嵌预览。重名文件自动加序号。

本地 PDF 渲染需要 Chromium 和中文字体：

```bash
npx playwright install chromium --with-deps
# Debian/Ubuntu: 安装 fonts-noto-cjk；也可用 CHROMIUM_PATH 指定已有 Chromium
```

验证命令：

```bash
npm test
npm run lint
npm run build
node scripts/mock-llm-server.mjs
# 另一个终端（mock 服务运行中）
node scripts/dsh-acp-smoke.mjs
```

lint 对主分支原有问题使用精确诊断基线，保留警告，新增错误仍阻断；原有债务及尚未完成的 Docker 验收详见 [迁移记录](docs/DSH_MIGRATION.md)。协议 spike 原始证据也在 `docs/`。部署见 [DEPLOY.md](DEPLOY.md)。
