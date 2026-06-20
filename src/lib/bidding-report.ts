import { STANDALONE_STYLE } from "@/components/bidding-report-styles";

/* ===== Types ===== */

export type RiskLevel = "high" | "medium" | "low";

export interface KV {
  label: string;
  value: string;
}

export interface ReviewOpinion {
  risk: RiskLevel;
  title: string;
  description: string;
  sourceRef?: string;
  violatedLaw?: string;
}

export interface SensitivityRow {
  scenario: string;
  bidders: string;
  priceRange: string;
  baseline: string;
  perPoint: string;
  highDeduct: string;
  lowDeduct: string;
}

export interface Sensitivity {
  intro: string;
  rows: SensitivityRow[];
  formulaNotes: string[];
  findings: string[];
}

export interface Section {
  num: string; // 中文序号 "一".."九"
  numIndex: number; // 1..9
  title: string;
  intro?: string;
  infoTable?: KV[];
  paragraphs?: string[];
  opinions?: ReviewOpinion[];
  sensitivity?: Sensitivity;
}

export interface BiddingReviewResult {
  cover: {
    label: string;
    title: string;
    subtitle: string;
    meta: {
      tenderNo?: string;
      tenderer: string;
      agency?: string;
      version?: string;
      generatedDate: string;
    };
  };
  sections: Section[];
  summary: { high: number; medium: number; low: number; overall: string };
}

/* ===== Helpers ===== */

const CN_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const SECTION_TITLES = [
  "项目基本信息",
  "招标内容与范围",
  "预算与报价要求",
  "投标人资格条件",
  "评标办法",
  "废标与否决投标条款",
  "投标保证金与履约担保",
  "合同主要条款",
  "其他重点关注问题",
];

const RISK_CLASS: Record<RiskLevel, string> = {
  high: "risk-high",
  medium: "risk-medium",
  low: "risk-low",
};
const RISK_LABEL: Record<RiskLevel, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

export function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeOpinion(o: any): ReviewOpinion | null {
  if (!o || typeof o !== "object") return null;
  const risk: RiskLevel =
    o.risk === "high" || o.risk === "medium" || o.risk === "low" ? o.risk : "low";
  const title = str(o.title);
  const description = str(o.description);
  if (!title && !description) return null;
  const out: ReviewOpinion = {
    risk,
    title: title || "审查意见",
    description,
  };
  const sourceRef = str(o.sourceRef);
  const violatedLaw = str(o.violatedLaw);
  if (sourceRef) out.sourceRef = sourceRef;
  if (violatedLaw) out.violatedLaw = violatedLaw;
  return out;
}

function normalizeSensitivity(s: any): Sensitivity {
  const rows: SensitivityRow[] = Array.isArray(s?.rows)
    ? s.rows.map((r: any) => ({
        scenario: str(r?.scenario),
        bidders: str(r?.bidders),
        priceRange: str(r?.priceRange),
        baseline: str(r?.baseline),
        perPoint: str(r?.perPoint),
        highDeduct: str(r?.highDeduct),
        lowDeduct: str(r?.lowDeduct),
      }))
    : [];
  return {
    intro: str(s?.intro),
    rows,
    formulaNotes: Array.isArray(s?.formulaNotes)
      ? s.formulaNotes.filter((n: any) => typeof n === "string" && n.trim())
      : [],
    findings: Array.isArray(s?.findings)
      ? s.findings.filter((n: any) => typeof n === "string" && n.trim())
      : [],
  };
}

function normalizeCover(c: any): BiddingReviewResult["cover"] {
  const meta = c?.meta || {};
  const now = new Date();
  const generatedDate = str(meta.generatedDate) || `${now.getFullYear()}年${now.getMonth() + 1}月`;
  return {
    label: str(c?.label) || "Bidding Document Review Report",
    title: str(c?.title) || "招标文件关键信息提取\n及合规性审查报告",
    subtitle: str(c?.subtitle),
    meta: {
      tenderNo: str(meta.tenderNo) || undefined,
      tenderer: str(meta.tenderer) || "—",
      agency: str(meta.agency) || undefined,
      version: str(meta.version) || undefined,
      generatedDate,
    },
  };
}

