/**
 * 文档改写 diff 纯函数库（无 DOM 依赖）。
 *
 * 分层计算（自上而下，每层有明确工作量预算，超限精确回退为整块增删）：
 * 1. 段落层：按行内容做 LCS 锚点（末段有无换行不影响对齐，分隔符独立成 token）；
 * 2. 变化 gap 内：字符 bigram 相似度 + 单调（保序）最大权配对，低相似段落保持
 *    整段增删，前方插入不会导致后续级联错配；
 * 3. 配对段落内：句子级锚点（中文句末标点切分）；
 * 4. 变化句段内：Intl.Segmenter('zh-CN') 词级 diff；夹在变化之间的细碎等价片段
 *    折入两侧变化（不跨句界/段界）。
 *
 * 所有 token 保留规范化文本中的绝对 UTF-16 起止位置，且满足：
 * equal+delete 依序拼接 === 原文，equal+insert 依序拼接 === 新文。
 */
import { diffArrays } from "diff";

export type DiffTokenType = "equal" | "insert" | "delete";

export interface DiffToken {
  type: DiffTokenType;
  text: string;
  /** 旧文绝对起点（UTF-16，下同）；insert token 为 undefined */
  oldStart?: number;
  oldEnd?: number;
  /** 新文绝对起点；delete token 为 undefined */
  newStart?: number;
  newEnd?: number;
}

export type DiffBlockType = "equal" | "replace" | "delete" | "insert";

export interface DiffBlock {
  id: string;
  type: DiffBlockType;
  /** true 时 UI 整块删除/新增展示，不做词级高亮 */
  coarse: boolean;
  /** 旧文绝对范围 [oldStart, oldEnd)，insert 块为空范围 */
  oldStart: number;
  oldEnd: number;
  /** 新文绝对范围 [newStart, newEnd)，delete 块为空范围 */
  newStart: number;
  newEnd: number;
  tokens: DiffToken[];
}

export interface DiffDocument {
  blocks: DiffBlock[];
  changeBlockIds: string[];
}

/** 工作量预算（集中命名，便于测试与调参） */
export const DIFF_BUDGETS = {
  /** 顶层行总数上限（两侧合计），超出整篇单块 coarse */
  maxTotalLines: 30000,
  /** 变化 gap 内每侧最大行数，超出整块 coarse */
  maxGapLines: 500,
  /** 段落配对候选矩阵最大单元数 (n*m)，超出整块 coarse */
  maxPairMatrixCells: 40000,
  /** 段落配对相似度阈值（字符 bigram Jaccard） */
  pairSimilarityThreshold: 0.34,
  /** 相似度比较的每行字符上限（仅比较用，展示不受影响） */
  simCharLimit: 2000,
  /** 单个配对段落的句子数上限（任一侧），超出整段 del+ins */
  maxSentencesPerPair: 400,
  /** 单个变化句段词级 token 上限（任一侧） */
  maxWordsPerSegment: 4000,
  /** 整篇累计词级 token 预算（两侧合计） */
  maxTotalWords: 40000,
} as const;

/** 兼容旧命名：词级 token 上限 */
export const DIFF_TOKEN_LIMIT = DIFF_BUDGETS.maxWordsPerSegment;
/** 视觉合并阈值：两侧都是变化时，长度不超过该值的等价片段折入变化 */
export const DIFF_FOLD_EQUAL_MAX_LEN = 2;

interface TextSlice {
  text: string;
  start: number;
  end: number;
}

/** 行单元：内容 + 行尾分隔符；分隔符独立处理，末段有无换行不影响锚点匹配 */
interface LineUnit {
  /** 行内容（不含换行） */
  text: string;
  /** 覆盖内容+分隔符的绝对范围 */
  start: number;
  end: number;
  /** 分隔符（"\n" 或文末 ""）的绝对范围 */
  sepStart: number;
  sepEnd: number;
}

function splitLines(text: string): LineUnit[] {
  const out: LineUnit[] = [];
  let i = 0;
  while (i < text.length) {
    const nl = text.indexOf("\n", i);
    const contentEnd = nl === -1 ? text.length : nl;
    const end = nl === -1 ? text.length : nl + 1;
    if (contentEnd === i && end === i) break;
    out.push({ text: text.slice(i, contentEnd), start: i, end, sepStart: contentEnd, sepEnd: end });
    i = end;
  }
  return out;
}

const zhSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });

/** 词级分词；Segmenter 不会拆开代理对，此处兜底保证覆盖全文 */
function segmentWords(text: string, base: number): TextSlice[] {
  const out: TextSlice[] = [];
  let pos = 0;
  for (const seg of zhSegmenter.segment(text)) {
    const s = seg.segment;
    if (!s) continue;
    out.push({ text: s, start: base + pos, end: base + pos + s.length });
    pos += s.length;
  }
  if (pos !== text.length) {
    out.push({ text: text.slice(pos), start: base + pos, end: base + text.length });
  }
  return out;
}

const SENTENCE_ENDERS = "。！？!?；;…";

/** 句子切分：句末标点（含连续标点）归属前句，绝对位置基于 base */
function splitSentences(text: string, base: number): TextSlice[] {
  const out: TextSlice[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!SENTENCE_ENDERS.includes(text[i])) continue;
    let j = i + 1;
    while (j < text.length && SENTENCE_ENDERS.includes(text[j])) j++;
    out.push({ text: text.slice(start, j), start: base + start, end: base + j });
    start = j;
    i = j - 1;
  }
  if (start < text.length) {
    out.push({ text: text.slice(start), start: base + start, end: base + text.length });
  }
  return out;
}

/** 字符 bigram 多重集 Jaccard 相似度（配对用，O(len)，无矩阵） */
function bigramSimilarity(aRaw: string, bRaw: string): number {
  const a = aRaw.length > DIFF_BUDGETS.simCharLimit ? aRaw.slice(0, DIFF_BUDGETS.simCharLimit) : aRaw;
  const b = bRaw.length > DIFF_BUDGETS.simCharLimit ? bRaw.slice(0, DIFF_BUDGETS.simCharLimit) : bRaw;
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const count = new Map<string, number>();
  let aTotal = 0;
  if (a.length === 1) {
    count.set(a, 1);
    aTotal = 1;
  } else {
    for (let i = 0; i + 1 < a.length; i++) {
      const g = a.slice(i, i + 2);
      count.set(g, (count.get(g) || 0) + 1);
      aTotal++;
    }
  }
  let bTotal = 0;
  let inter = 0;
  const bump = (g: string) => {
    const c = count.get(g) || 0;
    if (c > 0) {
      inter++;
      count.set(g, c - 1);
    }
  };
  if (b.length === 1) {
    bump(b);
    bTotal = 1;
  } else {
    for (let i = 0; i + 1 < b.length; i++) {
      bump(b.slice(i, i + 2));
      bTotal++;
    }
  }
  const union = aTotal + bTotal - inter;
  return union <= 0 ? 0 : inter / union;
}

function eqToken(text: string, oldStart: number, newStart: number): DiffToken {
  return {
    type: "equal",
    text,
    oldStart,
    oldEnd: oldStart + text.length,
    newStart,
    newEnd: newStart + text.length,
  };
}

function delToken(text: string, oldStart: number): DiffToken {
  return { type: "delete", text, oldStart, oldEnd: oldStart + text.length };
}

function insToken(text: string, newStart: number): DiffToken {
  return { type: "insert", text, newStart, newEnd: newStart + text.length };
}

function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

function containsSentenceBoundary(s: string): boolean {
  for (const ch of s) {
    if (SENTENCE_ENDERS.includes(ch) || ch === "\n") return true;
  }
  return false;
}

/**
 * 把夹在变化之间的细碎等价片段折算为“旧文删除 + 新文新增”各一份，
 * 两侧文本仍可无损重建。折算不跨句界/段界（含句末标点的等价片段不折）。
 */
