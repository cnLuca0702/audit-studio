/**
 * 文档改写操作状态（纯函数，无 DOM/React 依赖）+ 客户端 SSE 归约器。
 *
 * 状态模型：已确认正文 confirmed；同一时间最多一个待审核操作 pending；
 * 接受/拒绝按操作 ID 精确生效，过期/重复 ID 返回原状态。
 * 所有正文均为规范化 LF 文本，作为 diff/选区/复制/导出的唯一来源。
 */

export type RewriteOpKind = "full" | "partial";

export interface RewriteOperation {
  id: string;
  kind: RewriteOpKind;
  createdAt: number;
  /** 规范化改写前全文 */
  before: string;
  /** 规范化改写后全文 */
  after: string;
  /** 局部改写范围（相对 before 的 UTF-16 区间），整篇为 null */
  range: { start: number; end: number } | null;
  summary: string;
}

export interface RewriteDocState {
  /** 已确认正文（规范化 LF） */
  confirmed: string;
  /** 待审核操作；同一时间最多一个 */
  pending: RewriteOperation | null;
  /** 已处理（接受或拒绝）的操作总数 */
  processedOps: number;
  /** 已接受的操作数 */
  acceptedOps: number;
}

export function initRewriteDocState(confirmed: string): RewriteDocState {
  return { confirmed, pending: null, processedOps: 0, acceptedOps: 0 };
}

export function generateOpId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export interface CreatePendingInput {
  kind: RewriteOpKind;
  before: string;
  after: string;
  range: { start: number; end: number } | null;
  summary: string;
  id?: string;
  createdAt?: number;
}

/**
 * 创建待审核操作。仅当当前无待审核操作且 before !== after 时成功；
 * 否则返回 null（调用方不得隐式覆盖既有待审核操作）。
 */
export function createPendingOp(
  state: RewriteDocState,
  input: CreatePendingInput
): { state: RewriteDocState; op: RewriteOperation } | null {
  if (state.pending !== null) return null;
  if (input.before === input.after) return null;
  const op: RewriteOperation = {
    id: input.id ?? generateOpId(),
    kind: input.kind,
    createdAt: input.createdAt ?? Date.now(),
    before: input.before,
    after: input.after,
    range: input.range,
    summary: input.summary,
  };
  return { state: { ...state, pending: op }, op };
}

/** 接受指定操作：仅当 id 精确匹配当前待审核操作时提交 after */
export function acceptOp(state: RewriteDocState, id: string): RewriteDocState {
  if (!state.pending || state.pending.id !== id) return state;
  return {
    confirmed: state.pending.after,
    pending: null,
    processedOps: state.processedOps + 1,
    acceptedOps: state.acceptedOps + 1,
  };
}

/** 拒绝指定操作：仅当 id 精确匹配时丢弃；confirmed 保持不变 */
export function rejectOp(state: RewriteDocState, id: string): RewriteDocState {
  if (!state.pending || state.pending.id !== id) return state;
  return { ...state, pending: null, processedOps: state.processedOps + 1 };
}

// ─────────────────────────────────────────────────────────
// SSE 归约器：解析 data: 行、累积内容、跟踪终止状态。
// 支持任意分片喂入；finish() 处理缓冲区尾部无换行的残留事件。
// ─────────────────────────────────────────────────────────

export interface SseEvent {
  content?: string;
  error?: string;
  warning?: string;
}

export class SseReducer {
  content = "";
  error: string | null = null;
  warning: string | null = null;
  sawDone = false;
  truncated = false;
  private buf = "";

  push(chunk: string): SseEvent[] {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    const events: SseEvent[] = [];
    for (const line of lines) {
      const ev = this.parseLine(line);
      if (ev) events.push(ev);
    }
    return events;
  }

  /** 流结束。clean=false 表示读取侧异常（网络错误等），标记截断 */
  finish(clean: boolean): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buf) {
      const ev = this.parseLine(this.buf);
      if (ev) events.push(ev);
      this.buf = "";
    }
    if (!clean) this.truncated = true;
    return events;
  }

  /** 干净完成：收到 [DONE] 且无错误、无警告、无截断 */
  get cleanFinish(): boolean {
    return this.sawDone && this.error === null && this.warning === null && !this.truncated;
  }

  private parseLine(line: string): SseEvent | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) return null;
    const payload = trimmed.slice(6);
    if (payload === "[DONE]") {
      this.sawDone = true;
      return null;
    }
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      if (typeof parsed.error === "string") {
        if (this.error === null) this.error = parsed.error;
        return { error: parsed.error };
      }
      if (typeof parsed.warning === "string") {
        if (this.warning === null) this.warning = parsed.warning;
        return { warning: parsed.warning };
      }
      if (typeof parsed.content === "string" && parsed.content) {
        this.content += parsed.content;
        return { content: parsed.content };
      }
    } catch {
      /* 忽略畸形行 */
    }
    return null;
  }
}

/**
 * 调用改写流接口并归约 SSE。中止/网络错误原样抛出（此时结果不可用）。
 * onDelta 收到的是已累积的全文预览（原始输出，仅用于生成中展示）。
 */
export async function streamRewrite(
  url: string,
  body: unknown,
  signal: AbortSignal,
  onDelta?: (fullContent: string) => void
): Promise<SseReducer> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let message = `请求失败 (HTTP ${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");
  const reducer = new SseReducer();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      reducer.push(decoder.decode(value, { stream: true }));
      if (onDelta) onDelta(reducer.content);
    }
    const tail = decoder.decode();
    if (tail) {
      reducer.push(tail);
      if (onDelta) onDelta(reducer.content);
    }
  } catch (err) {
    reducer.finish(false);
    throw err;
  }
  reducer.finish(true);
  return reducer;
}
