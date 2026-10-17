"use client";

/**
 * 文档改写结果的双栏对比 / 单栏修订视图。
 * 只负责展示、变化导航与折叠；正文模型与选区回调由 DocRewrite 提供：
 * - 双栏：一个公共滚动容器，每个对齐块一行 grid，左右按行高对齐；
 * - 单栏：equal 只出现一次，删除 del + 新增 ins；
 * - 两种视图消费同一份 DiffDocument，切换不重算。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DiffBlock, DiffDocument } from "@/lib/doc-diff";

export type DiffViewMode = "split" | "inline";

interface DocRewriteDiffProps {
  diffDoc: DiffDocument;
  view: DiffViewMode;
  onViewChange: (view: DiffViewMode) => void;
  /** 双栏左右栏标题（默认 原文 / 改写后） */
  leftLabel?: string;
  rightLabel?: string;
  /** 工具栏补充说明（如累计对比声明） */
  note?: string;
  /** 内容区的 mouseup（父组件据此解析局部改写选区） */
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  /** 视图/折叠变化会使既有选区失效 */
  onSelectionInvalidated?: () => void;
}

type Row =
  | { kind: "block"; block: DiffBlock }
  | { kind: "gap"; runId: string; count: number };

function blockOldText(block: DiffBlock): string {
  if (block.type === "insert") return "";
  return block.tokens
    .filter((t) => t.type === "equal" || t.type === "delete")
    .map((t) => t.text)
    .join("");
}

function blockNewText(block: DiffBlock): string {
  if (block.type === "delete") return "";
  return block.tokens
    .filter((t) => t.type === "equal" || t.type === "insert")
    .map((t) => t.text)
    .join("");
}

const newAttrs = (start: number | undefined, end: number | undefined) =>
  start === undefined || end === undefined
    ? {}
    : { "data-new-start": start, "data-new-end": end };

/** 双栏左格：未变 + 删除；insert 块显示占位（user-select:none，不进正文） */
function OldCell({ block }: { block: DiffBlock }) {
  if (block.type === "insert") {
    return (
      <span className="doc-rewrite-diff-placeholder" aria-hidden="true">
        （新增内容，无原文）
      </span>
    );
  }
  if (block.coarse) {
    return (
      <del className="doc-rewrite-diff-del doc-rewrite-diff-whole">
        {blockOldText(block)}
      </del>
    );
  }
  return (
    <>
      {block.tokens
        .filter((t) => t.type !== "insert")
        .map((t, i) =>
          t.type === "delete" ? (
            <del key={i} className="doc-rewrite-diff-del">
              {t.text}
            </del>
          ) : (
            <span key={i} className="doc-rewrite-diff-eq">
              {t.text}
            </span>
          )
        )}
    </>
  );
}

/** 双栏右格：未变 + 新增；delete 块显示占位。只有此侧标记 data-new-* */
function NewCell({ block }: { block: DiffBlock }) {
  if (block.type === "delete") {
    return (
      <span className="doc-rewrite-diff-placeholder" aria-hidden="true">
        （此段已删除）
      </span>
    );
  }
  if (block.coarse) {
    return (
      <ins
        className="doc-rewrite-diff-ins doc-rewrite-diff-whole"
        {...newAttrs(block.newStart, block.newEnd)}
      >
        {blockNewText(block)}
      </ins>
    );
  }
  return (
    <>
      {block.tokens
        .filter((t) => t.type !== "delete")
        .map((t, i) =>
          t.type === "insert" ? (
            <ins
              key={i}
              className="doc-rewrite-diff-ins"
              {...newAttrs(t.newStart, t.newEnd)}
            >
              {t.text}
            </ins>
          ) : (
            <span
              key={i}
              className="doc-rewrite-diff-eq"
              {...newAttrs(t.newStart, t.newEnd)}
            >
              {t.text}
            </span>
          )
        )}
    </>
  );
}

