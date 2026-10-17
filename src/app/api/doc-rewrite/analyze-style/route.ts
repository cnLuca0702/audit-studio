import { resolveDefaultModel } from "@/lib/llm-config";
import { NextResponse } from "next/server";

const DEFAULT_ANALYZE_PROMPT =
  "你是一个专业的文字风格分析师。请仔细阅读以下文档，分析其写作风格，包括但不限于：语气（正式/口语/亲切/严谨）、用词特点、句式结构、段落组织、修辞手法、专业术语使用等。请用简洁的中文输出风格分析报告，使他人能根据这份报告模仿相同的风格进行写作。";

interface AnalyzeBody {
  text: string;
  analyzePrompt?: string;
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
