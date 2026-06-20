"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, X, Sparkles, Check, RotateCw } from "lucide-react";
import { RUNTIME_STYLE } from "./city-report-styles";
import type { ParsedReport, Paragraph } from "@/lib/city-report";

interface RectInfo {
  left: number;
  top: number;
  width: number;
  bottom: number;
  height: number;
}

interface SelectionTarget {
  pid: string;
  start: number;
  end: number;
  text: string;
  rect: RectInfo;
}

interface EditState {
  target: SelectionTarget;
  value: string;
}

interface CompareState {
  target: SelectionTarget;
  sectionTitle: string;
}

interface CityReportViewProps {
  city: string;
  report: ParsedReport;
  readOnly?: boolean;
  onChange?: (r: ParsedReport) => void;
}

function findParagraph(report: ParsedReport, pid: string): Paragraph | null {
  for (const s of report.sections) {
    const p = s.paragraphs.find((x) => x.id === pid);
    if (p) return p;
  }
  return null;
}

function findSectionTitle(report: ParsedReport, pid: string): string {
  for (const s of report.sections) {
    if (s.paragraphs.some((x) => x.id === pid)) return s.title;
  }
  return "";
}

function computeBubbleStyle(rect: RectInfo): React.CSSProperties {
  const w = 196;
  const gap = 8;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  let top = rect.top - 40 - gap;
  if (top < 8) top = rect.bottom + gap;
  if (top + 40 > vh) top = Math.max(8, vh - 48);
  const center = rect.left + rect.width / 2;
  let left = center - w / 2;
  left = Math.max(8, Math.min(left, vw - w - 8));
  return { position: "fixed", top, left, width: w, zIndex: 40 };
}

