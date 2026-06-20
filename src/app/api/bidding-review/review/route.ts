import { resolveDefaultModel } from "@/lib/llm-config";
import { normalizeReviewResult } from "@/lib/bidding-report";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/** Read the default knowledge base (reference.md) text. */
function readDefaultKB(): string {
  const candidates = [
    join(process.cwd(), ".qoder", "skills", "bidding-review", "reference.md"),
    join(homedir(), ".pi", "agent", "skills", "bidding-review", "reference.md"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return readFileSync(p, "utf-8");
    } catch {
      /* try next */
    }
  }
  return "";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return text.slice(0, head) + `\n…[中间内容已省略约 ${text.length - max} 字]…\n` + text.slice(-tail);
}

const SYSTEM_PROMPT = `你是一名中国建设工程招标文件合规审查专家。严格依据下方【法律条文参考库】进行审查。

【法律条文参考库】
{{REFERENCE}}

【风险等级判定（刚性约束）】
- high（高风险）：有具体法条明确禁止，且招标文件条款与之直接冲突
- medium（中风险）：法律有原则性规定但不够具体，或条款表述存在歧义可能导致违规后果
- low（低风险）：法律法规无强制性规定，但从实操角度存在隐患
刚性约束：法律有明确约定且内容未违反、仅属于操作性风险的，一律不得定为 medium 及以上。

【报价敏感度计算公式】（仅"评标办法"章节需要）
- 基准价 = 有效投标人报价的算术平均值
- K =（投标人报价 - 基准价）/ 基准价 × 100%
- 报价高于基准价：每高 1% 扣 2 分；低于基准价：每低 1% 扣 1 分
- 1 分对应金额 = 基准价 × 1%
- 必须给出 3 家、4 家、5 家投标人三种情景（scenario 依次为 A/B/C）

【输出强约束】
只输出一个 JSON 对象，禁止输出任何解释文字、markdown 标记、代码块标记或思考过程。
JSON 必须严格符合如下结构（字段名、层级、枚举值不得偏差）：

{
  "cover": {
    "label": "Bidding Document Review Report",
    "title": "招标文件关键信息提取\\n及合规性审查报告",
    "subtitle": "项目名称 / 项目类型",
    "meta": { "tenderNo": "招标编号", "tenderer": "招标人", "agency": "招标代理", "version": "文件版本" }
  },
  "sections": [
    // 恰好 9 个元素，numIndex 依次 1..9，title 依次为：
    // 1 项目基本信息 / 2 招标内容与范围 / 3 预算与报价要求 / 4 投标人资格条件 /
    // 5 评标办法 / 6 废标与否决投标条款 / 7 投标保证金与履约担保 / 8 合同主要条款 / 9 其他重点关注问题
    { "numIndex": 1, "title": "项目基本信息",
      "infoTable": [ { "label": "项目名称", "value": "..." }, ...至少包含: 项目名称/招标人/招标代理/审批文件/资金来源/建设地点/建设规模/计划工期/质量标准/招标方式/保密要求/投标有效期/开标地点 ] },
    { "numIndex": 2, "title": "招标内容与范围", "intro": "...", "opinions": [ opinion, ... ] },
    { "numIndex": 3, "title": "预算与报价要求", "infoTable": [ kv, ... ], "intro": "...", "opinions": [ opinion, ... ] },
    { "numIndex": 4, "title": "投标人资格条件", "infoTable": [ kv, ... ], "opinions": [ opinion, ... ] },
    { "numIndex": 5, "title": "评标办法",
      "infoTable": [ kv, ... ], "intro": "...",
      "sensitivity": {
        "intro": "基于评分公式，以工程总投资为参考的测算说明",
        "rows": [ { "scenario": "A", "bidders": "3家", "priceRange": "...", "baseline": "...", "perPoint": "...", "highDeduct": "...", "lowDeduct": "..." }, ...共3行 ],
        "formulaNotes": [ "评分公式说明多条", ... ],
        "findings": [ "关键发现1", "关键发现2", "关键发现3" ]
      },
      "opinions": [ opinion, ... ] },
    { "numIndex": 6, "title": "废标与否决投标条款", "paragraphs": [ "否决情形段落", "废标情形段落", "重新招标情形段落" ], "opinions": [ opinion, ... ] },
    { "numIndex": 7, "title": "投标保证金与履约担保", "infoTable": [ kv, ... ], "opinions": [ opinion, ... ] },
    { "numIndex": 8, "title": "合同主要条款", "infoTable": [ kv, ... ], "opinions": [ opinion, ... ] },
    { "numIndex": 9, "title": "其他重点关注问题", "intro": "...", "opinions": [ opinion, ... ] }
  ],
  "summary": { "overall": "对整份招标文件合规性的总体评估段落" }
}

其中 kv = { "label": string, "value": string }；
opinion = { "risk": "high"|"medium"|"low", "title": "问题标题", "description": "问题描述（事实+分析+影响）", "sourceRef": "条款号 + 原文关键表述", "violatedLaw": "法名+条款号+条文内容" }
要求：high 与 medium 风险意见必须填写 sourceRef 和 violatedLaw；low 风险可省略这两个字段。
语言：简体中文，正式书面语，无 emoji，无 markdown 标记，无列表符号。`;