function foldTinyEquals(tokens: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "equal") {
      out.push(t);
      continue;
    }
    const prev = out.length ? out[out.length - 1] : null;
    const next = i + 1 < tokens.length ? tokens[i + 1] : null;
    const betweenChanges =
      !!prev && prev.type !== "equal" && !!next && next.type !== "equal";
    const tiny =
      (t.text.length <= DIFF_FOLD_EQUAL_MAX_LEN && !containsSentenceBoundary(t.text)) ||
      (isBlank(t.text) && t.text.length <= 8 && !containsSentenceBoundary(t.text));
    if (betweenChanges && tiny) {
      out.push({ ...t, type: "delete" });
      out.push({ ...t, type: "insert" });
    } else {
      out.push(t);
    }
  }
  return out;
}

/** 合并相邻同类 token（要求位置连续），并做防御性校验 */
function mergeAdjacentTokens(tokens: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (const t of tokens) {
    const prev = out.length ? out[out.length - 1] : null;
    if (prev && prev.type === t.type) {
      if (t.type === "equal") {
        if (t.oldStart !== prev.oldEnd || t.newStart !== prev.newEnd) {
          out.push(t);
          continue;
        }
        prev.text += t.text;
        prev.oldEnd = t.oldEnd!;
        prev.newEnd = t.newEnd!;
      } else if (t.type === "delete") {
        if (t.oldStart !== prev.oldEnd) {
          out.push(t);
          continue;
        }
        prev.text += t.text;
        prev.oldEnd = t.oldEnd!;
      } else {
        if (t.newStart !== prev.newEnd) {
          out.push(t);
          continue;
        }
        prev.text += t.text;
        prev.newEnd = t.newEnd!;
      }
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

/** 累计词级工作量上下文 */
interface BudgetContext {
  wordsUsed: number;
}

/**
 * 对一个变化句段做词级 diff。超预算返回 null（调用方整段 del+ins）。
 */
function wordDiffRun(
  oldText: string,
  newText: string,
  oldBase: number,
  newBase: number,
  ctx: BudgetContext
): DiffToken[] | null {
  const oldWords = segmentWords(oldText, oldBase);
  const newWords = segmentWords(newText, newBase);
  if (
    oldWords.length > DIFF_BUDGETS.maxWordsPerSegment ||
    newWords.length > DIFF_BUDGETS.maxWordsPerSegment ||
    ctx.wordsUsed + oldWords.length + newWords.length > DIFF_BUDGETS.maxTotalWords
  ) {
    return null;
  }
  ctx.wordsUsed += oldWords.length + newWords.length;
  const parts = diffArrays(
    oldWords.map((w) => w.text),
    newWords.map((w) => w.text)
  );
  const tokens: DiffToken[] = [];
  let oi = 0;
  let ni = 0;
  for (const part of parts) {
    const n = part.count;
    if (part.added) {
      for (let k = 0; k < n; k++) {
        const w = newWords[ni + k];
        tokens.push(insToken(w.text, w.start));
      }
      ni += n;
    } else if (part.removed) {
      for (let k = 0; k < n; k++) {
        const w = oldWords[oi + k];
        tokens.push(delToken(w.text, w.start));
      }
      oi += n;
    } else {
      for (let k = 0; k < n; k++) {
        const w = oldWords[oi + k];
        tokens.push(eqToken(w.text, w.start, newWords[ni + k].start));
      }
      oi += n;
      ni += n;
    }
  }
  return mergeAdjacentTokens(foldTinyEquals(mergeAdjacentTokens(tokens)));
}

/**
 * 变化 gap 内的单调（保序）最大权段落配对。
 * 仅相似度达阈值的配对计分；确定性 DP，固定候选择优顺序。
 */
function pairLinesMonotonic(
  oldLines: LineUnit[],
  newLines: LineUnit[],
  threshold: number
): Array<[number, number]> {
  const n = oldLines.length;
  const m = newLines.length;
  const width = m + 1;
  const dp = new Float64Array((n + 1) * width).fill(-1);
  const choice = new Int8Array((n + 1) * width); // 0=match 1=skipOld 2=skipNew
  dp[0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      const idx = i * width + j;
      let best = -1;
      let pick = 2;
      if (i > 0 && j > 0) {
        const sim = bigramSimilarity(oldLines[i - 1].text, newLines[j - 1].text);
        if (sim >= threshold) {
          const v = dp[(i - 1) * width + (j - 1)];
          if (v >= 0 && v + sim > best) {
            best = v + sim;
            pick = 0;
          }
        }
      }
      if (i > 0) {
        const v = dp[(i - 1) * width + j];
        if (v >= 0 && v > best) {
          best = v;
          pick = 1;
        }
      }
      if (j > 0) {
        const v = dp[idx - 1];
        if (v >= 0 && v > best) {
          best = v;
          pick = 2;
        }
      }
      dp[idx] = best;
      choice[idx] = pick;
    }
  }
  const matches: Array<[number, number]> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const pick = choice[i * width + j];
    if (pick === 0) {
      matches.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (pick === 1) {
      i--;
    } else {
      j--;
    }
  }
  matches.reverse();
  return matches;
}

/**
 * 计算原文与新文的确定性 diff。
 * 输入会再次做换行规范化（幂等），位置均相对规范化后的文本。
 */
export function buildDiffDocument(rawOld: string, rawNew: string): DiffDocument {
  const oldText = normalizeLineEndings(rawOld);
  const newText = normalizeLineEndings(rawNew);

  const blocks: DiffBlock[] = [];
  let blockSeq = 0;
  const pushBlock = (b: Omit<DiffBlock, "id">) => {
    blocks.push({ ...b, id: `blk-${blockSeq++}` });
  };

  // 完全相同：整段一个 equal 块，避免逐段落建块的开销
  if (oldText === newText) {
    if (oldText.length > 0) {
      pushBlock({
        type: "equal",
        coarse: false,
        oldStart: 0,
        oldEnd: oldText.length,
        newStart: 0,
        newEnd: newText.length,
        tokens: [eqToken(oldText, 0, 0)],
      });
    }
    return { blocks, changeBlockIds: [] };
  }

  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  // 顶层行数预算：超出时整篇单块 coarse（精确保留两侧文本）
  if (oldLines.length + newLines.length > DIFF_BUDGETS.maxTotalLines) {
    pushBlock({
      type: "replace",
      coarse: true,
      oldStart: 0,
      oldEnd: oldText.length,
      newStart: 0,
      newEnd: newText.length,
      tokens: [delToken(oldText, 0), insToken(newText, 0)],
    });
    return {
      blocks,
      changeBlockIds: blocks.filter((b) => b.type !== "equal").map((b) => b.id),
    };
  }

  const ctx: BudgetContext = { wordsUsed: 0 };
  const B = DIFF_BUDGETS;

  /** gap 整块 coarse（精确保留文本；空侧范围为对应游标位置） */
  const coarseGap = (oFrom: number, oTo: number, nFrom: number, nTo: number) => {
    const oldEmpty = oFrom >= oTo;
    const newEmpty = nFrom >= nTo;
    const oStart = oldEmpty
      ? oFrom === 0 ? 0 : oldLines[oFrom - 1].end
      : oldLines[oFrom].start;
    const oEnd = oldEmpty ? oStart : oldLines[oTo - 1].end;
    const nStart = newEmpty
      ? nFrom === 0 ? 0 : newLines[nFrom - 1].end
      : newLines[nFrom].start;
    const nEnd = newEmpty ? nStart : newLines[nTo - 1].end;
    const tokens: DiffToken[] = [];
    if (!oldEmpty) tokens.push(delToken(oldText.slice(oStart, oEnd), oStart));
    if (!newEmpty) tokens.push(insToken(newText.slice(nStart, nEnd), nStart));
    pushBlock({
      type: oldEmpty ? "insert" : newEmpty ? "delete" : "replace",
      coarse: true,
      oldStart: oStart,
      oldEnd: oEnd,
      newStart: nStart,
      newEnd: nEnd,
      tokens,
    });
  };

  /** 处理一个连续变化 gap：单调配对 → 句子锚点 → 词级 */
  const processGap = (oFrom: number, oTo: number, nFrom: number, nTo: number) => {
    const nGap = oTo - oFrom;
    const mGap = nTo - nFrom;
    if (nGap === 0 && mGap === 0) return;
    if (nGap === 0 || mGap === 0) {
      coarseGap(oFrom, oTo, nFrom, nTo);
      return;
    }
    if (nGap > B.maxGapLines || mGap > B.maxGapLines || nGap * mGap > B.maxPairMatrixCells) {
      coarseGap(oFrom, oTo, nFrom, nTo);
      return;
    }
    const gapOld = oldLines.slice(oFrom, oTo);
    const gapNew = newLines.slice(nFrom, nTo);
    const matches = pairLinesMonotonic(gapOld, gapNew, B.pairSimilarityThreshold);
    let i = 0;
    let j = 0;
    const emitUnmatched = (upToI: number, upToJ: number) => {
      if (i < upToI) {
        coarseGap(oFrom + i, oFrom + upToI, nFrom + j, nFrom + j);
        i = upToI;
      }
      if (j < upToJ) {
        coarseGap(oFrom + i, oFrom + i, nFrom + j, nFrom + upToJ);
        j = upToJ;
      }
    };
    for (const [mi, mj] of matches) {
      emitUnmatched(mi, mj);
      // 配对段：句子锚点 + 词级
      const o = gapOld[mi];
      const nv = gapNew[mj];
      const pair = refinePair(o, nv, ctx);
      pushBlock({
        type: "replace",
        coarse: pair.coarse,
        oldStart: o.start,
        oldEnd: o.end,
        newStart: nv.start,
        newEnd: nv.end,
        tokens: pair.tokens,
      });
      i = mi + 1;
      j = mj + 1;
    }
    emitUnmatched(nGap, mGap);
  };

  const parts = diffArrays(
    oldLines.map((l) => l.text),
    newLines.map((l) => l.text)
  );

  // 段落级锚点（行内容相等）+ 变化区间；LCS 按位置匹配，重复段落不会错位
  let oi = 0;
  let ni = 0;
  let idx = 0;
  while (idx < parts.length) {
    const part = parts[idx];
    if (!part.added && !part.removed) {
      for (let k = 0; k < part.count; k++) {
        const o = oldLines[oi + k];
        const n = newLines[ni + k];
        const tokens: DiffToken[] = [eqToken(o.text, o.start, n.start)];
        let changed = false;
        if (o.sepEnd > o.sepStart && n.sepEnd > n.sepStart) {
          tokens.push(eqToken("\n", o.sepStart, n.sepStart));
        } else if (o.sepEnd > o.sepStart) {
          tokens.push(delToken("\n", o.sepStart));
          changed = true;
        } else if (n.sepEnd > n.sepStart) {
          tokens.push(insToken("\n", n.sepStart));
          changed = true;
        }
        pushBlock({
          type: changed ? "replace" : "equal",
          coarse: false,
          oldStart: o.start,
          oldEnd: o.end,
          newStart: n.start,
          newEnd: n.end,
          tokens: mergeAdjacentTokens(tokens),
        });
      }
      oi += part.count;
      ni += part.count;
      idx++;
      continue;
    }
    // 收集一段连续的 removed+added 作为同一变化 gap
    const oFrom = oi;
    const nFrom = ni;
    while (idx < parts.length && (parts[idx].removed || parts[idx].added)) {
      const p = parts[idx];
      if (p.removed) oi += p.count;
      else ni += p.count;
      idx++;
    }
    processGap(oFrom, oi, nFrom, ni);
  }

  const changeBlockIds = blocks
    .filter((b) => b.type !== "equal")
    .map((b) => b.id);
  return { blocks, changeBlockIds };
}

/**
 * 配对段内的句子锚点 + 词级细化。
 * 预算不足或句子数超限时整段 del+ins（coarse），token 仍精确平铺两侧范围。
 */
function refinePair(o: LineUnit, n: LineUnit, ctx: BudgetContext): { tokens: DiffToken[]; coarse: boolean } {
  const B = DIFF_BUDGETS;
  const oldContent = o.text;
  const newContent = n.text;
  const sepTokens: DiffToken[] = [];
  const oHasSep = o.sepEnd > o.sepStart;
  const nHasSep = n.sepEnd > n.sepStart;
  if (oHasSep && nHasSep) sepTokens.push(eqToken("\n", o.sepStart, n.sepStart));
  else if (oHasSep) sepTokens.push(delToken("\n", o.sepStart));
  else if (nHasSep) sepTokens.push(insToken("\n", n.sepStart));

  const fallbackCoarse = (): { tokens: DiffToken[]; coarse: boolean } => {
    const tokens: DiffToken[] = [];
    if (oldContent) tokens.push(delToken(oldContent, o.start));
    // 旧分隔符在删除内容之后、新增内容之前，保持 del 全部在前、ins 全部在后
    if (oHasSep && !nHasSep) tokens.push(delToken("\n", o.sepStart));
    if (newContent) tokens.push(insToken(newContent, n.start));
    if (nHasSep && !oHasSep) tokens.push(insToken("\n", n.sepStart));
    return { tokens, coarse: true };
  };

  const sOld = splitSentences(oldContent, o.start);
  const sNew = splitSentences(newContent, n.start);
  if (
    sOld.length > B.maxSentencesPerPair ||
    sNew.length > B.maxSentencesPerPair
  ) {
    return fallbackCoarse();
  }

  const parts = diffArrays(
    sOld.map((s) => s.text),
    sNew.map((s) => s.text)
  );
  const tokens: DiffToken[] = [];
  let si = 0;
  let sj = 0;
  let p = 0;
  let usedWordDiff = false;
  while (p < parts.length) {
    const part = parts[p];
    if (!part.added && !part.removed) {
      for (let k = 0; k < part.count; k++) {
        const a = sOld[si + k];
        const b = sNew[sj + k];
        tokens.push(eqToken(a.text, a.start, b.start));
      }
      si += part.count;
      sj += part.count;
      p++;
      continue;
    }
    // 连续 removed+added 句段
    const runOld: TextSlice[] = [];
    const runNew: TextSlice[] = [];
    while (p < parts.length && (parts[p].removed || parts[p].added)) {
      const pp = parts[p];
      if (pp.removed) {
        for (let k = 0; k < pp.count; k++) runOld.push(sOld[si + k]);
        si += pp.count;
      } else {
        for (let k = 0; k < pp.count; k++) runNew.push(sNew[sj + k]);
        sj += pp.count;
      }
      p++;
    }
    if (runOld.length === 0) {
      for (const s of runNew) tokens.push(insToken(s.text, s.start));
      continue;
    }
    if (runNew.length === 0) {
      for (const s of runOld) tokens.push(delToken(s.text, s.start));
      continue;
    }
    const oldRun = runOld.map((s) => s.text).join("");
    const newRun = runNew.map((s) => s.text).join("");
    const refined = wordDiffRun(oldRun, newRun, runOld[0].start, runNew[0].start, ctx);
    if (refined) {
      usedWordDiff = true;
      tokens.push(...refined);
    } else {
      for (const s of runOld) tokens.push(delToken(s.text, s.start));
      for (const s of runNew) tokens.push(insToken(s.text, s.start));
    }
  }

  const all = mergeAdjacentTokens([...tokens, ...sepTokens]);
  return { tokens: all, coarse: !usedWordDiff && all.every((t) => t.type !== "equal") };
}

/** 依序拼接 equal+delete token，应精确重建规范化原文 */
export function reconstructOld(doc: DiffDocument): string {
  let out = "";
  for (const b of doc.blocks) {
    for (const t of b.tokens) {
      if (t.type === "equal" || t.type === "delete") out += t.text;
    }
  }
  return out;
}

/** 依序拼接 equal+insert token，应精确重建规范化新文 */
export function reconstructNew(doc: DiffDocument): string {
  let out = "";
  for (const b of doc.blocks) {
    for (const t of b.tokens) {
      if (t.type === "equal" || t.type === "insert") out += t.text;
    }
  }
  return out;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** 将 [start,end) 边界调整为不拆开代理对 */
export function clampToCodePoints(text: string, start: number, end: number): { start: number; end: number } {
  let s = Math.max(0, Math.min(start, text.length));
  let e = Math.max(s, Math.min(end, text.length));
  if (s > 0 && isLowSurrogate(text.charCodeAt(s))) s--;
  if (e < text.length && isHighSurrogate(text.charCodeAt(e - 1))) e++;
  return { start: s, end: e };
}

/** CRLF / CR 统一为 LF（幂等） */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
