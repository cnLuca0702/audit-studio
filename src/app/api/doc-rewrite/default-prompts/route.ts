import { NextResponse } from "next/server";

const DEFAULT_ANALYZE_PROMPT =
  "你是一个专业的文字风格分析师。请仔细阅读以下文档，分析其写作风格，包括但不限于：语气（正式/口语/亲切/严谨）、用词特点、句式结构、段落组织、修辞手法、专业术语使用等。请用简洁的中文输出风格分析报告，使他人能根据这份报告模仿相同的风格进行写作。";

const DEFAULT_REWRITE_PROMPT = `你是一位专业的文档改写专家。请将用户提供的文档按照指定的文字风格进行改写。

改写要求：
1. 严格遵循下面的风格描述来改写文档
2. 保持原文的核心意思和结构不变
3. 保持原文的专业术语和关键信息准确
4. 只输出改写后的文档，不要添加任何解释或说明

文字风格描述：
{{styleProfile}}

{{requirements}}`;

// GET /api/doc-rewrite/default-prompts
export async function GET() {
  return NextResponse.json({
    analyzePrompt: DEFAULT_ANALYZE_PROMPT,
    rewritePrompt: DEFAULT_REWRITE_PROMPT,
  });
}
