/**
 * 本地 mock LLM 上游（OpenAI /chat/completions 兼容）：
 * - POST /v1/chat/completions：按当前场景返回 SSE 流或非流式 JSON
 * - POST /control {mode}：切换场景（normal|eof-abrupt|length|tail-no-newline|error|nochange）
 * 场景由验收脚本驱动，用于验证真实 stream 路由的成功/截断区分与缓冲尾事件处理。
 */
import http from "node:http";

const PORT = 19999;

const DOC_FIXTURE = [
  "一、项目总体概况",
  "本项目为信息化系统建设项目，实施地点位于北京市海淀区。",
  "本项目为信息化系统建设项目，总预算为1350万元，实施周期为120天。",
  "本项目为信息化系统建设项目，总预算为1350万元，实施周期为120天。",
  "审计报告已完成归档；审计报告已提交审核；审计报告后续将适时公布。",
  "第一章术语定义与解释说明。",
  "第二章项目背景与建设目标。",
  "第三章总体架构与技术路线。",
  "第四章实施计划与里程碑安排。",
  "质量控制在事前、事中与事后全过程。",
  "第五章验收标准与质保责任。",
  "沟通机制与例会安排按周度执行推进。",
  "以上条款自签署之日起生效。",
  "本合同一式两份，双方各执一份。",
  "本方案最终解释权归项目组所有。",
].join("\n");

const state = { mode: "normal", hangMs: 30000 };

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
function delta(res, content) {
  sse(res, { choices: [{ delta: { content } }] });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/control") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {}
      if (typeof parsed.mode === "string") state.mode = parsed.mode;
      if (typeof parsed.hangMs === "number") state.hangMs = parsed.hangMs;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, mode: state.mode }));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {}
      const userText = (parsed.messages?.find((m) => m.role === "user")?.content) || "";
      const wantsStream = parsed.stream === true;
      // 局部片段请求的 user 消息以选中文本结尾（整篇请求以全文结尾）
      const isPartial = userText.trimEnd().endsWith("审计报告");

      // 非流式（analyze-style 等）
      if (!wantsStream) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "mock 风格：正式、简洁" }, finish_reason: "stop" }],
          })
        );
        return;
      }

      if (state.mode === "error") {
        // 真实上游错误以 HTTP 非 200 表达
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "mock upstream failure" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      const text = isPartial
        ? "评审报告"
        : state.mode === "nochange"
          ? DOC_FIXTURE // 与确认正文一致（nochange 场景由脚本先行接受一次后使用）
          : DOC_FIXTURE;

      const chunks = [];
      for (let i = 0; i < text.length; i += 24) chunks.push(text.slice(i, i + 24));

      if (state.mode === "hang") {
        // 延迟响应后输出正常内容（用于停止/迟到结果场景）
        setTimeout(() => {
          if (res.destroyed) return;
          for (const c of chunks) delta(res, c);
          sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
          res.write("data: [DONE]\n\n");
          res.end();
        }, state.hangMs ?? 30000);
        return;
      }

      if (state.mode === "eof-abrupt") {
        // 输出前半（确保已刷新到对端）后直接断开（无 [DONE]、无 finish_reason）
        for (const c of chunks.slice(0, Math.ceil(chunks.length / 2))) delta(res, c);
        res.flushHeaders();
        setTimeout(() => res.destroy(), 120);
        return;
      }
      if (state.mode === "length") {
        for (const c of chunks.slice(0, Math.ceil(chunks.length / 2))) delta(res, c);
        sse(res, { choices: [{ delta: {}, finish_reason: "length" }] });
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      if (state.mode === "tail-no-newline") {
        for (const c of chunks.slice(0, -1)) delta(res, c);
        // 最后一个内容事件与 [DONE] 均不带换行，随后正常结束：
        // 验证路由对缓冲区尾部残留事件（含终止标记）的处理
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: chunks[chunks.length - 1] } }] })}\n` +
            `data: [DONE]`
        );
        res.end();
        return;
      }
      // normal
      for (const c of chunks) delta(res, c);
      sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
      res.write("data: [DONE]\n\n");
      res.end();
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.on("clientError", (err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
// 连接被客户端中途断开（eof-abrupt 场景）不应导致进程退出
server.on("connection", (socket) => {
  socket.on("error", () => {});
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock llm upstream listening on http://127.0.0.1:${PORT}`);
});
