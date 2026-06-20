import { NextResponse } from "next/server";
import { join } from "path";
import { homedir } from "os";
import { resolveDefaultModel } from "@/lib/llm-config";

const AGENT_DIR = join(homedir(), ".pi", "agent");

interface ResearchBody {
  city: string;
  searchDepth?: "quick" | "standard" | "deep";
}

/**
 * Build the system prompt for city research report.
 */
function buildCityResearchPrompt(): string {
  return `你是一位专业的城市研究专家，擅长撰写深度城市调研报告。你的报告必须严格按照以下9章结构撰写：

## 报告框架（必须严格按此顺序）

1. 区域概况与战略定位
2. 两小时交通圈与区域协同分析
3. 人口结构与社情特征
4. 经济发展与产业布局
5. 城市更新与空间优化
6. 房地产市场与居住生态
7. 公共服务与民生保障
8. 城市定位与发展建议（文化/商业/旅游/产业四层面）
9. 发展展望与实施路径

## 文字风格规范

**严禁事项：**
- 禁止使用条目式/列表符号/分点编号（章节标题除外）
- 禁止使用表格呈现/使用"|"符号
- 禁止使用 emoji 表情符号
- 禁止空洞表述/堆砌术语/夸张浮夸

**数字规范：**
- 所有数字使用阿拉伯数字，不使用汉字数字
- 百分比使用%符号
- 金额单位统一为元、万元、亿元
- 面积单位统一为平方米、亩、平方公里

**推荐用词：**
- 动词：深耕、主导、构建、整合、打通、聚焦、深化、推进、实施、完善
- 形容词：扎实、完整、精准、协同、持续、深入、全面、显著、突出
- 名词：底层逻辑、核心价值、全链条、业务闭环、落地路径、承载区、集聚区

**语言特点：**
- 专业性：术语准确、逻辑严密、避免口语化
- 稳重性：客观陈述、数据说话、不夸张
- 说服力：结构清晰、论证充分、结论有力
- 实践性：具体案例、量化成果、可落地

**段落结构：**
- 主题句 → 支撑内容（案例/数据） → 承转衔接
- 段落间逻辑递进，连贯流畅
- 每段长度控制在 150-300 字

## 报告要求

1. 每章内容 800-1500 字
2. 总报告 10000-15000 字
3. 数据要具体（人口数、GDP、房价、学校数等）
4. 分析要深入（因果关系、发展趋势、竞争优势）
5. 建议要可操作（结合两小时交通圈、资源禀赋）

重要：始终使用中文输出报告。`;
}

/**
 * Build the user message for the LLM.
 */
function buildUserMessage(city: string, searchData?: string[]): string {
  let dataSection = "";
  if (searchData && searchData.length > 0) {
    dataSection = `\n## 实时搜索数据（优先使用以下数据撰写报告）\n\n${searchData.join("\n---\n")}\n`;
  }

  return `请对"${city}"进行深度调研，撰写一份完整的城市研究报告。
${dataSection}
## 要求
1. 严格按9章框架撰写，每章800-1500字
2. ${searchData && searchData.length > 0 ? "优先使用上述搜索数据，缺失数据请用你的知识补充并标注'[估算]'" : "包含具体数据（人口、GDP、房价、交通、产业、教育、医疗等）"}
3. ${searchData && searchData.length > 0 ? "搜索数据之间若存在冲突，以政府官方来源为准" : "分析深入，建议可操作"}
4. 遵守文字风格规范（无列表、无表格、无emoji）
请开始撰写报告。`;
}

/**
 * Search the web using the configured search API.
 * Returns search result snippets as Markdown, or empty string on failure.
 */