function buildUserPrompt(documentText: string, knowledgeBases: string[]): string {
  const kb = knowledgeBases.filter((k) => k && k.trim());
  const kbSection = kb.length
    ? `【附加知识库（用户提供的补充审查资料）】\n${kb.join("\n\n---\n\n")}\n\n`
    : "";
  return `${kbSection}【招标文件全文】\n${documentText}\n\n只输出上述 JSON 对象本身，不要任何其他文字。`;
}

interface ReviewBody {
  documentText?: string;
  knowledgeBases?: string[];
}

// POST /api/bidding-review/review — streaming review (SSE: phase / done / fail)
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ReviewBody;
  const documentText = typeof body.documentText === "string" ? body.documentText : "";
  const knowledgeBases: string[] = Array.isArray(body.knowledgeBases)
    ? body.knowledgeBases.filter((k) => typeof k === "string" && k.trim())
    : [];

  const encoder = new TextEncoder();
  const sse = (obj: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  if (!documentText.trim()) {
    return new Response(sse({ error: "缺少招标文件文本" }), { status: 400, headers: sseHeaders });
  }

  const model = resolveDefaultModel();
  if (!model) {
    return new Response(
      sse({ error: "未配置默认模型，请先在设置中配置 API Key 和默认模型。" }),
      { status: 500, headers: sseHeaders }
    );
  }
  if (model.api !== "openai-completions") {
    return new Response(
      sse({ error: `当前模型使用 ${model.api} API，暂不支持。请切换到 OpenAI 兼容模型。` }),
      { status: 500, headers: sseHeaders }
    );
  }

  const reference = readDefaultKB();
  const systemPrompt = SYSTEM_PROMPT.replace(
    "{{REFERENCE}}",
    reference || "（默认法律参考库未加载，请依据你掌握的招标投标法律法规审查）"
  );
  const userPrompt = buildUserPrompt(
    truncate(documentText, 60000),
    knowledgeBases.slice(0, 2).map((k) => truncate(k, 20000))
  );

  const baseRequestBody = {
    model: model.modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    temperature: 0.2,
    max_tokens: 8000,
  };

  const doFetch = async (withJsonFormat: boolean) =>
    fetch(`${model.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify(
        withJsonFormat
          ? { ...baseRequestBody, response_format: { type: "json_object" } }
          : baseRequestBody
      ),
      signal: AbortSignal.timeout(300_000),
    });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(sse(obj));
      try {
        send({ phase: "extracting", message: "正在提取招标文件关键信息…" });
        send({
          phase: "reviewing",
          message: "正在进行合规性审查与报价敏感度分析（通常需要 1-3 分钟）…",
        });

        let llmRes = await doFetch(true);
        if (!llmRes.ok) {
          // some providers reject response_format — retry without it
          llmRes = await doFetch(false);
        }

        if (!llmRes.ok || !llmRes.body) {
          const errText = await llmRes.text().catch(() => "");
          send({ error: `LLM 错误: HTTP ${llmRes.status} ${errText.slice(0, 300)}` });
          controller.close();
          return;
        }

        const data = await llmRes.json();
        const raw: string = data?.choices?.[0]?.message?.content || "";

        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]);
            } catch {
              parsed = null;
            }
          }
        }

        if (!parsed || typeof parsed !== "object") {
          send({ error: "模型未返回合法 JSON。原始片段：" + raw.slice(0, 500) });
          controller.close();
          return;
        }

        const result = normalizeReviewResult(parsed);
        send({ phase: "done", message: "审查完成" });
        send({ result });
        controller.close();
      } catch (err: any) {
        send({ error: `审查失败: ${err?.message ?? String(err)}` });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
