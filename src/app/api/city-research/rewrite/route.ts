import { resolveDefaultModel } from "@/lib/llm-config";

interface RewriteBody {
  city?: string;
  sectionTitle?: string;
  text?: string;
  instruction?: string;
}

// POST /api/city-research/rewrite — stream a rewritten plain-text fragment.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as RewriteBody;
  const { city, sectionTitle, text, instruction } = body;

  const encoder = new TextEncoder();
  const sse = (obj: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  if (!text || typeof text !== "string") {
    return new Response(sse({ error: "缺少待重写的文本" }), { status: 400, headers: sseHeaders });
  }

  const model = resolveDefaultModel();
  if (!model) {
    return new Response(sse({ error: "未配置默认模型，请先在设置中配置 API Key 和默认模型。" }), {
      status: 500,
      headers: sseHeaders,
    });
  }
  if (model.api !== "openai-completions") {
    return new Response(sse({ error: `当前模型使用 ${model.api} API，暂不支持。请切换到 OpenAI 兼容模型。` }), {
      status: 500,
      headers: sseHeaders,
    });
  }

  const systemPrompt = `你是一位专业的城市研究报告编辑，负责重写用户给出的文本片段。
要求：
- 仅输出重写后的纯文本，不要输出任何解释、前后缀、markdown 标记或引号
- 保持专业、严谨、客观的城市研究文风
- 不得编造数据，原文中的事实与数据必须保留
- 篇幅与原文相近（±20%）
${sectionTitle ? `- 当前所在章节：《${sectionTitle}》\n` : ""}${city ? `- 研究对象：${city}` : ""}`;

  const userPrompt = instruction?.trim()
    ? `重写要求：${instruction.trim()}\n\n原文：\n${text}`
    : `请优化以下片段的表达（更通顺、更专业、更凝练），保留所有事实与数据：\n\n${text}`;

  const stream = new ReadableStream({
    async start(controller) {
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
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: true,
            max_tokens: 2000,
            temperature: 0.6,
          }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!llmRes.ok || !llmRes.body) {
          const errText = await llmRes.text().catch(() => "");
          controller.enqueue(
            sse({ error: `LLM 错误: HTTP ${llmRes.status} ${errText.slice(0, 200)}` })
          );
          controller.close();
          return;
        }

        const reader = llmRes.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let inThink = false;
        let textBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue;

            try {
              const chunk = JSON.parse(payload);
              const content = chunk.choices?.[0]?.delta?.content || "";
              if (!content) continue;

              textBuffer += content;

              // Strip <think>...</think> the same way the main route does.
              let cleaned = "";
              let processLimit = 100;
              while (textBuffer.length > 0 && processLimit-- > 0) {
                if (inThink) {
                  const closeIdx = textBuffer.indexOf("</think>");
                  if (closeIdx >= 0) {
                    textBuffer = textBuffer.slice(closeIdx + 8);
                    inThink = false;
                  } else {
                    textBuffer = "";
                    break;
                  }
                } else {
                  const openIdx = textBuffer.indexOf("<think>");
                  if (openIdx >= 0) {
                    cleaned += textBuffer.slice(0, openIdx);
                    textBuffer = textBuffer.slice(openIdx + 7);
                    inThink = true;
                  } else {
                    const safeLen = Math.max(0, textBuffer.length - 7);
                    cleaned += textBuffer.slice(0, safeLen);
                    textBuffer = textBuffer.slice(safeLen);
                    break;
                  }
                }
              }

              if (cleaned) {
                controller.enqueue(sse({ content: cleaned }));
              }
            } catch {
              /* skip malformed chunk */
            }
          }
        }

        if (textBuffer && !inThink) {
          controller.enqueue(sse({ content: textBuffer }));
        }
        controller.close();
      } catch (err: any) {
        controller.enqueue(sse({ error: `重写失败: ${err?.message ?? String(err)}` }));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