async function searchWeb(query: string): Promise<string> {
  const fs = require("fs");
  const settingsPath = join(AGENT_DIR, "settings.json");
  if (!fs.existsSync(settingsPath)) return "";

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const provider = settings.searchApiProvider || "";
    const apiKey = settings.searchApiKey || "";
    if (!provider || !apiKey) return "";

    const encoded = encodeURIComponent(query);

    if (provider === "serpapi") {
      const res = await fetch(
        `https://serpapi.com/search?engine=google&q=${encoded}&api_key=${encodeURIComponent(apiKey)}&hl=zh-CN&gl=cn`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) return "";
      const data = await res.json();
      const results = data.organic_results || [];
      return results.slice(0, 5)
        .map((r: any) => `- **${r.title || ""}**\n  ${r.snippet || ""}\n  来源: ${r.link || ""}`)
        .join("\n\n");
    }

    if (provider === "brave") {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=5`,
        {
          headers: {
            "Accept": "application/json",
            "X-Subscription-Token": apiKey,
            "Accept-Language": "zh-CN",
          },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!res.ok) return "";
      const data = await res.json();
      const results = data.web?.results || [];
      return results.slice(0, 5)
        .map((r: any) => `- **${r.title || ""}**\n  ${r.description || ""}\n  来源: ${r.url || ""}`)
        .join("\n\n");
    }

    if (provider === "tavily") {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          max_results: 5,
          search_depth: "advanced",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return "";
      const data = await res.json();
      const results = data.results || [];
      return results.slice(0, 5)
        .map((r: any) => `- **${r.title || ""}**\n  ${r.content || ""}\n  来源: ${r.url || ""}`)
        .join("\n\n");
    }

    if (provider === "bing") {
      const res = await fetch(
        `https://api.bing.microsoft.com/v7.0/search?q=${encoded}&count=5&mkt=zh-CN`,
        {
          headers: {
            "Ocp-Apim-Subscription-Key": apiKey,
          },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!res.ok) return "";
      const data = await res.json();
      const results = data.webPages?.value || [];
      return results.slice(0, 5)
        .map((r: any) => `- **${r.name || ""}**\n  ${r.snippet || ""}\n  来源: ${r.url || ""}`)
        .join("\n\n");
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * Build phased search queries based on city name and search depth.
 * Phase mapping follows the comprehensive-city-research skill's 6 data-collection phases.
 */
function buildPhaseQueries(city: string, depth: "quick" | "standard" | "deep"): [string, string[]][] {
  const allPhases: [string, string[]][] = [
    ["区域概况与战略定位", [
      `${city} 行政区划 面积 人口 地理`,
      `${city} 战略定位 城市群 发展规划`,
    ]],
    ["人口结构与社情特征", [
      `${city} 第七次人口普查 数据`,
      `${city} 常住人口 2024 年龄结构`,
    ]],
    ["经济发展与产业布局", [
      `${city} GDP 2024 统计公报`,
      `${city} 主导产业 园区 招商引资`,
    ]],
    ["交通与区域协同", [
      `${city} 高铁 高速公路 交通网络`,
      `${city} 两小时交通圈 覆盖城市 人口`,
    ]],
    ["房地产市场与居住生态", [
      `${city} 房价 2024 2025 均价`,
      `${city} 新房 二手房 价格走势`,
    ]],
    ["公共服务与民生保障", [
      `${city} 教育 学校 学位 医疗`,
      `${city} 医院 养老 公共服务`,
    ]],
  ];

  const count = depth === "quick" ? 3 : depth === "standard" ? 5 : 6;
  return allPhases.slice(0, count);
}

// GET /api/city-research — SSE streaming (for EventSource)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city") || "";
  const searchDepth = (searchParams.get("searchDepth") || "standard") as "quick" | "standard" | "deep";

  if (!city) {
    return NextResponse.json(
      { error: "city is required" },
      { status: 400 }
    );
  }

  return runResearch(city, searchDepth);
}

// POST /api/city-research — streaming city research
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ResearchBody;
    const { city, searchDepth = "standard" } = body;

    if (!city || typeof city !== "string") {
      return NextResponse.json(
        { error: "city is required" },
        { status: 400 }
      );
    }

    return runResearch(city, searchDepth);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}

