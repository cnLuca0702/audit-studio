/**
 * DOCX 导出（服务端专用）：清稿与真实修订两种模式。
 *
 * - 基础版式：A4、四边 2.54cm 页边距、微软雅黑 12pt、1.5 倍行距、段后 6pt；
 *   纯文本按 LF 拆分段落，不猜测表格/标题/编号。
 * - 修订模式：服务端自行重算 diff（不信任客户端 token），用 docx 库的
 *   InsertedTextRun / DeletedTextRun / 段落标记插入删除生成真实 w:ins/w:del。
 *   每个 LF 对应逻辑段落边界：段落拆分/合并、整段增删、空段与末尾换行
 *   均以段落标记修订表达；每个修订节点持有包内唯一整数 ID，业务操作
 *   UUID 与修订 ID 清单写入文档自定义属性。
 *
 * 范围声明：本应用仅保存提取的纯文本；不保留、也不宣称保留上传 DOCX 的
 * 原始排版/表格/既有修订，导出为本应用新生成的标准排版文档。
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  InsertedTextRun,
  DeletedTextRun,
} from "docx";
import type { ParagraphChild } from "docx";
import { buildDiffDocument, normalizeLineEndings } from "./doc-diff";
import type { DiffToken } from "./doc-diff";

export interface RevisionExportMeta {
  id: string;
  kind: "full" | "partial";
  createdAt: number;
  summary: string;
}

const REVISION_AUTHOR = "AuditStudio";
/** A4 纵向，四边 2.54cm（1440 twips） */
const BASE_PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
} as const;
/** 微软雅黑 12pt（24 半磅）、1.5 倍行距（360）、段后 6pt（120） */
const BASE_STYLES = {
  default: {
    document: {
      run: { font: "Microsoft YaHei", size: 24 },
      paragraph: { spacing: { line: 360, after: 120 } },
    },
  },
} as const;

/** 按行拆分；结尾若为分隔符边界则去掉末尾空片 */
function toLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function plainParagraph(line: string): Paragraph {
  return new Paragraph({
    children: line ? [new TextRun({ text: line })] : [],
  });
}