/** Validate / fill an LLM-produced result so the renderer always has 9 well-formed sections. */
export function normalizeReviewResult(raw: any): BiddingReviewResult {
  const rawSections = Array.isArray(raw?.sections) ? raw.sections : [];
  const sections: Section[] = [];
  for (let i = 0; i < 9; i++) {
    const rs = rawSections[i] || {};
    const infoTable: KV[] | undefined = Array.isArray(rs.infoTable)
      ? rs.infoTable
          .filter((kv: any) => kv && typeof kv.label === "string")
          .map((kv: any) => ({ label: str(kv.label), value: str(kv.value) || "—" }))
      : undefined;
    const opinions: ReviewOpinion[] | undefined = Array.isArray(rs.opinions)
      ? rs.opinions.map(normalizeOpinion).filter(Boolean)
      : undefined;
    const paragraphs: string[] | undefined = Array.isArray(rs.paragraphs)
      ? rs.paragraphs.filter((p: any) => typeof p === "string" && p.trim())
      : undefined;
    const sec: Section = {
      num: CN_NUMS[i],
      numIndex: i + 1,
      title: str(rs.title) || SECTION_TITLES[i],
    };
    const intro = str(rs.intro);
    if (intro) sec.intro = intro;
    if (infoTable && infoTable.length) sec.infoTable = infoTable;
    if (paragraphs && paragraphs.length) sec.paragraphs = paragraphs;
    if (opinions && opinions.length) sec.opinions = opinions;
    if (rs.sensitivity) sec.sensitivity = normalizeSensitivity(rs.sensitivity);
    sections.push(sec);
  }

  let high = 0;
  let medium = 0;
  let low = 0;
  for (const s of sections) {
    for (const o of s.opinions || []) {
      if (o.risk === "high") high++;
      else if (o.risk === "medium") medium++;
      else low++;
    }
  }

  return {
    cover: normalizeCover(raw?.cover),
    sections,
    summary: {
      high,
      medium,
      low,
      overall: str(raw?.summary?.overall),
    },
  };
}

/** Parse a stored history content string back into a normalized result. */
export function parseBiddingResult(content: string): BiddingReviewResult {
  try {
    return normalizeReviewResult(JSON.parse(content));
  } catch {
    return normalizeReviewResult({});
  }
}

/* ===== Serialization to standalone HTML ===== */

function renderOpinion(o: ReviewOpinion): string {
  let ref = "";
  if (o.sourceRef || o.violatedLaw) {
    const lines: string[] = [];
    if (o.sourceRef) lines.push(`<strong>原文索引：</strong>${escapeHTML(o.sourceRef)}`);
    if (o.violatedLaw) lines.push(`<strong>涉嫌违反：</strong>${escapeHTML(o.violatedLaw)}`);
    ref = `\n        <div class="source-ref">${lines.join("<br>")}</div>`;
  }
  return `      <div class="${RISK_CLASS[o.risk]}">
        <div class="risk-label">${RISK_LABEL[o.risk]}</div>
        <div class="opinion-title">${escapeHTML(o.title)}</div>
        <p>${escapeHTML(o.description)}</p>${ref}
      </div>`;
}

function renderSensitivity(sens: Sensitivity): string {
  if (!sens.rows.length && !sens.intro) return "";
  const rowsHtml = sens.rows
    .map(
      (r) =>
        `          <tr><td>${escapeHTML(r.scenario)}</td><td>${escapeHTML(r.bidders)}</td><td>${escapeHTML(
          r.priceRange
        )}</td><td>${escapeHTML(r.baseline)}</td><td>${escapeHTML(r.perPoint)}</td><td class="highlight-val">${escapeHTML(
          r.highDeduct
        )}</td><td class="highlight-val">${escapeHTML(r.lowDeduct)}</td></tr>`
    )
    .join("\n");
  const formulaHtml = sens.formulaNotes
    .map((n) => `        <p style="text-indent:0;">${escapeHTML(n)}</p>`)
    .join("\n");
  const findingsHtml = sens.findings.length
    ? `        <p style="text-indent:0;"><strong>关键发现：</strong></p>\n${sens.findings
        .map((f, i) => `        <p style="text-indent:0;">${i + 1}. ${escapeHTML(f)}</p>`)
        .join("\n")}`
    : "";
  return `      <div class="sensitivity-box">
        <div class="sens-title">报价敏感度分析：每1分对应的报价浮动值</div>
${sens.intro ? `        <p style="text-indent:0;">${escapeHTML(sens.intro)}</p>\n` : ""}        <table>
          <tr><th>情景</th><th>投标人数量</th><th>假设报价区间</th><th>基准价（估算）</th><th>1%对应金额</th><th>高1分扣对应</th><th>低1分扣对应</th></tr>
${rowsHtml}
        </table>
${formulaHtml}
${findingsHtml}
      </div>`;
}