export function CityReportView({ city, report, readOnly, onChange }: CityReportViewProps) {
  const [bubble, setBubble] = useState<SelectionTarget | null>(null);
  const [editPanel, setEditPanel] = useState<EditState | null>(null);
  const [compare, setCompare] = useState<CompareState | null>(null);

  // Re-render may leave a stale selection range; clear it whenever the report changes.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.getSelection()?.removeAllRanges();
    }
  }, [report]);

  const clearSelection = useCallback(() => {
    setBubble(null);
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }, []);

  const handleMouseUp = useCallback(() => {
    if (readOnly || !onChange) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setBubble(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const startWrap = (range.startContainer.parentElement as HTMLElement | null)?.closest(
      "[data-pid]"
    ) as HTMLElement | null;
    const endWrap = (range.endContainer.parentElement as HTMLElement | null)?.closest(
      "[data-pid]"
    ) as HTMLElement | null;
    if (!startWrap || startWrap !== endWrap) {
      // cross-paragraph or outside a paragraph
      setBubble(null);
      return;
    }
    const pid = startWrap.dataset.pid!;
    const para = findParagraph(report, pid);
    if (!para) {
      setBubble(null);
      return;
    }
    const start = Math.min(range.startOffset, range.endOffset);
    const end = Math.max(range.startOffset, range.endOffset);
    const text = para.text.slice(start, end);
    if (!text.trim()) {
      setBubble(null);
      return;
    }
    const r = range.getBoundingClientRect();
    setBubble({
      pid,
      start,
      end,
      text,
      rect: { left: r.left, top: r.top, width: r.width, bottom: r.bottom, height: r.height },
    });
  }, [readOnly, onChange, report]);

  const applyReplacement = useCallback(
    (target: SelectionTarget, newText: string) => {
      if (!onChange) return;
      const next: ParsedReport = {
        ...report,
        sections: report.sections.map((s) => ({
          ...s,
          paragraphs: s.paragraphs.map((p) =>
            p.id === target.pid
              ? { ...p, text: p.text.slice(0, target.start) + newText + p.text.slice(target.end) }
              : p
          ),
        })),
      };
      onChange(next);
    },
    [onChange, report]
  );

  const openWholeEdit = useCallback(
    (p: Paragraph) => {
      clearSelection();
      setEditPanel({
        target: { pid: p.id, start: 0, end: p.text.length, text: p.text, rect: emptyRect() },
        value: p.text,
      });
    },
    [clearSelection]
  );

  const handleEditSelected = useCallback(() => {
    if (!bubble) return;
    setEditPanel({ target: bubble, value: bubble.text });
    setBubble(null);
  }, [bubble]);

  const handleRewriteSelected = useCallback(() => {
    if (!bubble) return;
    const sectionTitle = findSectionTitle(report, bubble.pid);
    setCompare({ target: bubble, sectionTitle });
    setBubble(null);
  }, [bubble, report]);

  const { cover, sections } = report;

  return (
    <div className="city-report-host">
      <style dangerouslySetInnerHTML={{ __html: RUNTIME_STYLE }} />
      <div className="city-report" onMouseUp={handleMouseUp}>
        <div className="page-wrapper">
          {/* Cover */}
          <div className="cover">
            <div className="cover-label">Deep City Research Report</div>
            <h1>{cover.title}</h1>
            <div className="subtitle">{cover.subtitle}</div>
            <div className="cover-meta">
              {cover.metaLines.map((l, i) => (
                <span key={i}>
                  {l}
                  {i < cover.metaLines.length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>

          {/* TOC */}
          <div className="toc">
            <h2>目 录</h2>
            <ul className="toc-list">
              {sections.map((s) => (
                <li key={s.num}>
                  <span className="toc-title">{s.title}</span>
                  <span className="toc-dots"></span>
                </li>
              ))}
            </ul>
          </div>

          {/* Content */}
          <div className="content">
            {sections.map((s) => (
              <div className="section" key={s.num}>
                <div className="section-header">
                  <span className="section-num">{s.num}</span>
                  <span className="section-title">{s.title}</span>
                </div>
                {s.paragraphs.map((p) =>
                  readOnly || !onChange ? (
                    <p key={p.id} data-pid={p.id} className="cr-para">
                      {p.text}
                    </p>
                  ) : (
                    <div className="cr-para-wrap" key={p.id}>
                      {/* single text node only — keeps selection offsets stable */}
                      <p data-pid={p.id} className="cr-para">
                        {p.text}
                      </p>
                      <button className="cr-edit-btn" onClick={() => openWholeEdit(p)}>
                        整段编辑
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="footer">
            {cover.title} &mdash; {cover.dateLabel}
          </div>
        </div>

        {/* Selection bubble */}
        {bubble && !readOnly && (
          <div
            className="cr-bubble"
            style={computeBubbleStyle(bubble.rect)}
            onMouseDown={(e) => e.preventDefault()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <span className="cr-bubble-hint">{bubble.text.length} 字</span>
            <button className="cr-bubble-btn" onClick={handleEditSelected} title="人工编辑选中片段">
              编辑
            </button>
            <button className="cr-bubble-btn primary" onClick={handleRewriteSelected} title="AI 重写选中片段">
              <Sparkles size={13} /> AI 重写
            </button>
          </div>
        )}

        {/* Edit panel */}
        {editPanel && (
          <div className="cr-overlay">
            <div className="cr-dialog">
              <div className="cr-dialog-header">
                <span>编辑文本</span>
                <button className="cr-icon-btn" onClick={() => setEditPanel(null)}>
                  <X size={16} />
                </button>
              </div>
              <textarea
                className="cr-textarea"
                value={editPanel.value}
                onChange={(e) => setEditPanel({ ...editPanel, value: e.target.value })}
                autoFocus
              />
              <div className="cr-dialog-actions">
                <button className="cr-btn" onClick={() => setEditPanel(null)}>
                  取消
                </button>
                <button
                  className="cr-btn primary"
                  onClick={() => {
                    applyReplacement(editPanel.target, editPanel.value.trim() || editPanel.target.text);
                    setEditPanel(null);
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI rewrite compare panel */}
        {compare && (
          <ComparePanel
            city={city}
            originalText={compare.target.text}
            sectionTitle={compare.sectionTitle}
            onAccept={(newText) => {
              applyReplacement(compare.target, newText);
              setCompare(null);
            }}
            onClose={() => setCompare(null)}
          />
        )}
      </div>

      {/* overlay/bubble/dialog styles (Tailwind utilities) */}
      <style>{`
        .cr-bubble{display:flex;align-items:center;gap:6px;background:#1f2937;color:#fff;padding:6px 8px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.18);font-size:12px;}
        .cr-bubble-hint{color:#9ca3af;padding:0 4px;}
        .cr-bubble-btn{display:inline-flex;align-items:center;gap:3px;background:transparent;color:#e5e7eb;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;}
        .cr-bubble-btn:hover{background:#374151;color:#fff;}
        .cr-bubble-btn.primary{background:#4f46e5;color:#fff;}
        .cr-bubble-btn.primary:hover{background:#4338ca;}
        .cr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;}
        .cr-dialog{background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:100%;max-width:880px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;}
        .cr-dialog-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eee;font-weight:600;color:#111;}
        .cr-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:transparent;color:#666;border-radius:6px;cursor:pointer;}
        .cr-icon-btn:hover{background:#f3f4f6;color:#111;}
        .cr-textarea{flex:1;min-height:160px;border:none;outline:none;padding:16px 18px;font-size:14px;line-height:1.8;resize:none;font-family:inherit;color:#222;}
        .cr-dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #eee;}
        .cr-btn{padding:7px 16px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer;font-size:13px;}
        .cr-btn:hover{background:#f7f7f7;}
        .cr-btn.primary{background:#4f46e5;color:#fff;border-color:#4f46e5;}
        .cr-btn.primary:hover{background:#4338ca;}
        .cr-btn:disabled{opacity:.5;cursor:not-allowed;}
        .cr-compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1;overflow:hidden;}
        .cr-compare-col{padding:16px 18px;overflow:auto;font-size:13px;line-height:1.8;color:#333;}
        .cr-compare-col.left{background:#f7f7f7;border-right:1px solid #eee;}
        .cr-compare-col.right{background:#fff;}
        .cr-compare-label{font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;}
        .cr-instruction{padding:10px 18px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center;}
        .cr-instruction input{flex:1;border:1px solid #ddd;border-radius:8px;padding:6px 10px;font-size:13px;outline:none;}
        .cr-instruction input:focus{border-color:#4f46e5;}
        .cr-empty-hint{color:#aaa;font-size:13px;}
      `}</style>
    </div>
  );
}

function emptyRect(): RectInfo {
  return { left: 0, top: 0, width: 0, bottom: 0, height: 0 };
}

/* ---------- AI rewrite compare panel ---------- */

interface ComparePanelProps {
  city: string;
  originalText: string;
  sectionTitle: string;
  onAccept: (newText: string) => void;
  onClose: () => void;
}

function ComparePanel({ city, originalText, sectionTitle, onAccept, onClose }: ComparePanelProps) {
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    setError(null);
    setDraft("");
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/city-research/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, text: originalText, instruction, sectionTitle }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.content) setDraft((d) => d + evt.content);
              if (evt.error) setError(evt.error);
            } catch {
              /* ignore malformed */
            }
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message || "重写失败");
    } finally {
      setLoading(false);
    }
  }, [city, originalText, instruction, sectionTitle]);

  // auto-start once
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const canAccept = !!draft.trim() && !loading;

  return (
    <div className="cr-overlay">
      <div className="cr-dialog">
        <div className="cr-dialog-header">
          <span>AI 重写 · 对比接受</span>
          <button className="cr-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="cr-instruction">
          <input
            type="text"
            placeholder="重写要求（可选，如：更简洁、补充数据、更正式）"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <button className="cr-btn" onClick={run} disabled={loading} title="重新生成">
            <RotateCw size={13} /> {loading ? "生成中" : "重新生成"}
          </button>
        </div>

        <div className="cr-compare-grid">
          <div className="cr-compare-col left">
            <div className="cr-compare-label">原文</div>
            <div>{originalText}</div>
          </div>
          <div className="cr-compare-col right">
            <div className="cr-compare-label">
              {loading && <Loader2 size={12} className="spin" />} AI 重写
            </div>
            {error ? (
              <div className="cr-empty-hint">⚠️ {error}</div>
            ) : draft ? (
              <div>{draft}</div>
            ) : (
              <div className="cr-empty-hint">{loading ? "正在生成…" : "等待生成"}</div>
            )}
          </div>
        </div>

        <div className="cr-dialog-actions">
          <button className="cr-btn" onClick={onClose}>
            保留原文
          </button>
          <button className="cr-btn primary" disabled={!canAccept} onClick={() => onAccept(draft.trim())}>
            <Check size={13} /> 采用新版本
          </button>
        </div>
      </div>
    </div>
  );
}
