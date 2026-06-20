import { NextResponse } from "next/server";
import { join } from "path";
import { homedir } from "os";

const AGENT_DIR = join(homedir(), ".pi", "agent");

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

function resolveDefaultModel(): {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  maxTokens: number;
} | null {
  try {
    const fs = require("fs");
    const settingsPath = join(AGENT_DIR, "settings.json");
    const modelsPath = join(AGENT_DIR, "models.json");
    if (!fs.existsSync(settingsPath) || !fs.existsSync(modelsPath)) return null;
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const modelsConfig = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
    const defaultProvider = settings.defaultProvider;
    const defaultModelId = settings.defaultModel;
    if (!defaultProvider || !defaultModelId) return null;
    const provider = modelsConfig.providers?.[defaultProvider];
    if (!provider) return null;
    const baseUrl = provider.baseUrl || "https://api.openai.com/v1";
    const apiKey = provider.apiKey || "";
    if (!apiKey) return null;
    const model = provider.models?.find((m: any) => m.id === defaultModelId);
    const maxTokens = model?.maxTokens ?? 16384;
    const modelId = model?.id ?? provider.models?.[0]?.id;
    if (!modelId) return null;
    return { baseUrl, apiKey, modelId, maxTokens };
  } catch {
    return null;
  }
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
                { role: "system", content: sysPrompt },
                { role: "user", content: userMsg },
              ],
              stream: true,
              max_tokens: model.maxTokens,
              temperature: 0.7,
            }),
            signal: AbortSignal.timeout(300_000),
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
              if (payload === "[DONE]") {
                controller.enqueue(sseDone());
                controller.close();
                return;
              }
              try {
                const chunk = JSON.parse(payload);
                const content = chunk.choices?.[0]?.delta?.content || "";
                if (content) {
                  textBuffer += content;

                  // Strip <think>...</think> blocks
                  let cleaned = "";
                  let processLimit = 100;
                  const thinkOpen = "<" + "think>";
                  const thinkClose = "</" + "think>";
                  while (textBuffer.length > 0 && processLimit-- > 0) {
                    if (inThink) {
                      const closeIdx = textBuffer.indexOf(thinkClose);
                      if (closeIdx >= 0) {
                        textBuffer = textBuffer.slice(closeIdx + thinkClose.length);
                        inThink = false;
                      } else {
                        textBuffer = "";
                        break;
                      }
                    } else {
                      const openIdx = textBuffer.indexOf(thinkOpen);
                      if (openIdx >= 0) {
                        cleaned += textBuffer.slice(0, openIdx);
                        textBuffer = textBuffer.slice(openIdx + thinkOpen.length);
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
                    controller.enqueue(sseData({ content: cleaned }));
                  }
                }
                if (chunk.choices?.[0]?.finish_reason === "stop") {
                  // Flush any remaining buffered text before closing
                  if (textBuffer) {
                    controller.enqueue(sseData({ content: textBuffer }));
                    textBuffer = "";
                  }
                  controller.enqueue(sseDone());
                  controller.close();
                  return;
                }
                // finish_reason === "length" means max_tokens hit — flush buffer and warn
                if (chunk.choices?.[0]?.finish_reason === "length") {
                  if (textBuffer) {
                    controller.enqueue(sseData({ content: textBuffer }));
                    textBuffer = "";
                  }
                  controller.enqueue(sseData({ warning: "输出达到 token 上限，文档末尾可能不完整" }));
                }
              } catch {
                // skip malformed
              }
            }
          }

          // Flush any remaining buffered text (held back for <think...> detection)
          if (textBuffer) {
            controller.enqueue(sseData({ content: textBuffer }));
            textBuffer = "";
          }

          controller.enqueue(sseDone());
          controller.close();
        } catch (err: any) {
          controller.enqueue(sseData({ error: `改写出错: ${err.message}` }));
          controller.enqueue(sseDone());
          controller.close();
        }
      },
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
