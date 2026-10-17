/**
 * 把用户在 diff 视图（或纯文本新文面板）里的选区映射为新文绝对偏移。
 *
 * 依赖渲染约定：
 * - 承载新文片段的元素带 data-new-start / data-new-end（UTF-16 偏移）；
 * - 双栏视图的左栏单元格带 data-diff-side="old"，选区端点落入即拒绝；
 * - 根容器带 data-doc-diff-root（纯文本面板本身可同时是新文片段）。
 *
 * 映射按片段的真实端点累计，不使用 indexOf，因此兼容跨高亮节点、
 * 重复词句、反向拖选与跨段落选区。
 */
import { clampToCodePoints } from "./doc-diff";

export type SelectionRejectReason =
  | "no-selection"
  | "outside"
  | "old-side"
  | "no-new-text"
  | "crosses-folded";

export type NewTextSelectionResult =
  | { ok: true; start: number; end: number; text: string }
  | { ok: false; reason: SelectionRejectReason; selected: string };

function asElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function numAttr(el: Element, name: string): number {
  const v = Number(el.getAttribute(name));
  return Number.isFinite(v) ? v : 0;
}

function markedElementsIn(root: ParentNode): Element[] {
  const out: Element[] = [];
  if (root instanceof Element && root.hasAttribute("data-new-start")) {
    out.push(root);
  }
  root.querySelectorAll("[data-new-start]").forEach((el) => out.push(el));
  return out;
}

function elementIntersectsRange(range: Range, el: Element): boolean {
  const er = document.createRange();
  er.selectNodeContents(el);
  // 语义（MDN/DOM）：START_TO_END 比较 range 终点与 er 起点；
  // END_TO_START 比较 range 起点与 er 终点。
  // 选区终点 <= el 起点（完全在前），或选区起点 >= el 终点（完全在后）：不相交。
  return (
    range.compareBoundaryPoints(Range.START_TO_END, er) > 0 &&
    range.compareBoundaryPoints(Range.END_TO_START, er) < 0
  );
}

/**
 * 解析当前选区。newText 必须与渲染 data-new-* 偏移所基于的文本一致。
 */
export function resolveNewTextSelection(
  root: HTMLElement | null,
  newText: string
): NewTextSelectionResult {
  const selection = window.getSelection();
  if (
    !root ||
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed
  ) {
    return { ok: false, reason: "no-selection", selected: "" };
  }
  const range = selection.getRangeAt(0);
  const selected = selection.toString();
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return { ok: false, reason: "outside", selected };
  }
  // 双栏左栏（原文侧）不允许作为选区端点
  for (const node of [range.startContainer, range.endContainer]) {
    const el = asElement(node);
    if (el && el.closest('[data-diff-side="old"]')) {
      return { ok: false, reason: "old-side", selected };
    }
  }

  const marked = markedElementsIn(root).filter((el) => elementIntersectsRange(range, el));
  if (marked.length === 0) {
    return { ok: false, reason: "no-new-text", selected };
  }

  // 折叠/隐藏内容会造成新文位置断档
  for (let i = 1; i < marked.length; i++) {
    if (numAttr(marked[i - 1], "data-new-end") !== numAttr(marked[i], "data-new-start")) {
      return { ok: false, reason: "crosses-folded", selected };
    }
  }

  const first = marked[0];
  const last = marked[marked.length - 1];
  const firstLen = (first.textContent || "").length;
  const firstFull = document.createRange();
  firstFull.selectNodeContents(first);
  const lastFull = document.createRange();
  lastFull.selectNodeContents(last);

  let start: number;
  if (range.compareBoundaryPoints(Range.START_TO_START, firstFull) <= 0) {
    start = numAttr(first, "data-new-start");
  } else {
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(first, first.childNodes.length);
    start = numAttr(first, "data-new-start") + (firstLen - tail.toString().length);
  }

  let end: number;
  if (range.compareBoundaryPoints(Range.END_TO_END, lastFull) >= 0) {
    end = numAttr(last, "data-new-end");
  } else {
    const head = document.createRange();
    head.setStart(last, 0);
    head.setEnd(range.endContainer, range.endOffset);
    end = numAttr(last, "data-new-start") + head.toString().length;
  }

  if (end < start) {
    const t = start;
    start = end;
    end = t;
  }
  const clamped = clampToCodePoints(newText, start, Math.max(start, end));
  start = clamped.start;
  end = clamped.end;
  const text = newText.slice(start, end);
  if (!text.trim()) {
    return { ok: false, reason: "no-new-text", selected };
  }
  return { ok: true, start, end, text };
}
