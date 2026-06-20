import { NextResponse } from "next/server";
import { join } from "path";
import { homedir } from "os";

const AGENT_DIR = join(homedir(), ".pi", "agent");

const DEFAULT_ANALYZE_PROMPT =
  "你是一个专业的文字风格分析师。请仔细阅读以下文档，分析其写作风格，包括但不限于：语气（正式/口语/亲切/严谨）、用词特点、句式结构、段落组织、修辞手法、专业术语使用等。请用简洁的中文输出风格分析报告，使他人能根据这份报告模仿相同的风格进行写作。";

interface AnalyzeBody {
  text: string;
  analyzePrompt?: string;
}

/**
 * Resolve default LLM config from settings.json + models.json.
 */
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

// POST /api/doc-rewrite/analyze-style
export async function POST(req: Request) {
  try {
    const { text, analyzePrompt } = (await req.json()) as AnalyzeBody;
    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "参考文档内容太短（至少 50 字符），无法分析风格" },
        { status: 400 }
      );
    }

    const refText = text.length > 15000 ? text.slice(0, 15000) + "\n...(内容已截断)" : text;
    const sysPrompt = analyzePrompt?.trim() || DEFAULT_ANALYZE_PROMPT;

    const model = resolveDefaultModel();
    if (!model) {
      return NextResponse.json(
        { error: "未配置默认模型，请先在设置中配置" },
        { status: 500 }
      );
    }

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
          { role: "user", content: `请分析以下文档的写作风格：\n\n${refText}` },
        ],
        max_tokens: Math.min(model.maxTokens, 4096),
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => "");
      return NextResponse.json(
        { error: `LLM API 错误: ${llmRes.status} ${errText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const data = await llmRes.json();
    const content = data.choices?.[0]?.message?.content || "";
    return NextResponse.json({ profile: content });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "风格分析失败" },
      { status: 500 }
    );
  }
}
