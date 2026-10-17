import { createThinkStripper } from "@/lib/think-stream";
import { resolveDefaultModel } from "@/lib/llm-config";
import { NextResponse } from "next/server";

const DEFAULT_REWRITE_PROMPT = `你是一位专业的文档改写专家。请将用户提供的文档按照指定的文字风格进行改写。

改写要求：
1. 严格遵循下面的风格描述来改写文档
2. 保持原文的核心意思和结构不变
3. 保持原文的专业术语和关键信息准确
4. 输出纯文本格式，不要使用任何 Markdown 标记（不要用 #、*、-、> 等符号）
5. 只输出改写后的文档正文，不要在输出前后添加任何解释、说明、总结或提示
6. 禁止输出  标签及其内容

文字风格描述：
{{styleProfile}}

{{requirements}}`;

interface StreamBody {
  styleProfile: string;
  requirements?: string;
  documentText: string;
  rewritePrompt?: string;
}

// POST /api/doc-rewrite/stream — SSE stream document rewrite
export async function POST(req: Request) {
  try {
    const { styleProfile, requirements, documentText, rewritePrompt } =
      (await req.json()) as StreamBody;

    if (!styleProfile?.trim()) {
      return NextResponse.json({ error: "请先选择或生成文字风格" }, { status: 400 });
    }
    if (!documentText?.trim()) {
      return NextResponse.json({ error: "请上传需要改写的文档" }, { status: 400 });
    }

    const model = resolveDefaultModel();
    if (!model) {
      return NextResponse.json(
        { error: "未配置默认模型，无法改写" },
        { status: 500 }
      );
    }

    const sysPrompt = (rewritePrompt?.trim() || DEFAULT_REWRITE_PROMPT)
      .replace("{{styleProfile}}", styleProfile)
      .replace(
        "{{requirements}}",
        requirements?.trim() ? `用户额外要求：\n${requirements.trim()}` : ""
      );

    const userMsg = `请改写以下文档：\n\n${documentText}`;

    const encoder = new TextEncoder();
    function sseData(data: any): Uint8Array {
      return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
    }
    function sseDone(): Uint8Array {
      return encoder.encode(`data: [DONE]\n\n`);
    }

    const upstreamAbort = new AbortController();
    const clientSignal = AbortSignal.any([req.signal, upstreamAbort.signal]);

    const stream = new ReadableStream({
      async start(controller) {
        // try/catch 块作用域互不可见：catch 需要的状态在此声明
        const thinkStripper = createThinkStripper();
        let sentAnyContent = false; // 是否已向客户端转发过内容
        try {
          const llmRes = await fetch(`${model.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${model.apiKey}`,
            },
            body: JSON.stringify({
              model: model.modelId,
              messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userMsg },
              ],
              stream: true,
              max_tokens: model.maxTokens,
              temperature: 0.7,
            }),
            signal: AbortSignal.any([clientSignal, AbortSignal.timeout(300_000)]),
          });

          if (!llmRes.ok || !llmRes.body) {
            const errText = await llmRes.text().catch(() => "");
            controller.enqueue(
              sseData({ error: `LLM API 错误: HTTP ${llmRes.status} - ${errText.slice(0, 300)}` })
            );
            controller.enqueue(sseDone());
            controller.close();
            return;
          }

          const reader = llmRes.body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";
          let sawCleanEnd = false; // 上游 [DONE] 或 finish_reason === "stop"
          let sawLengthLimit = false; // finish_reason === "length"（截断但属预期）

          /** 处理一条上游 data: 载荷；返回 true 表示已按干净结束收尾 */
          const handlePayload = (payload: string): boolean => {
            if (payload === "[DONE]") {
              sawCleanEnd = true;
              return true;
            }
            try {
              const chunk = JSON.parse(payload);
              const content = chunk.choices?.[0]?.delta?.content || "";
              if (content) {
                const cleaned = thinkStripper.push(content);
                if (cleaned) {
                  controller.enqueue(sseData({ content: cleaned }));
                  sentAnyContent = true;
                }
              }
              const finishReason = chunk.choices?.[0]?.finish_reason;
              if (finishReason === "stop") {
                sawCleanEnd = true;
                return true;
              }
              // finish_reason === "length" means max_tokens hit — flush buffer and warn
              if (finishReason === "length") {
                sawLengthLimit = true;
                const tail = thinkStripper.flush();
                if (tail) controller.enqueue(sseData({ content: tail }));
                controller.enqueue(
                  sseData({ warning: "输出达到 token 上限，文档末尾可能不完整" })
                );
              }
            } catch {
              // skip malformed
            }
            return false;
          };
          const finishClean = () => {
            const tail = thinkStripper.flush();
            if (tail) controller.enqueue(sseData({ content: tail }));
            controller.enqueue(sseDone());
            controller.close();
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              if (handlePayload(trimmed.slice(6))) {
                finishClean();
                return;
              }
            }
          }

          // 上游无尾换行时，缓冲区可能残留一条完整事件
          const buffered = sseBuffer.trim();
          if (buffered.startsWith("data: ")) {
            if (handlePayload(buffered.slice(6))) {
              finishClean();
              return;
            }
          }

          // Flush any remaining buffered text (held back for <think...> detection)
          const tail = thinkStripper.flush();
          if (tail) controller.enqueue(sseData({ content: tail }));

          // 区分正常完成与异常截断：上游 EOF 但未给出 [DONE]/stop/length
          // 时属异常截断，保留已到达内容并明确警告，客户端不会当作成功完成
          if (!sawCleanEnd && !sawLengthLimit) {
            controller.enqueue(
              sseData({ warning: "模型输出流异常终止，内容可能不完整" })
            );
          }
          controller.enqueue(sseDone());
          controller.close();
        } catch (err: any) {
          if (clientSignal.aborted) return;
          // 读取中途网络异常：已送达内容按截断保留，不当作整体失败
          if (sentAnyContent) {
            const tail = thinkStripper.flush();
            if (tail) controller.enqueue(sseData({ content: tail }));
            controller.enqueue(
              sseData({ warning: "模型输出流异常终止，内容可能不完整" })
            );
          } else {
            controller.enqueue(sseData({ error: `改写出错: ${err.message}` }));
          }
          controller.enqueue(sseDone());
          controller.close();
        }
      },
      cancel() { upstreamAbort.abort(); },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "改写失败" }, { status: 500 });
  }
}
