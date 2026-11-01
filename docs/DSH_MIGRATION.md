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

- 单测：48/48 通过，包含翻译层、模型思考选项兼容、Word/PDF、doc-diff。最初通过 CHROMIUM_PATH 使用本机 Chromium；随后安装依赖版本对应的 Chromium，直接 `npm test`（不设 CHROMIUM_PATH）通过。
- TypeScript：`npx tsc --noEmit` 通过；已移除原 next.config 中忽略类型错误的选项。
- 生产构建：`npm run build` 通过，包含 MCP 打包和 Next 类型检查。
- 真实应用 API + mock 模型：见 `dsh-app-result.json`，包括新建、流式 SSE、停止、steer 排队后实际发送、切模型/思考、MCP 导出、展示历史、改名/删除、旧会话只读、技能安装和路径穿越拒绝。
- Playwright：见 `dsh-browser-result.json`，验证刷新后重开并续聊、Word/PDF 右栏预览、旧会话输入禁用、技能进入真实模型请求、无页面异常。
- 运行时生命周期：见 `dsh-lifecycle-result.json`，验证单例、SIGKILL 后自动启动新子进程、原会话续聊、配置保存重启、改名在后续对话后保留、patch 无 API Key、删除真实持久化目录，以及生成中删除会话后不会重建 transcript 或索引。另验证开发服务器退出后没有遗留 dsh，完整重启为生产服务后仍可用同一个 sessionId 恢复历史并续聊。
- 应用功能回归：`BASE_URL=http://localhost:8286 CHROMIUM_PATH=... node scripts/verify-doc-diff.mjs`，49/49 浏览器断言通过，包括文档改写/合并入口、审核、局部改写、错误/截断/停止、历史及 DOCX 下载。业务路由仅改变配置/技能读取目录。

## 补充模型兼容验证

复核时真实复现：全局 defaultThinkingLevel 为 high、默认模型不提供 reasoning_effort 时，新建会话报 400。修复为依据 ACP 实际返回的 configOptions 检查可用值；缺少思考选项时使用 off，保存的强度不可用时跟随当前模型默认值，显式 off 在恢复时也会按可用选项恢复。切模时同步更新原有 thinking_level_changed 事件及持久化状态。

`scripts/verify-dsh-model-compat.mjs` 在隔离应用和 mock 上验证通过，证据见 `dsh-model-compat-result.json`：全局 high + 非思考模型新建、思考模型切到非思考模型、SIGKILL 后恢复该模型并续聊、显式 off 跨运行时重启保留。实际 mock 请求的 model 字段也核对为 mock-plain。新增 5 项单测覆盖缺少选项、不支持原强度、分组选择、提供商默认值和 off 恢复。

## lint 既有债务（复核接受过渡方案）

在主分支原始快照执行原始 ESLint，原有 **197 个错误**（161 no-explicit-any、12 no-require-imports、3 prefer-const、15 set-state-in-effect、4 immutability、2 purity）。为避免本次迁移修改无关业务和前端事件消费者，增加 `eslint-baseline.json` 与 `scripts/lint.mjs`：只将匹配原文件、规则、源代码行和诊断的既有问题作为警告；新诊断仍为错误。未全局关闭或降低规则。`npm run lint` 当前无新增错误，但原始 `npx eslint` 仍会报告既有债务；这不代表消除了旧问题。注入新的 any 诊断，已确认 lint 返回失败。2026-11-01 Claude 已接受过渡方案：基线只减不增，禁止为新代码重新生成或增加条目；维护规则已写入 README。any 和 set-state-in-effect 债务后续通过独立 PR 偿还。

## Docker 验收（已通过）

`node scripts/verify-dsh-docker.mjs` 已完整执行并返回 0，记录见 `dsh-docker-result.json`。该脚本实际构建镜像、启动 standalone 应用容器、配置隔离 mock 模型、完成真实 dsh 对话并读取持久化历史，随后通过 MCP 生成中文 Word/PDF，验证 Word 正文预览与 PDF 文件签名，最后停止并删除临时验收容器。