/** 清稿导出：LF 拆段，纯文本 + 共用基础版式 */
export async function buildCleanDocx(content: string): Promise<Buffer> {
  const doc = new Document({
    styles: BASE_STYLES,
    sections: [
      {
        properties: { page: BASE_PAGE },
        children: toLines(normalizeLineEndings(content)).map(plainParagraph),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/**
 * 修订导出：服务端重算 before→after diff 并生成真实修订标记。
 * 输入校验由调用方（路由）完成；此处假定输入为合法非空字符串。
 */
export async function buildRevisionDocx(
  beforeRaw: string,
  afterRaw: string,
  meta: RevisionExportMeta
): Promise<{ buffer: Buffer; revisionIds: number[] }> {
  const before = normalizeLineEndings(beforeRaw);
  const after = normalizeLineEndings(afterRaw);
  const diff = buildDiffDocument(before, after);
  const dateIso = new Date(meta.createdAt).toISOString();

  let nextRevId = 1001;
  const revisionIds: number[] = [];
  const rev = () => {
    const id = nextRevId++;
    revisionIds.push(id);
    return { id, author: REVISION_AUTHOR, date: dateIso };
  };

  const children: Paragraph[] = [];

  /** 整段插入/删除：每行一个段落，内容 run 与段落标记同为修订 */
  const pushMarkedParagraphs = (text: string, inserted: boolean) => {
    for (const line of toLines(text)) {
      const mark = inserted ? { insertion: rev() } : { deletion: rev() };
      const runs: ParagraphChild[] = line
        ? [
            inserted
              ? new InsertedTextRun({ text: line, ...rev() })
              : new DeletedTextRun({ text: line, ...rev() }),
          ]
        : [];
      children.push(new Paragraph({ children: runs, run: mark }));
    }
  };

  /**
   * 替换块：分层配对保证常规替换为 1 旧行 ↔ 1 新行；token 内容部分
   * 转为同段 del/ins/普通 run。行尾分隔符差异（段落边界增删）不在此
   * 生成空段：中间边界由相邻段落自身的插入/删除标记承载；文档末尾的
   * 幻影空段在块循环结束后统一处理。
   * 多行替换块（超预算回退）与 token 校验失败时按整段增删处理。
   */
  const pushReplaceBlock = (
    blockOldText: string,
    blockNewText: string,
    tokens: readonly DiffToken[]
  ) => {
    const oldLines = toLines(blockOldText);
    const newLines = toLines(blockNewText);
    if (oldLines.length !== 1 || newLines.length !== 1) {
      pushMarkedParagraphs(blockOldText, false);
      pushMarkedParagraphs(blockNewText, true);
      return;
    }
    const oldLine = oldLines[0];
    const newLine = newLines[0];

    const runs: ParagraphChild[] = [];
    let consumedOld = 0;
    let consumedNew = 0;
    for (const t of tokens) {
      let text = t.text;
      if (text.endsWith("\n")) text = text.slice(0, -1);
      if (!text) continue;
      if (t.type === "equal") {
        runs.push(new TextRun({ text }));
        consumedOld += text.length;
        consumedNew += text.length;
      } else if (t.type === "delete") {
        runs.push(new DeletedTextRun({ text, ...rev() }));
        consumedOld += text.length;
      } else {
        runs.push(new InsertedTextRun({ text, ...rev() }));
        consumedNew += text.length;
      }
    }
    // token 未精确覆盖两侧行内容时按整段增删兜底（保证文本无损）
    if (consumedOld !== oldLine.length || consumedNew !== newLine.length) {
      pushMarkedParagraphs(blockOldText, false);
      pushMarkedParagraphs(blockNewText, true);
      return;
    }
    children.push(new Paragraph({ children: runs }));
  };

  for (const block of diff.blocks) {
    if (block.type === "equal") {
      for (const line of toLines(after.slice(block.newStart, block.newEnd))) {
        children.push(plainParagraph(line));
      }
    } else if (block.type === "insert") {
      pushMarkedParagraphs(after.slice(block.newStart, block.newEnd), true);
    } else if (block.type === "delete") {
      pushMarkedParagraphs(before.slice(block.oldStart, block.oldEnd), false);
    } else {
      pushReplaceBlock(
        before.slice(block.oldStart, block.oldEnd),
        after.slice(block.newStart, block.newEnd),
        block.tokens
      );
    }
  }

  // 文档末尾幻影空段：文本以 \n 结尾意味着存在最后一个空段落。
  // 两侧都有 → 普通空段；仅 after 有 → 段落标记插入；仅 before 有 → 标记删除。
  const afterEndsWithSep = after.length > 0 && after.endsWith("\n");
  const beforeEndsWithSep = before.length > 0 && before.endsWith("\n");
  if (afterEndsWithSep && beforeEndsWithSep) {
    children.push(new Paragraph({ children: [] }));
  } else if (afterEndsWithSep) {
    children.push(new Paragraph({ children: [], run: { insertion: rev() } }));
  } else if (beforeEndsWithSep) {
    children.push(new Paragraph({ children: [], run: { deletion: rev() } }));
  }

  const doc = new Document({
    styles: BASE_STYLES,
    features: { trackRevisions: true },
    customProperties: [
      { name: "rewriteOperationId", value: meta.id },
      { name: "rewriteOperationKind", value: meta.kind },
      { name: "rewriteOperationAt", value: dateIso },
      { name: "rewriteOperationSummary", value: meta.summary.slice(0, 200) },
      { name: "revisionIds", value: revisionIds.join(",") },
      { name: "revisionAuthor", value: REVISION_AUTHOR },
    ],
    sections: [{ properties: { page: BASE_PAGE }, children }],
  });
  const buffer = await Packer.toBuffer(doc);
  return { buffer, revisionIds };
}
