import { NextResponse } from "next/server";
import { join } from "path";
import { homedir } from "os";

const AGENT_DIR = join(homedir(), ".pi", "agent");

const DEFAULT_MERGE_PROMPT = `你是一位专业的文档整合专家。请根据以下要求完成文档合并：

## 任务
根据主文档的框架体系和内容结构，将辅助文档的相关内容整合进去，生成一份完整的文档初稿。

## 要求
- 保持主文档的章节结构、排版风格和行文语气
- 按照每份辅助文档的使用提示词，提取或整合对应内容
- 整合时注意逻辑连贯性，不要简单拼接
- 如果辅助文档的内容与主文档某章节高度相关，优先整合到该章节中
- 输出纯文本格式，不要使用任何 Markdown 标记（不要用 #、*、-、> 等符号）
- 只输出合并后的文档正文，不要在输出前后添加任何解释、说明、总结或提示
- 禁止输出  标签及其内容

{{mergePrompt}}

## 主文档（确定框架和风格）
{{mainText}}

## 辅助文档
{{auxDocsSection}}`;

interface AuxDocInput {
  text: string;
  fileName?: string;
  prompt: string;
}

interface MergeRequestBody {
  mainText: string;
  mainFileName?: string;
  auxDocs: AuxDocInput[];
  mergePrompt?: string;
  includeMainAsAux?: boolean;
  mainAsAuxPrompt?: string;
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

// POST /api/doc-merge/stream — SSE stream document merge
export async function POST(req: Request) {
  try {
    const {
      mainText,
      mainFileName,
      auxDocs,
      mergePrompt,
      includeMainAsAux,
      mainAsAuxPrompt,
    } = (await req.json()) as MergeRequestBody;

    if (!mainText?.trim()) {
      return NextResponse.json({ error: "请上传主文档" }, { status: 400 });
    }
    if (!auxDocs || auxDocs.length === 0) {
      return NextResponse.json({ error: "请至少添加一份辅助文档" }, { status: 400 });
    }

    const model = resolveDefaultModel();
    if (!model) {
      return NextResponse.json(
        { error: "未配置默认模型，无法合并" },
        { status: 500 }
      );
    }

    // Build aux docs section
    let auxIndex = 0;
    const auxParts: string[] = [];

    if (includeMainAsAux) {
      auxParts.push(
        `### 辅助文档 ${auxIndex}：${mainFileName || "主文档"}（作为内容素材）\n使用提示词：${mainAsAuxPrompt || "提取核心框架、关键论点和行文风格"}\n内容：\n${mainText}`
      );
      auxIndex++;
    }

    for (const doc of auxDocs) {
      if (!doc.text?.trim()) continue;
      const name = doc.fileName || `辅助文档 ${auxIndex}`;
      auxParts.push(
        `### 辅助文档 ${auxIndex}：${name}\n使用提示词：${doc.prompt || "整合相关内容"}\n内容：\n${doc.text}`
      );
      auxIndex++;
    }

    const auxDocsSection = auxParts.join("\n\n");

    const sysPrompt = DEFAULT_MERGE_PROMPT
      .replace("{{mergePrompt}}",
        mergePrompt?.trim() ? `用户额外要求：\n${mergePrompt.trim()}` : ""
      )
      .replace("{{mainText}}", mainText)
      .replace("{{auxDocsSection}}", auxDocsSection);

    const userMsg = `请按照上述要求完成文档合并，输出合并后的完整文档。`;

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

                  // Strip <think>... blocks
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
                  if (textBuffer) {
                    controller.enqueue(sseData({ content: textBuffer }));
                    textBuffer = "";
                  }
                  controller.enqueue(sseDone());
                  controller.close();
                  return;
                }
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

          if (textBuffer) {
            controller.enqueue(sseData({ content: textBuffer }));
            textBuffer = "";
          }

          controller.enqueue(sseDone());
          controller.close();
        } catch (err: any) {
          controller.enqueue(sseData({ error: `合并出错: ${err.message}` }));
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
    return NextResponse.json({ error: err?.message || "合并失败" }, { status: 500 });
  }
}