- 镜像：`audit-studio:dsh-acceptance`。
- 镜像 ID：`sha256:ad786dbd33ea815795da6f1c996b406bc3adde830769e76cb1910c5024305d03`。
- 容器 Node：`v22.23.1`；实际安装的 dsh：`0.2.1-rc.5`。
- 容器使用系统 Chromium/Noto CJK，文档 MCP 从 dist-mcp 加载；真实对话、Word 预览与 PDF 下载均通过。
- 构建包含 `npm ci`、MCP 打包、Next 生产构建与类型检查。Dockerfile 保留完整 node_modules，部署脚本在首次创建新卷前迁移旧宿主机配置。

复测：先运行 `node scripts/mock-llm-server.mjs`，再运行 `node scripts/verify-dsh-docker.mjs`。脚本会自动生成版本、镜像标识与检查结果的 JSON 证据。

## 行为变化

对话中 steer 插话和 followUp 都排队到本轮结束后发送，不再即时生效。停止按钮清空待发队列并取消当前轮。UI 与 README/DEPLOY 均已说明。旧 Pi 对话仅可查看，不能续聊。

## 复核返工（2026-11-01）

针对 `34e79dc` 的 2 项高优先级、1 项中优先级和 3 项低优先级意见，已完成：

- 每个 ACP 请求与子进程生命周期竞争，进程退出会让 SDK 遗留的挂起请求结束。会话订阅带 generation 的退出通知，仅结束所属轮次；轮次编号避免旧请求的 finally 重复结束后续轮次。传输错误可能先于退出事件到达，因此生成失败也清空队列。停止时若进程已更换，直接结束当前轮。
- Pi 思考映射经纯函数转换：去除非 off 的 null、空值和未知档位，仅余 off 时使用 false。
- 根据有效 patch 与密钥环境变量的 SHA-256 判断是否重载。搜索设置不触发重载；有进行中的轮次和排队消息则等待全部空闲。保存接口不因重载失败返回 500，默认设置接口的 runtime 字段提供待重载状态和脱敏错误。初始化失败停止自动重试，避免无效配置反复拉起进程。
- 会话列表过滤异常 recentCwds，使用 allSettled 隔离目录读取失败，按 id 去重。
- 思考参数必须属于实际 configOptions 提供的选择；本地参数错误返回 400，上游错误统一脱敏。agent/new 同样不回显原始错误。
- 应用和 deploy.sh 首次迁移均仅复制 models.json、settings.json、auth.json、skills/；应用配置根目录和 dsh 目录收紧为 0700，旧目录保留。

复验命令与范围：

- `npm test`：53/53 通过；新增思考映射转换、配置摘要、实际选项校验、迁移范围和权限测试。
- `npm run lint`：0 个新增错误，仍为 171 条既有债务，eslint-baseline.json 未修改，也未增加 eslint-disable。
- `npm run build`：通过 MCP 构建和 Next 生产构建、类型检查；仍有原有的 next.config.ts 文件追踪警告。
- `bash -n deploy.sh`、`git diff --check`：通过。
- `node scripts/verify-dsh-rework.mjs`：启动隔离的生产 Next 服务、真实 dsh 与本地 mock。包含生成中 SIGKILL、单次 agent_end、队列清空、停止、自动重启续聊；两个会话生成中保存配置，确认搜索设置不变 PID，dsh 设置待全部空闲才换 PID，两轮正常结束且重载后可续聊；还覆盖 null 思考映射真实启动、非法思考参数、异常会话目录、重复 id、缺少默认模型时成功保存、真实初始化失败的错误脱敏。证据见 [dsh-rework-result.json](dsh-rework-result.json)。

本轮未重新执行完整浏览器流程或 Docker 构建；前述浏览器与 Docker 记录属于返工前的迁移验收，本轮通过生产服务与真实子进程覆盖变动行为。供 Claude 基于当前提交继续独立复核。
