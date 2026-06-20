import { NextResponse } from "next/server";

// ── 1688 API ──────────────────────────────────────────────────────────

const API_1688 = "https://ainext.1688.com/1688claw/industrySkill/textSearch";

async function search1688(query: string, itemCount: number = 20): Promise<any[]> {
  const res = await fetch(API_1688, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, itemCount }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`1688 API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data || [];
}

// ── SKU helpers ────────────────────────────────────────────────────────

const INVALID_SKU_KEYWORDS = [
  "定制", "咨询客服", "请联系", "定金", "预定", "预订", "押金", "补差价",
  "具体咨询", "联系客服",
];

interface SkuItem {
  skuName: string;
  price: number;
  itemTitle: string;
  itemId: number;
  sellerName: string;
  itemDetailUrl: string;
}

function isInvalidSku(skuName: string, itemPrice: any): boolean {
  if (!itemPrice) return true;
  if (INVALID_SKU_KEYWORDS.some((k) => skuName?.includes(k))) return true;
  return false;
}

function extractValidSkus(
  items: any[],
  targetPrice?: number,
  negatedItemIds?: Set<number>
): SkuItem[] {
  const skus: SkuItem[] = [];
  const priceLow = targetPrice ? targetPrice * 0.3 : 0;
  const priceHigh = targetPrice ? targetPrice * 1.5 : Infinity;

  for (const item of items) {
    if (negatedItemIds?.has(item.itemId)) continue;
    const skuList = item.skuList || [];
    for (const sku of skuList) {
      if (isInvalidSku(sku.skuName, sku.itemPrice)) continue;
      const price = parseFloat(sku.itemPrice);
      if (isNaN(price) || price <= 0) continue;
      if (targetPrice && (price < priceLow || price > priceHigh)) continue;
      skus.push({
        skuName: sku.skuName || "",
        price,
        itemTitle: item.itemTitle || "",
        itemId: item.itemId,
        sellerName: item.sellerName || "",
        itemDetailUrl: item.itemDetailUrl || "",
      });
    }
  }
  return skus;
}

// ── Parameter extraction (regex) ──────────────────────────────────────

const PARAM_PATTERNS: { type: string; patterns: RegExp[] }[] = [
  { type: "功率", patterns: [/(\d+\.?\d*)\s*[WwКw][Ww]?\b/, /(\d+\.?\d*)\s*(?:瓦|千瓦|kw|KW)/] },
  { type: "电压", patterns: [/(\d+\.?\d*)\s*[Vv]\b/, /(\d+)\s*伏/] },
  { type: "口径", patterns: [/DN(\d+)/, /(\d+)\s*[Mm][Mm]\b(?!³)/, /(\d+)\s*分\b/, /(\d+)\s*寸/] },
  { type: "流量", patterns: [/(\d+\.?\d*)\s*[Ll]\/[Hh]/, /(\d+\.?\d*)\s*[Mm]³\/[Hh]/, /(\d+\.?\d*)\s*[Tt]\/[Hh]/] },
  { type: "扬程", patterns: [/(\d+\.?\d*)\s*[Mm]\b(?!³|²|m|m\/)/] },
  { type: "型号", patterns: [/[A-Z]{2,4}[- ]?\d{1,4}/, /[A-Z]\d{2,3}/] },
  { type: "材质", patterns: [/(不锈钢|铸铁|铝合金|铜|PVC|PP|碳钢|镀锌|陶瓷|玻璃钢)/] },
  { type: "转速", patterns: [/(\d+)\s*[Rr][Pp][Mm]/, /(\d+)\s*转/] },
  { type: "压力", patterns: [/(\d+\.?\d*)\s*[Mm][Pp][Aa]/, /(\d+\.?\d*)\s*[Bb]ar/] },
  { type: "防护等级", patterns: [/IP(\d{2})/] },
];

function extractParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const { type, patterns } of PARAM_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        params[type] = match[0];
        break;
      }
    }
  }
  return params;
}

// ── Modifier extraction ───────────────────────────────────────────────

const NOISE_TOKENS = new Set([
  "厂家", "直销", "批发", "定制", "供应", "报价", "多少", "全新", "正品",
  "原装", "包邮", "特价", "促销", "热销", "库存", "清仓", "处理", "尾货",
  "一件代发", "支持", "不含", "包含", "带", "不带", "可选", "可定制",
  "厂家直销", "现货", "包邮", "新款", "热卖",
]);

function extractModifiers(skuNames: string[], coreKeyword: string): string[] {
  try {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    const coreSegments = new Set(
      [...segmenter.segment(coreKeyword)]
        .filter((s) => s.isWordLike)
        .map((s) => s.segment)
    );

    const tokenCount = new Map<string, number>();
    for (const name of skuNames) {
      const segments = [...segmenter.segment(name)]
        .filter((s) => s.isWordLike)
        .map((s) => s.segment);
      for (const seg of segments) {
        if (seg.length < 2) continue;
        if (coreSegments.has(seg)) continue;
        if (NOISE_TOKENS.has(seg)) continue;
        if (/^\d+$/.test(seg)) continue;
        tokenCount.set(seg, (tokenCount.get(seg) || 0) + 1);
      }
    }

    return [...tokenCount.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);
  } catch {
    // Fallback for environments without Intl.Segmenter
    const tokenCount = new Map<string, number>();
    for (const name of skuNames) {
      const tokens = name
        .split(/[\s\[【\]】\/\\|,，、+—\-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && t.length <= 12);
      for (const t of tokens) {
        if (NOISE_TOKENS.has(t)) continue;
        if (/^\d+$/.test(t)) continue;
        if (name.includes(coreKeyword) && t === coreKeyword) continue;
        tokenCount.set(t, (tokenCount.get(t) || 0) + 1);
      }
    }
    return [...tokenCount.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);
  }
}

function buildCollectQueries(category: string, modifiers: string[]): string[] {
  const core = rewriteKeyword(category);
  const queries = [core];

  if (modifiers.length >= 2) {
    const half = Math.ceil(modifiers.length / 2);
    queries.push(`${core} ${modifiers.slice(0, half).join(" ")}`);
    queries.push(`${core} ${modifiers.slice(half).join(" ")}`);
  } else {
    queries.push(`${core} 规格`);
    queries.push(`${core} 型号`);
  }

  return queries;
}

function buildSimilarQuery(category: string, params: Record<string, string>): string {
  const core = rewriteKeyword(category);
  const paramValues = Object.values(params).slice(0, 3);
  if (paramValues.length === 0) return core;
  return `${core} ${paramValues.join(" ")}`;
}

function rewriteKeyword(input: string): string {
  let cleaned = input
    .replace(/分析一下|帮我看看|帮我分析|价格|多少钱|有哪些|档次|区间|差异/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  return words.slice(0, 3).join(" ") || input;
}

// ── Dedup by itemId ────────────────────────────────────────────────────

function dedupItems(allItems: any[]): any[] {
  const seen = new Set<number>();
  return allItems.filter((item) => {
    if (seen.has(item.itemId)) return false;
    seen.add(item.itemId);
    return true;
  });
}

// ── Model resolution for AI report ────────────────────────────────────

function resolveDefaultModel(): {
  baseUrl: string;
  apiKey: string;
  modelId: string;
} | null {
  try {
    const fs = require("fs");
    const { join } = require("path");
    const { homedir } = require("os");
    const agentDir = join(homedir(), ".pi", "agent");
    const settingsPath = join(agentDir, "settings.json");
    const modelsPath = join(agentDir, "models.json");
    if (!fs.existsSync(settingsPath) || !fs.existsSync(modelsPath)) return null;
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const modelsConfig = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
    const provider = modelsConfig.providers?.[settings.defaultProvider];
    if (!provider || !provider.apiKey) return null;
    const model = provider.models?.find((m: any) => m.id === settings.defaultModel);
    return {
      baseUrl: provider.baseUrl || "https://api.openai.com/v1",
      apiKey: provider.apiKey,
      modelId: model?.id || provider.models?.[0]?.id,
    };
  } catch {
    return null;
  }
}

// ── Request types ──────────────────────────────────────────────────────

interface SearchBody {
  action: "search";
  category: string;
  targetPrice?: number;
  negatedItemIds?: number[];
}

interface CollectBody {
  action: "collect";
  confirmedCategory: string;
  targetPrice?: number;
  negatedItemIds?: number[];
  phase0Items?: any[];
}

interface SimilarBody {
  action: "similar";
  targetSku: SkuItem;
  confirmedCategory: string;
  targetPrice?: number;
  negatedItemIds?: number[];
}

interface ReportBody {
  action: "report";
  confirmedCategory: string;
  targetPrice?: number;
  targetSku: SkuItem;
  similarSkus: SkuItem[];
  paramProfile: Record<string, string>;
}

type PriceAnalyzerBody = SearchBody | CollectBody | SimilarBody | ReportBody;

// ── POST handler ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PriceAnalyzerBody;

    switch (body.action) {
      case "search":
        return handleSearch(body);
      case "collect":
        return handleCollect(body);
      case "similar":
        return handleSimilar(body);
      case "report":
        return handleReport(body);
      default:
        return NextResponse.json(
          { error: `未知操作: ${(body as any).action}` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

// ── Phase 0: Search & Confirm ──────────────────────────────────────────

async function handleSearch(body: SearchBody) {
  const { category, targetPrice, negatedItemIds } = body;

  if (!category?.trim()) {
    return NextResponse.json({ error: "请输入品类关键词" }, { status: 400 });
  }

  const query = rewriteKeyword(category.trim());
  const items = await search1688(query, 20);
  const negSet = new Set(negatedItemIds || []);
  const allSkus = extractValidSkus(items, undefined, negSet);
  const filteredSkus = targetPrice
    ? allSkus.filter(
        (s) => s.price >= targetPrice * 0.3 && s.price <= targetPrice * 1.5
      )
    : allSkus;

  // Sort by price ASC for Phase 0 display
  filteredSkus.sort((a, b) => a.price - b.price);

  const priceRange =
    filteredSkus.length > 0
      ? { min: filteredSkus[0].price, max: filteredSkus[filteredSkus.length - 1].price }
      : null;

  const warning =
    targetPrice && filteredSkus.length < 5
      ? `目标价格 ¥${targetPrice} 附近仅找到 ${filteredSkus.length} 个 SKU，可能偏离市场价。建议调整目标价格。`
      : null;

  return NextResponse.json({
    query,
    skus: filteredSkus,
    totalSkus: filteredSkus.length,
    totalItems: items.length,
    allValidSkus: allSkus.length,
    priceRange,
    warning,
  });
}

// ── Phase 1: Multi-round Collection ────────────────────────────────────

async function handleCollect(body: CollectBody) {
  const { confirmedCategory, targetPrice, negatedItemIds, phase0Items } = body;

  if (!confirmedCategory?.trim()) {
    return NextResponse.json({ error: "请提供确认的品类关键词" }, { status: 400 });
  }

  const negSet = new Set(negatedItemIds || []);

  // Extract modifiers from Phase 0 items for dynamic query generation
  let skuNames: string[] = [];
  if (phase0Items && phase0Items.length > 0) {
    skuNames = phase0Items
      .flatMap((item: any) => (item.skuList || []).map((s: any) => s.skuName || ""))
      .filter(Boolean);
  }

  // If no Phase 0 items, do a quick search to get SKU names
  if (skuNames.length < 5) {
    try {
      const quickItems = await search1688(rewriteKeyword(confirmedCategory), 20);
      skuNames = quickItems
        .flatMap((item: any) => (item.skuList || []).map((s: any) => s.skuName || ""))
        .filter(Boolean);
    } catch {
      // continue with what we have
    }
  }

  const modifiers = extractModifiers(skuNames, confirmedCategory);
  const queries = buildCollectQueries(confirmedCategory, modifiers);

  // Execute 3 rounds of search
  const allItems: any[] = [];
  for (const q of queries) {
    try {
      const items = await search1688(q, 20);
      allItems.push(...items);
    } catch {
      // continue with next round
    }
  }

  // Dedup + exclude negated items
  const deduped = dedupItems(allItems).filter((i) => !negSet.has(i.itemId));

  // Extract valid SKUs (with optional price filtering)
  const allSkus = extractValidSkus(deduped);
  const filteredSkus = targetPrice
    ? allSkus.filter(
        (s) => s.price >= targetPrice * 0.3 && s.price <= targetPrice * 1.5
      )
    : allSkus;

  // Sort by price proximity to target
  if (targetPrice) {
    filteredSkus.sort((a, b) => Math.abs(a.price - targetPrice) - Math.abs(b.price - targetPrice));
  } else {
    filteredSkus.sort((a, b) => a.price - b.price);
  }

  const priceRange =
    filteredSkus.length > 0
      ? {
          min: Math.min(...filteredSkus.map((s) => s.price)),
          max: Math.max(...filteredSkus.map((s) => s.price)),
        }
      : null;

  return NextResponse.json({
    skus: filteredSkus,
    totalSkus: filteredSkus.length,
    totalItems: deduped.length,
    queries,
    priceRange,
    modifiers,
  });
}

// ── Phase 2: Similar SKU Discovery ───────────────────────────────────

async function handleSimilar(body: SimilarBody) {
  const { targetSku, confirmedCategory, targetPrice, negatedItemIds } = body;

  if (!targetSku) {
    return NextResponse.json({ error: "未提供目标 SKU" }, { status: 400 });
  }

  const negSet = new Set(negatedItemIds || []);
  negSet.add(targetSku.itemId);

  // Extract parameters from target SKU
  const params = extractParams(targetSku.skuName);

  // Build search query with parameters
  const query = buildSimilarQuery(confirmedCategory, params);
  let items: any[] = [];
  try {
    items = await search1688(query, 20);
  } catch {
    // if parameter query fails, try basic query
    try {
      items = await search1688(rewriteKeyword(confirmedCategory), 20);
    } catch {
      // empty
    }
  }

  // Extract valid SKUs
  const allSkus = extractValidSkus(items, targetPrice, negSet);

  // Filter out same itemId as target
  const filtered = allSkus.filter((s) => s.itemId !== targetSku.itemId);

  // Supplier dedup: same sellerName → keep closest to target price
  const supplierMap = new Map<string, SkuItem>();
  const refPrice = targetPrice || targetSku.price;
  for (const sku of filtered) {
    const existing = supplierMap.get(sku.sellerName);
    if (!existing || Math.abs(sku.price - refPrice) < Math.abs(existing.price - refPrice)) {
      supplierMap.set(sku.sellerName, sku);
    }
  }

  const similarSkus = [...supplierMap.values()];

  // Sort by proximity to target price
  similarSkus.sort(
    (a, b) => Math.abs(a.price - refPrice) - Math.abs(b.price - refPrice)
  );

  // Take top 10
  const result = similarSkus.slice(0, 10);

  return NextResponse.json({
    skus: result,
    query,
    paramProfile: params,
    totalItems: items.length,
    totalSellers: supplierMap.size,
  });
}

// ── Phase 3: Report Generation ─────────────────────────────────────────

async function handleReport(body: ReportBody) {
  const { confirmedCategory, targetPrice, targetSku, similarSkus, paramProfile } = body;

  if (!targetSku) {
    return NextResponse.json({ error: "未提供目标 SKU" }, { status: 400 });
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const priceLow = targetPrice ? (targetPrice * 0.3).toFixed(2) : "—";
  const priceHigh = targetPrice ? (targetPrice * 1.5).toFixed(2) : "—";
  const priceDiff = targetPrice
    ? (targetSku.price - targetPrice).toFixed(2)
    : "—";

  let md = `# ${confirmedCategory}询价报告\n\n`;
  md += `> 数据来源：1688 工业品平台 | 采集时间：${dateStr}\n\n`;

  md += `## 一、品类概述\n\n`;
  md += `- 确认品类：「${confirmedCategory}」\n`;
  if (targetPrice) {
    md += `- 目标价格：¥${targetPrice.toFixed(2)}（范围：¥${priceLow} ~ ¥${priceHigh}）\n`;
  }
  md += `\n`;

  md += `## 二、目标 SKU 详情\n\n`;
  md += `| 字段 | 详情 |\n|------|------|\n`;
  md += `| SKU 名称 | ${targetSku.skuName} |\n`;
  md += `| 价格 | ¥${targetSku.price.toFixed(2)} |\n`;
  if (targetPrice) {
    md += `| 与目标价差 | ${Number(priceDiff) >= 0 ? "+" : ""}¥${priceDiff} |\n`;
  }
  md += `| 商品名称 | ${targetSku.itemTitle} |\n`;
  md += `| 厂家/卖家 | ${targetSku.sellerName} |\n`;
  md += `| 产品链接 | ${targetSku.itemDetailUrl} |\n\n`;

  // Parameter profile
  const paramEntries = Object.entries(paramProfile || {});
  if (paramEntries.length > 0) {
    md += `**参数画像：** ${paramEntries.map(([k, v]) => `${k}: ${v}`).join("、")}\n\n`;
  }

  // Similar SKUs table
  if (similarSkus && similarSkus.length > 0) {
    md += `## 三、同类 SKU 对比（不同供应商）\n\n`;
    md += `| # | SKU 名称 | 价格 | 供应商 | 链接 |\n`;
    md += `|---|---------|------|--------|------|\n`;
    similarSkus.forEach((sku, i) => {
      const link = sku.itemDetailUrl ? `[查看](${sku.itemDetailUrl})` : "—";
      md += `| ${i + 1} | ${sku.skuName} | ¥${sku.price.toFixed(2)} | ${sku.sellerName} | ${link} |\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;
  md += `*以上价格为 1688 批发价，实际零售/工程采购价会有上浮，具体以供应商报价为准。*\n`;

  // Optional: AI recommendations
  const model = resolveDefaultModel();
  if (model) {
    try {
      const skuSummary =
        similarSkus?.map((s) => `- ${s.skuName} ¥${s.price.toFixed(2)}（${s.sellerName}）`).join("\n") || "";

      const sysPrompt = `你是专业工业品采购顾问。基于以下 SKU 数据，给出 3-5 条简洁的选购建议。不要使用 markdown 格式，不要使用列表符号。直接输出纯文本建议。`;
      const userMsg =
        `品类：${confirmedCategory}\n` +
        (targetPrice ? `目标价格：¥${targetPrice.toFixed(2)}\n` : "") +
        `目标 SKU：${targetSku.skuName} ¥${targetSku.price.toFixed(2)}（${targetSku.sellerName}）\n\n` +
        `同类 SKU：\n${skuSummary}\n\n请给出选购建议。`;

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
          max_tokens: 1024,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (llmRes.ok) {
        const data = await llmRes.json();
        let recommendations = data.choices?.[0]?.message?.content || "";
        recommendations = recommendations
          .replace(/<think[\s\S]*?<\/think>/gi, "")
          .trim();
        if (recommendations) {
          md += `\n## 四、选购建议\n\n${recommendations}\n`;
        }
      }
    } catch {
      // AI failed, skip recommendations
    }
  }

  return NextResponse.json({
    markdown: md,
    filename: `${confirmedCategory}询价报告.md`,
  });
}
