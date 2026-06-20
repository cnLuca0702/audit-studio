import { STANDALONE_STYLE } from "@/components/city-report-styles";

export interface Paragraph {
  /** Position-based id: `${sectionNum}-p${index}`. Stable across edits. */
  id: string;
  text: string;
}

export interface Section {
  num: string; // zero-padded, e.g. "01"
  title: string;
  paragraphs: Paragraph[];
}

export interface Cover {
  title: string;
  subtitle: string;
  metaLines: string[];
  dateLabel: string;
}

export interface ParsedReport {
  cover: Cover;
  sections: Section[];
}

const SUBTITLE =
  "区域概况 / 交通圈层 / 人口社情 / 经济产业 / 空间更新 / 房产市场 / 公共服务 / 发展建议";
const CN_NUMS = "一二三四五六七八九十";

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** Strip inline markdown formatting → plain text (keeps the words, drops marks). */
export function stripInlineMarkdown(s: string): string {
  return s
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

interface ParsedHeading {
  level: number; // '#' count; 0 for a bare numbered heading (no '#')
  hasOrder: boolean; // starts with "1." / "一、" etc.
  title: string;
}

function parseHeading(line: string): ParsedHeading | null {
  const s = line.trim();
  if (!s) return null;

  const m = s.match(/^(#{1,6})\s+(.*)$/);
  if (m) {
    const level = m[1].length;
    const rest = m[2];
    const hasOrder =
      /^\d+[.、)]\s*/.test(rest) || new RegExp(`^[${CN_NUMS}]+、\\s*`).test(rest);
    const title = stripInlineMarkdown(
      rest
        .replace(/^\d+[.、)]\s*/, "")
        .replace(new RegExp(`^[${CN_NUMS}]+、\\s*`), "")
    ).trim();
    return { level, hasOrder, title };
  }

  // Bare numbered heading, no '#': short line like "1. 区域概况" / "一、标题".
  // Length guard avoids mistaking body sentences that start with a year/digit.
  const orderMatch = s.match(/^(\d+[.、)]\s*|[一二三四五六七八九十]+、\s*)(.*)$/);
  if (orderMatch && s.length <= 30) {
    const title = stripInlineMarkdown(orderMatch[2]).trim();
    return { level: 0, hasOrder: true, title };
  }

  return null;
}

export function buildCover(city: string, date: Date = new Date()): Cover {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const dateLabel = `${y}年${m}月`;
  return {
    title: `关于${city}的深度城市研究报告`,
    subtitle: SUBTITLE,
    metaLines: [
      "报告类型：城市研究与发展分析",
      `研究区域：${city}`,
      `报告日期：${dateLabel}`,
    ],
    dateLabel,
  };
}

/**
 * Parse a (possibly messy) markdown report into structured sections.
 * Each paragraph is plain text so the DOM renders a single text node —
 * required for stable selection offsets during editing.
 */
export function parseReportSections(
  md: string,
  city: string,
  date: Date = new Date()
): ParsedReport {
  const cover = buildCover(city, date);
  const text = md.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const sections: Section[] = [];
  let cur: Section | null = null;
  let paraBuf: string[] = [];
  let titleSkipped = false; // a leading single-'#' title (no chapter order) is the report title, not a chapter

  const flushPara = () => {
    if (paraBuf.length === 0 || !cur) {
      paraBuf = [];
      return;
    }
    const joined = paraBuf.join(" ").replace(/\s+/g, " ").trim();
    const cleaned = stripInlineMarkdown(joined);
    if (cleaned) {
      cur.paragraphs.push({ id: `${cur.num}-p${cur.paragraphs.length}`, text: cleaned });
    }
    paraBuf = [];
  };

  for (const line of lines) {
    const h = parseHeading(line);
    if (h) {
      flushPara();
      // The document's top-level title (single '#' with no chapter order) is
      // NOT one of the 9 chapters — skip it so the TOC lists only real sections.
      if (!titleSkipped && h.level === 1 && !h.hasOrder) {
        titleSkipped = true;
        cur = null;
        continue;
      }
      if (!h.title) continue;
      cur = { num: pad2(sections.length + 1), title: h.title, paragraphs: [] };
      sections.push(cur);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    if (/^\s*[-=_*]{3,}\s*$/.test(line)) {
      flushPara();
      continue;
    }
    paraBuf.push(line.trim());
  }
  flushPara();

  // Fallback: nothing recognised as a heading → one section, split by blank lines.
  if (sections.length === 0) {
    const paras: Paragraph[] = [];
    for (const chunk of text.split(/\n{2,}/)) {
      const t = stripInlineMarkdown(chunk.replace(/\n/g, " ").trim());
      if (t) paras.push({ id: `01-p${paras.length}`, text: t });
    }
    sections.push({
      num: "01",
      title: `${city}研究报告`,
      paragraphs: paras.length ? paras : [{ id: "01-p0", text: text.trim() }],
    });
  }

  return { cover, sections };
}

/** Serialize an (possibly edited) report back to markdown — used for copy / docx. */
export function serializeToMarkdown(report: ParsedReport): string {
  const out: string[] = [`# ${report.cover.title}`, ""];
  for (const s of report.sections) {
    out.push(`## ${s.num} ${s.title}`, "");
    for (const p of s.paragraphs) out.push(p.text, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build a self-contained HTML document (for download) using the original A4 CSS. */
export function buildFullTemplateHTML(report: ParsedReport): string {
  const { cover, sections } = report;

  const coverHtml = `  <div class="cover">
    <div class="cover-label">Deep City Research Report</div>
    <h1>${escapeHTML(cover.title)}</h1>
    <div class="subtitle">${escapeHTML(cover.subtitle)}</div>
    <div class="cover-meta">
      ${cover.metaLines.map((l) => escapeHTML(l)).join("<br>")}
    </div>
  </div>`;

  const tocHtml = `  <div class="toc">
    <h2>目 录</h2>
    <ul class="toc-list">
${sections
  .map(
    (s) =>
      `      <li><span class="toc-title">${escapeHTML(s.title)}</span><span class="toc-dots"></span></li>`
  )
  .join("\n")}
    </ul>
  </div>`;

  const sectionsHtml = sections
    .map(
      (s) => `    <div class="section">
      <div class="section-header">
        <span class="section-num">${escapeHTML(s.num)}</span>
        <span class="section-title">${escapeHTML(s.title)}</span>
      </div>
${s.paragraphs.map((p) => `      <p>${escapeHTML(p.text)}</p>`).join("\n")}
    </div>`
    )
    .join("\n");

  const footerHtml = `  <div class="footer">
    ${escapeHTML(cover.title)} &mdash; ${escapeHTML(cover.dateLabel)}
  </div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(cover.title)}</title>
<style>
${STANDALONE_STYLE}
</style>
</head>
<body>
<div class="page-wrapper">
${coverHtml}
${tocHtml}
  <div class="content">

${sectionsHtml}

  </div>
${footerHtml}
</div>
</body>
</html>`;
}

/** "城市研究: 杭州" → "杭州" (handles : and ：). */
export function extractCity(appName: string): string {
  for (const sep of [":", "："]) {
    const idx = appName.indexOf(sep);
    if (idx >= 0) {
      const city = appName.slice(idx + 1).trim();
      if (city) return city;
    }
  }
  return appName.trim();
}