function renderSection(s: Section): string {
  const parts: string[] = [];
  parts.push(`    <div class="section">
      <div class="section-header">
        <span class="section-num">${escapeHTML(s.num)}</span>
        <span class="section-title">${escapeHTML(s.title)}</span>
      </div>`);

  if (s.infoTable && s.infoTable.length) {
    parts.push(
      `      <table class="data-table">
${s.infoTable
  .map((kv) => `        <tr><th>${escapeHTML(kv.label)}</th><td>${escapeHTML(kv.value)}</td></tr>`)
  .join("\n")}
      </table>`
    );
  }

  if (s.intro) {
    parts.push(
      s.intro
        .split(/\n{2,}/)
        .map((p) => `      <p>${escapeHTML(p.trim())}</p>`)
        .join("\n")
    );
  }

  if (s.paragraphs && s.paragraphs.length) {
    parts.push(s.paragraphs.map((p) => `      <p>${escapeHTML(p)}</p>`).join("\n"));
  }

  // sensitivity before review opinions (matches template order for ch.5)
  if (s.sensitivity) parts.push(renderSensitivity(s.sensitivity));

  if (s.opinions && s.opinions.length) {
    parts.push(`      <div class="sub-header">审查意见</div>`);
    for (const o of s.opinions) parts.push(renderOpinion(o));
  }

  parts.push(`    </div>`);
  return parts.join("\n");
}

export function buildBiddingHTML(result: BiddingReviewResult): string {
  const { cover, sections } = result;
  const titleHtml = escapeHTML(cover.title).replace(/\n/g, "<br>");

  const metaLines: string[] = [];
  if (cover.meta.tenderNo) metaLines.push(`招标编号：${escapeHTML(cover.meta.tenderNo)}`);
  metaLines.push(`招 标 人：${escapeHTML(cover.meta.tenderer)}`);
  if (cover.meta.agency) metaLines.push(`招标代理：${escapeHTML(cover.meta.agency)}`);
  if (cover.meta.version) metaLines.push(`文件版本：${escapeHTML(cover.meta.version)}`);
  metaLines.push(`报告生成日期：${escapeHTML(cover.meta.generatedDate)}`);

  const toc = sections
    .map(
      (s) => `      <li><span class="toc-title">${escapeHTML(s.title)}</span><span class="toc-dots"></span></li>`
    )
    .join("\n");

  const content = sections.map(renderSection).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(cover.subtitle || cover.title)}</title>
<style>
${STANDALONE_STYLE}
</style>
</head>
<body>
<div class="page-wrapper">

  <div class="cover">
    <div class="cover-label">${escapeHTML(cover.label)}</div>
    <h1>${titleHtml}</h1>
    <div class="subtitle">${escapeHTML(cover.subtitle)}</div>
    <div class="cover-meta">
      ${metaLines.join("<br>\n      ")}
    </div>
  </div>

  <div class="toc">
    <h2>目 录</h2>
    <ul class="toc-list">
${toc}
    </ul>
  </div>

  <div class="content">

${content}

  </div>

  <div class="footer">
    招标文件合规性审查报告 &mdash; ${escapeHTML(cover.subtitle || cover.title)} &mdash; ${escapeHTML(
    cover.meta.generatedDate
  )}
  </div>

</div>
</body>
</html>`;
}
