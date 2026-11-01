# dsh 迁移交付与验收记录

原始基线提交：`b7acafe`。

开发分支：`feat/dsh-agent-runtime`。工作目录：`/home/orca/work/audit-studio`。

## 协议 spike 结论

实际运行 `node scripts/dsh-acp-smoke.mjs`，不是仅依据接口类型推测：

- `dsh --profile acp --patch <file>` 有效；新会话返回的默认模型与 patch 一致。
- `session/new` 和 `session/resume` 的 `mcpServers` 可挂载 stdio 服务。command 必须是绝对路径。audit-tools 已实际生成有效 docx/pdf。
- `session/set_config_option` 请求字段为 `configId`、`value`。模型 `configId = "model"`，value 是 JSON 字符串，例如 `"[\"mock\",\"mock-b\"]"`，不是 provider/model 斜杠形式。思考强度 `configId = "reasoning_effort"`，value 为模型提供的 effort id。
- 进程退出后重启，再 `session/resume {sessionId,cwd,mcpServers}`，可继续对话；cancel 返回 `stopReason: "cancelled"`。
- 实测工具更新包括 `tool_call {toolCallId,title,kind,status,rawInput}` 和 `tool_call_update {toolCallId,status,content:[{type:"content",content:{type:"text",text}}]}`。文本为 `agent_message_chunk {messageId,content:{type:"text",text}}`；另有 usage_update。完整样例在 `dsh-spike-result.json`。
- 本轮 docx/pdf 工具调用未触发 requestPermission（实测数组为空），不能声称验证了所有权限场景。客户端仅服务应用启动的本地 dsh，按原有无人值守策略选择 allow_once；缺少 allow_once 时拒绝。
- ACP initialize 的 agentInfo.version 实际返回 `0.0.1`，这是 rc.5 的协议元数据，不能用来判断安装版本。package.json 与 lock 中 CLI 和全部 dsh-* 包均为 `0.2.1-rc.5`。dsh 自己仍间接依赖 pi-ai 适配器；应用的 Pi Agent SDK 及直接依赖已删除。
- 实际持久化路径为 `dsh/sessions/<project-key>/<sessionId>/session.v4.jsonl.zstd`。应用展示从自有 transcript 读取，未绑定该内部文件格式；删除接口验证 UUID 字符集后，仅清理真实项目目录下对应 sessionId，跳过项目目录符号链接。

## 验证证据

- 单测：43/43 通过，包含翻译层、Word/PDF、doc-diff。最初通过 CHROMIUM_PATH 使用本机 Chromium；随后安装依赖版本对应的 Chromium，直接 `npm test`（不设 CHROMIUM_PATH）也已 43/43 通过。
- TypeScript：`npx tsc --noEmit` 通过；已移除原 next.config 中忽略类型错误的选项。
- 生产构建：`npm run build` 通过，包含 MCP 打包和 Next 类型检查。
- 真实应用 API + mock 模型：见 `dsh-app-result.json`，包括新建、流式 SSE、停止、steer 排队后实际发送、切模型/思考、MCP 导出、展示历史、改名/删除、旧会话只读、技能安装和路径穿越拒绝。
- Playwright：见 `dsh-browser-result.json`，验证刷新后重开并续聊、Word/PDF 右栏预览、旧会话输入禁用、技能进入真实模型请求、无页面异常。
- 运行时生命周期：见 `dsh-lifecycle-result.json`，验证单例、SIGKILL 后自动启动新子进程、原会话续聊、配置保存重启、改名在后续对话后保留、patch 无 API Key、删除真实持久化目录，以及生成中删除会话后不会重建 transcript 或索引。另验证开发服务器退出后没有遗留 dsh，完整重启为生产服务后仍可用同一个 sessionId 恢复历史并续聊。
- 应用功能回归：`BASE_URL=http://localhost:8286 CHROMIUM_PATH=... node scripts/verify-doc-diff.mjs`，49/49 浏览器断言通过，包括文档改写/合并入口、审核、局部改写、错误/截断/停止、历史及 DOCX 下载。业务路由仅改变配置/技能读取目录。

## lint 既有债务（需审查）

在主分支原始快照执行原始 ESLint，原有 **197 个错误**（161 no-explicit-any、12 no-require-imports、3 prefer-const、15 set-state-in-effect、4 immutability、2 purity）。为避免本次迁移修改无关业务和前端事件消费者，增加 `eslint-baseline.json` 与 `scripts/lint.mjs`：只将匹配原文件、规则、源代码行和诊断的既有问题作为警告；新诊断仍为错误。未全局关闭或降低规则。`npm run lint` 当前无新增错误，但原始 `npx eslint` 仍会报告既有债务；这不代表消除了旧问题。注入新的 any 诊断，已确认 lint 返回失败。Claude 应明确审查是否接受此基线策略。

## 尚未完成的验收项

**Docker 构建和容器内对话尚未通过验证。** 已执行 docker build，环境返回：

```text
ERROR: permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

当前 orca 用户不在 docker 组，`sudo -n` 要求密码；尝试 rootless Docker 又缺少 newuidmap。还检查了仓库部署文档中的备用 SSH 服务器 `10.168.1.223`，连接超时，未执行远程构建。没有将该项标记为通过。Dockerfile/entrypoint/compose 已迁移至新目录，部署脚本在首次创建新卷前复制旧宿主机配置（shell 语法检查通过），镜像包含 Node 22.23.1、Chromium/Noto CJK、bash、完整依赖和打包 MCP。

准备好的复测脚本（Linux Docker）：先启动 mock，再执行 `node scripts/verify-dsh-docker.mjs`。它会构建镜像、启动独立容器、在容器配置 mock、完成一次真实 dsh 对话并检查版本，最后停止容器。

## 行为变化

对话中 steer 插话和 followUp 都排队到本轮结束后发送，不再即时生效。停止按钮清空待发队列并取消当前轮。UI 与 README/DEPLOY 均已说明。旧 Pi 对话仅可查看，不能续聊。