/** 单栏：equal 一份 + del/ins；coarse 整块标记 */
function InlineContent({ block }: { block: DiffBlock }) {
  if (block.coarse) {
    return (
      <>
        {block.type !== "insert" && (
          <del className="doc-rewrite-diff-del doc-rewrite-diff-whole">
            {blockOldText(block)}
          </del>
        )}
        {block.type !== "delete" && (
          <ins
            className="doc-rewrite-diff-ins doc-rewrite-diff-whole"
            {...newAttrs(block.newStart, block.newEnd)}
          >
            {blockNewText(block)}
          </ins>
        )}
      </>
    );
  }
  return (
    <>
      {block.tokens.map((t, i) => {
        if (t.type === "delete") {
          return (
            <del key={i} className="doc-rewrite-diff-del">
              {t.text}
            </del>
          );
        }
        if (t.type === "insert") {
          return (
            <ins
              key={i}
              className="doc-rewrite-diff-ins"
              {...newAttrs(t.newStart, t.newEnd)}
            >
              {t.text}
            </ins>
          );
        }
        return (
          <span key={i} className="doc-rewrite-diff-eq" {...newAttrs(t.newStart, t.newEnd)}>
            {t.text}
          </span>
        );
      })}
    </>
  );
}

export function DocRewriteDiff({
  diffDoc,
  view,
  onViewChange,
  leftLabel = "原文",
  rightLabel = "改写后",
  note,
  onMouseUp,
  onScroll,
  onSelectionInvalidated,
}: DocRewriteDiffProps) {
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const blockRefs = useRef(new Map<string, HTMLDivElement>());
  const changeBlockIds = diffDoc.changeBlockIds;

  // diff 重算后 activeId 可能失效，按当前 changeBlockIds 派生有效值，
  // 不在 effect 里重置状态（避免级联渲染）
  const effectiveActiveId =
    activeId !== null && changeBlockIds.includes(activeId) ? activeId : null;
  const activeIdx = effectiveActiveId ? changeBlockIds.indexOf(effectiveActiveId) : -1;
  const total = changeBlockIds.length;

  useEffect(() => {
    if (!effectiveActiveId) return;
    blockRefs.current.get(effectiveActiveId)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [effectiveActiveId]);

  const goTo = (i: number) => {
    if (total === 0) return;
    const clamped = Math.max(0, Math.min(i, total - 1));
    const id = changeBlockIds[clamped];
    if (!id) return;
    setActiveId(id);
    onSelectionInvalidated?.();
  };

  const changeView = (v: DiffViewMode) => {
    if (v === view) return;
    onViewChange(v);
    onSelectionInvalidated?.();
  };

  const toggleOnlyChanges = () => {
    setOnlyChanges((v) => !v);
    setExpandedRuns(new Set());
    onSelectionInvalidated?.();
  };

  const rows = useMemo<Row[]>(() => {
    const blocks = diffDoc.blocks;
    const out: Row[] = [];
    if (!onlyChanges) {
      for (const b of blocks) out.push({ kind: "block", block: b });
      return out;
    }
    const visible = new Set<number>();
    blocks.forEach((b, i) => {
      if (b.type !== "equal") {
        visible.add(i);
        if (i - 1 >= 0) visible.add(i - 1);
        if (i + 1 < blocks.length) visible.add(i + 1);
      }
    });
    let i = 0;
    while (i < blocks.length) {
      if (visible.has(i)) {
        out.push({ kind: "block", block: blocks[i] });
        i++;
        continue;
      }
      let j = i;
      while (j < blocks.length && !visible.has(j)) j++;
      const runId = blocks[i].id;
      if (expandedRuns.has(runId)) {
        for (let k = i; k < j; k++) out.push({ kind: "block", block: blocks[k] });
      } else {
        out.push({ kind: "gap", runId, count: j - i });
      }
      i = j;
    }
    return out;
  }, [diffDoc, onlyChanges, expandedRuns]);

  const renderRow = (row: Row): ReactNode => {
    if (row.kind === "gap") {
      return (
        <div key={`gap-${row.runId}`} className="doc-rewrite-diff-collapse">
          <button
            type="button"
            onClick={() =>
              setExpandedRuns((prev) => new Set(prev).add(row.runId))
            }
          >
            <ChevronDown size={12} />
            展开 {row.count} 段未变化内容
          </button>
        </div>
      );
    }
    const block = row.block;
    const active = effectiveActiveId === block.id;
    const rowClass = [
      "doc-rewrite-diff-row",
      block.type !== "equal" ? "doc-rewrite-diff-row-changed" : "",
      active ? "doc-rewrite-diff-row-active" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (view === "inline") {
      return (
        <div
          key={block.id}
          ref={(el) => {
            if (el) blockRefs.current.set(block.id, el);
            else blockRefs.current.delete(block.id);
          }}
          data-diff-block-id={block.id}
          className={`doc-rewrite-diff-iblock ${block.type !== "equal" ? "doc-rewrite-diff-row-changed" : ""} ${active ? "doc-rewrite-diff-row-active" : ""}`}
        >
          <InlineContent block={block} />
        </div>
      );
    }
    return (
      <div key={block.id} ref={(el) => {
        if (el) blockRefs.current.set(block.id, el);
        else blockRefs.current.delete(block.id);
      }} data-diff-block-id={block.id} className={rowClass}>
        <div className="doc-rewrite-diff-cell doc-rewrite-diff-cell-old" data-diff-side="old">
          <OldCell block={block} />
        </div>
        <div className="doc-rewrite-diff-cell doc-rewrite-diff-cell-new" data-diff-side="new">
          <NewCell block={block} />
        </div>
      </div>
    );
  };

  return (
    <div className="doc-rewrite-diff">
      <div className="doc-rewrite-diff-toolbar" role="toolbar" aria-label="文字差异工具栏">
        <div className="doc-rewrite-diff-viewtoggle" role="group" aria-label="差异视图切换">
          <button
            type="button"
            aria-pressed={view === "split"}
            className={view === "split" ? "doc-rewrite-diff-tbtn is-on" : "doc-rewrite-diff-tbtn"}
            onClick={() => changeView("split")}
          >
            双栏对比
          </button>
          <button
            type="button"
            aria-pressed={view === "inline"}
            className={view === "inline" ? "doc-rewrite-diff-tbtn is-on" : "doc-rewrite-diff-tbtn"}
            onClick={() => changeView("inline")}
          >
            单栏修订
          </button>
        </div>
        <button
          type="button"
          aria-pressed={onlyChanges}
          className={onlyChanges ? "doc-rewrite-diff-tbtn is-on" : "doc-rewrite-diff-tbtn"}
          onClick={toggleOnlyChanges}
          title="折叠连续未变化段落，仅保留变化及其相邻段落"
        >
          仅显示变化
        </button>
        {total === 0 ? (
          <span className="doc-rewrite-diff-counter">未发现文字差异</span>
        ) : (
          <>
            <span className="doc-rewrite-diff-counter" data-testid="diff-counter">
              {activeIdx >= 0 ? `第 ${activeIdx + 1} / ${total} 处变化` : `共 ${total} 处变化`}
            </span>
            <button
              type="button"
              className="doc-rewrite-diff-tbtn"
              onClick={() => goTo(activeIdx - 1)}
              disabled={activeIdx <= 0}
              title="上一处变化"
            >
              <ChevronUp size={12} />
              上一处
            </button>
            <button
              type="button"
              className="doc-rewrite-diff-tbtn"
              onClick={() => goTo(activeIdx + 1)}
              disabled={activeIdx === total - 1}
              title="下一处变化"
            >
              <ChevronDown size={12} />
              下一处
            </button>
          </>
        )}
        <span className="doc-rewrite-diff-legend" aria-label="图例：删除线为删除内容，下划线为新增内容">
          <del>删除</del>
          <ins>新增</ins>
        </span>
        {note && <span className="doc-rewrite-diff-note">{note}</span>}
      </div>
      <div
        className="doc-rewrite-diff-scroll"
        data-doc-diff-root
        onMouseUp={onMouseUp}
        onScroll={onScroll}
        style={
          {
            "--diff-left-label": leftLabel,
            "--diff-right-label": rightLabel,
          } as React.CSSProperties
        }
      >
        {view === "split" && (
          <div className="doc-rewrite-diff-row doc-rewrite-diff-row-head">
            <div className="doc-rewrite-diff-cell doc-rewrite-diff-cell-old">{leftLabel}</div>
            <div className="doc-rewrite-diff-cell doc-rewrite-diff-cell-new">{rightLabel}</div>
          </div>
        )}
        {rows.map(renderRow)}
      </div>
    </div>
  );
}