// Shared research logic
function runResearch(city: string, searchDepth: "quick" | "standard" | "deep"): Response {
  const encoder = new TextEncoder();

  function sseEvent(event: string, data: any): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Phase 1: Real web search across multiple phases
        controller.enqueue(
          sseEvent("phase", { phase: "collecting", message: "正在收集城市数据..." })
        );

        const phases = buildPhaseQueries(city, searchDepth);
        const allSearchData: string[] = [];
        let completedPhases = 0;
        const searchConfigured = (() => {
          try {
            const fs = require("fs");
            const settingsPath = join(AGENT_DIR, "settings.json");
            if (!fs.existsSync(settingsPath)) return false;
            const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
            return !!(settings.searchApiProvider && settings.searchApiKey);
          } catch { return false; }
        })();

        if (searchConfigured) {
          for (const [label, queries] of phases) {
            controller.enqueue(
              sseEvent("progress", {
                message: `正在搜索：${label}`,
                category: label,
                progress: Math.round((completedPhases / phases.length) * 100),
              })
            );

            const results = await Promise.allSettled(queries.map((q) => searchWeb(q)));
            for (const r of results) {
              if (r.status === "fulfilled" && r.value) {
                allSearchData.push(r.value);
              }
            }
            completedPhases++;
          }

          if (allSearchData.length === 0) {
            controller.enqueue(
              sseEvent("warning", {
                message: "搜索未返回数据，将基于知识库生成报告。建议检查搜索 API Key 是否正确。",
              })
            );
          }
        } else {
          // No search API configured — send warning and skip search
          controller.enqueue(
            sseEvent("warning", {
              message: "未配置搜索 API Key，将基于知识库生成报告。可在「设置 → 搜索配置」中配置以获取实时数据。",
            })
          );
        }

        controller.enqueue(
          sseEvent("data", {
            city,
            stats: {
              chapters: 9,
              estimatedLength: "10000-15000字",
              depth: searchDepth,
              searchResults: allSearchData.length,
            },
          })
        );

        // Phase 2: LLM report generation
        const model = resolveDefaultModel();

        if (!model) {
          controller.enqueue(
            sseEvent("fail", {
              error: "未配置默认模型，无法生成调研报告。请先在设置中配置 API Key 和默认模型。",
            })
          );
          controller.enqueue(sseEvent("done", { report: "" }));
          controller.close();
          return;
        }

        if (model.api !== "openai-completions") {
          controller.enqueue(
            sseEvent("fail", {
              error: `当前模型使用 ${model.api} API，暂不支持。请切换到 OpenAI 兼容的模型。`,
            })
          );
          controller.enqueue(sseEvent("done", { report: "" }));
          controller.close();
          return;
        }

        controller.enqueue(
          sseEvent("phase", { phase: "analyzing", message: "正在生成调研报告..." })
        );

        try {
          const systemPrompt = buildCityResearchPrompt();
          const userMessage = buildUserMessage(city, allSearchData.length > 0 ? allSearchData : undefined);

          const timeout = searchDepth === "quick" ? 180_000 : searchDepth === "standard" ? 300_000 : 600_000;

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
                { role: "user", content: userMessage },
              ],
              stream: true,
              max_tokens: 16000,
              temperature: 0.7,
            }),
            signal: AbortSignal.timeout(timeout),
          });

          if (!llmRes.ok || !llmRes.body) {
            const errText = await llmRes.text().catch(() => "");
            throw new Error(`LLM API 错误: HTTP ${llmRes.status} - ${errText.slice(0, 300)}`);
          }

          const reader = llmRes.body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";
          let fullReport = "";
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

                fullReport += content;
                textBuffer += content;

                // Strip <think>...</think> from textBuffer
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
                  controller.enqueue(sseEvent("text", { content: cleaned }));
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }

          // Flush remaining
          if (textBuffer && !inThink) {
            controller.enqueue(sseEvent("text", { content: textBuffer }));
          }

          controller.enqueue(sseEvent("done", { report: fullReport }));
        } catch (err: any) {
          controller.enqueue(
            sseEvent("fail", { error: `报告生成失败: ${err.message}` })
          );
          controller.enqueue(sseEvent("done", { report: "" }));
        }

        controller.close();
      } catch (err: any) {
        controller.enqueue(
          sseEvent("fail", { error: `研究失败: ${err.message}` })
        );
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
}
