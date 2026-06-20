"use client";

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAppHistory } from "@/hooks/useAppHistory";
import {
  Sparkles,
  Save,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
  X,
  BookmarkPlus,
  Plus,
  Upload,
  ClipboardPaste,
  ArrowLeft,
  FileText,
  Copy,
  Download,
  Check,
  RotateCcw,
} from "lucide-react";

interface StyleProfile {
  id: string;
  name: string;
  profile: string;
  createdAt: number;
}

interface HistoryEntry {
  text: string;
  type: "full" | "partial";
}

type Step = "style" | "rewrite";
type InputMode = "upload" | "paste";

export function DocRewrite() {
  const { saveToHistory } = useAppHistory();
  const [step, setStep] = useState<Step>("style");

  // Step 1: Style
  const [refText, setRefText] = useState("");
  const [refFileName, setRefFileName] = useState<string | null>(null);
  const [refInputMode, setRefInputMode] = useState<InputMode>("upload");
  const [pastedRefText, setPastedRefText] = useState("");
  const [styleProfile, setStyleProfile] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [showProfileList, setShowProfileList] = useState(false);
  const [profileDropdownPos, setProfileDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "bottom" | "top";
  } | null>(null);
  const profileBtnRef = useRef<HTMLButtonElement | null>(null);
  const [showNewStylePanel, setShowNewStylePanel] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Step 2: Rewrite
  const [docText, setDocText] = useState("");
  const [docFileName, setDocFileName] = useState<string | null>(null);
  const [docInputMode, setDocInputMode] = useState<InputMode>("upload");
  const [pastedDocText, setPastedDocText] = useState("");
  const [requirements, setRequirements] = useState("");
  const [rewriteResult, setRewriteResult] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Partial rewrite state
  const [partialSelectedText, setPartialSelectedText] = useState("");
  const [partialSelectionRange, setPartialSelectionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{
    top: number;
    left: number;
    below: boolean;
  } | null>(null);
  const [partialInstruction, setPartialInstruction] = useState("");
  const [showPartialToolbar, setShowPartialToolbar] = useState(false);
  const [showPartialRewritePanel, setShowPartialRewritePanel] = useState(false);
  const [isPartialRewriting, setIsPartialRewriting] = useState(false);
  const [partialRewriteError, setPartialRewriteError] = useState<string | null>(null);
  const partialAbortRef = useRef<AbortController | null>(null);
  const partialInputRef = useRef<HTMLTextAreaElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);

  // Auto-resize the partial-rewrite textarea to fit its content.
  const adjustPartialInput = useCallback(() => {
    const el = partialInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 280) + "px";
  }, []);

  // Rewrite history stack for undo
  const [rewriteHistory, setRewriteHistory] = useState<HistoryEntry[]>([]);

  // Load profiles on mount
  useEffect(() => {
    fetchProfiles();
  }, []);

  // Dismiss partial toolbar on outside click or Escape
  useEffect(() => {
    function handleDocMouseDown(e: MouseEvent) {
      if (!showPartialToolbar) return;
      const target = e.target as HTMLElement;
      if (target.closest(".doc-rewrite-partial-toolbar")) return;
      if (rightPanelRef.current?.contains(target)) return;
      setShowPartialToolbar(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && showPartialToolbar) {
        setShowPartialToolbar(false);
        window.getSelection()?.removeAllRanges();
      }
    }
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showPartialToolbar]);

  // Save to history when rewrite completes
  const prevRewritingRef = useRef(false);

  // Keep the partial-rewrite textarea sized to its content whenever the panel
  // opens or the instruction text changes (including being cleared).
  useLayoutEffect(() => {
    adjustPartialInput();
  }, [adjustPartialInput, showPartialRewritePanel, partialInstruction]);

  useEffect(() => {
    // Save to history ONCE when a rewrite (full or partial) finishes.
    // Watching rewriteResult directly fires on every streaming chunk and
    // floods the history list; instead track the busy->idle transition.
    const rewriting = isRewriting || isPartialRewriting;
    if (prevRewritingRef.current && !rewriting && rewriteResult.trim()) {
      saveToHistory("rewrite", "文档改写", rewriteResult);
    }
    prevRewritingRef.current = rewriting;
  }, [isRewriting, isPartialRewriting, rewriteResult, saveToHistory]);

  // Compute portal dropdown position based on trigger button rect + viewport.
  const recalcProfileDropdown = useCallback(() => {
    const btn = profileBtnRef.current;
    if (!btn) {
      setProfileDropdownPos(null);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // Prefer below; flip up only when below is too small and above is larger.
    const placement: "bottom" | "top" =
      spaceBelow >= 180 || spaceBelow >= spaceAbove ? "bottom" : "top";
    const maxHeight = Math.max(
      120,
      Math.floor(placement === "bottom" ? spaceBelow : spaceAbove)
    );
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    setProfileDropdownPos({
      top: placement === "bottom" ? rect.bottom + gap : Math.max(8, rect.top - gap - maxHeight),
      left,
      width: rect.width,
      maxHeight,
      placement,
    });
  }, []);

  // (Re)compute position whenever the dropdown opens or the list changes.
  useLayoutEffect(() => {
    if (!showProfileList) {
      setProfileDropdownPos(null);
      return;
    }
    recalcProfileDropdown();
  }, [showProfileList, profiles, recalcProfileDropdown]);

  // Close on outside click, Escape, scroll, and resize while open.
  useEffect(() => {
    if (!showProfileList) return;
    const onDocMouseDown = (e: MouseEvent) => {
 const target = e.target as Node;
 if (profileBtnRef.current?.contains(target)) return;
 if ((target as Element).closest?.(".doc-rewrite-profile-portal")) return;
 setShowProfileList(false);
 };
 const onKey = (e: KeyboardEvent) => {
 if (e.key === "Escape") setShowProfileList(false);
 };
 const onScrollOrResize = () => setShowProfileList(false);
 document.addEventListener("mousedown", onDocMouseDown);
 document.addEventListener("keydown", onKey);
 window.addEventListener("resize", onScrollOrResize);
 // Any scroll (window or nested containers) should close to avoid stale position.
 window.addEventListener("scroll", onScrollOrResize, true);
 return () => {
 document.removeEventListener("mousedown", onDocMouseDown);
 document.removeEventListener("keydown", onKey);
 window.removeEventListener("resize", onScrollOrResize);
 window.removeEventListener("scroll", onScrollOrResize, true);
 };
  }, [showProfileList]);

  async function fetchProfiles() {
    try {
      const res = await fetch("/api/doc-rewrite/profiles");
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleFileUpload(file: File, target: "ref" | "doc") {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/doc-rewrite/extract-text", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "文件解析失败");
      if (target === "ref") {
        setRefText(data.text);
        setRefFileName(file.name);
        setStyleProfile("");
        setSelectedProfileId(null);
        setAnalyzeError(null);
      } else {
        setDocText(data.text);
        setDocFileName(file.name);
      }
    } catch (err: any) {
      alert(err.message || "文件解析失败");
    }
  }

  async function handleAnalyzeStyle() {
    setAnalyzing(true);
    setStyleProfile("");
    setSelectedProfileId(null);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/doc-rewrite/analyze-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: refText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "分析失败");
      setStyleProfile(data.profile);
    } catch (err: any) {
      setAnalyzeError(err.message || "风格分析失败");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleSelectProfile(profile: StyleProfile) {
    setSelectedProfileId(profile.id);
    setStyleProfile(profile.profile);
    setShowProfileList(false);
    setAnalyzeError(null);
  }

  // Reset everything style-related so the "new style" panel starts clean,
  // even if the user previously picked a saved profile.
  function startNewStyle() {
    setSelectedProfileId(null);
    setStyleProfile("");
    setRefText("");
    setRefFileName(null);
    setPastedRefText("");
    setAnalyzeError(null);
    setShowProfileList(false);
    setShowNewStylePanel(true);
  }

  async function handleSaveProfile() {
    if (!profileName.trim() || !styleProfile.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doc-rewrite/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName.trim(), profile: styleProfile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setProfiles((prev) => [...prev, data]);
      setShowSaveDialog(false);
      setProfileName("");
    } catch (err: any) {
      alert(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      const res = await fetch(`/api/doc-rewrite/profiles/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
        if (selectedProfileId === id) {
          setSelectedProfileId(null);
          setStyleProfile("");
        }
      }
    } catch {
      /* ignore */
    }
  }

  function pushHistory(type: "full" | "partial") {
    setRewriteHistory((prev) => [...prev, { text: rewriteResult, type }]);
  }

  function handleUndo() {
    if (rewriteHistory.length === 0) return;
    const prev = rewriteHistory[rewriteHistory.length - 1];
    setRewriteHistory((h) => h.slice(0, -1));
    setRewriteResult(prev.text);
    setRewriteError(null);
  }

  async function handleRewrite() {
    if (!styleProfile.trim() || !docText.trim() || isRewriting) return;
    if (rewriteResult) pushHistory("full");
    setRewriteResult("");
    setRewriteError(null);
    setIsRewriting(true);
    setConfigCollapsed(true);
    rewriteAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/doc-rewrite/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleProfile, requirements, documentText: docText }),
        signal: rewriteAbortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "改写失败");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let fullContent = "";
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              setRewriteError(parsed.error);
              break;
            }
            if (parsed.warning) {
              setRewriteError(parsed.warning);
            }
            if (parsed.content) {
              fullContent += parsed.content;
              setRewriteResult(fullContent);
            }
          } catch {
            /* skip */
          }
        }
      }

      // Flush any remaining sseBuffer data after stream ends
      if (sseBuffer.trim()) {
        const trimmed = sseBuffer.trim();
        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload !== "[DONE]") {
            try {
              const parsed = JSON.parse(payload);
              if (parsed.content) {
                fullContent += parsed.content;
                setRewriteResult(fullContent);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setRewriteError(err.message || "改写出错");
      }
    } finally {
      setIsRewriting(false);
      rewriteAbortRef.current = null;
    }
  }

  function handleStopRewrite() {
    rewriteAbortRef.current?.abort();
  }

  function handleRightPanelMouseUp() {
    if (isRewriting || isPartialRewriting) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
      setShowPartialToolbar(false);
      return;
    }

    const selectedStr = selection.toString();
    const fullText = stripMarkdown(rewriteResult);
    const idx = fullText.indexOf(selectedStr);
    if (idx === -1) {
      setShowPartialToolbar(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const below = rect.top < 140;

    const toolbarWidth = 320;
    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));
    const top = below ? rect.bottom + 8 : rect.top - 8;

    setPartialSelectedText(selectedStr);
    setPartialSelectionRange({ start: idx, end: idx + selectedStr.length });
    setToolbarPosition({ top, left, below });
    setPartialInstruction("");
    setPartialRewriteError(null);
    setShowPartialToolbar(true);
  }

  async function handlePartialRewrite() {
    if (!partialInstruction.trim() || !partialSelectionRange || isPartialRewriting) return;

    setIsPartialRewriting(true);
    setPartialRewriteError(null);
    partialAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/doc-rewrite/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleProfile,
          requirements: partialInstruction.trim(),
          documentText: partialSelectedText,
        }),
        signal: partialAbortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "局部改写失败");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let partialContent = "";
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              setPartialRewriteError(parsed.error);
              break;
            }
            if (parsed.content) {
              partialContent += parsed.content;
            }
          } catch {
            /* skip */
          }
        }
      }

      if (partialContent.trim()) {
        const cleanFull = stripMarkdown(rewriteResult);
        const { start, end } = partialSelectionRange;
        const newFull =
          cleanFull.slice(0, start) +
          partialContent.trim() +
          cleanFull.slice(end);
        pushHistory("partial");
        setRewriteResult(newFull);
        // Done: close the inline panel and restore the original-text panel.
        setShowPartialRewritePanel(false);
        setPartialInstruction("");
        setPartialRewriteError(null);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setPartialRewriteError(err.message || "局部改写出错");
      }
    } finally {
      setIsPartialRewriting(false);
      partialAbortRef.current = null;
      setShowPartialToolbar(false);
      window.getSelection()?.removeAllRanges();
    }
  }

  async function handleCopy() {
    if (!rewriteResult) return;
    await navigator.clipboard.writeText(stripMarkdown(rewriteResult));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadDocx() {
    if (!rewriteResult) return;
    try {
      const res = await fetch("/api/doc-rewrite/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: stripMarkdown(rewriteResult), filename: "rewritten-document" }),
      });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rewritten-document.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "下载失败");
    }
  }

  function stripMarkdown(md: string): string {
    const thinkPattern = new RegExp("<think>[\\s\\S]*?(?:</" + "think>|$)", "gi");
    return md
      .replace(thinkPattern, "")
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
      .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""))
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*>\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-=_]{3,}\s*$/gm, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // The "改写后" panel is reused in two layouts: right slot (normal mode)
  // and left slot (partial-rewrite mode), so extract it once.
  const rewrittenPanel = (
    <div className="doc-rewrite-result-panel">
      <div className="doc-rewrite-result-panel-header doc-rewrite-result-panel-header-with-action">
        <span>改写后</span>
        {!isRewriting && rewriteResult && (
          <div className="doc-rewrite-header-actions">
            <button
              className={`doc-rewrite-undo-btn ${rewriteHistory.length === 0 ? "doc-rewrite-undo-disabled" : ""}`}
              onClick={handleUndo}
              disabled={rewriteHistory.length === 0}
              title={
                rewriteHistory.length > 0
                  ? `撤回改写（剩余 ${rewriteHistory.length} 次）`
                  : "无改写历史"
              }
            >
              <RotateCcw size={12} />
              撤回{rewriteHistory.length > 0 ? ` (${rewriteHistory.length})` : ""}
            </button>
            <button
              className="doc-rewrite-rewrite-again-btn"
              onClick={handleRewrite}
              title="重新改写"
            >
              <RotateCcw size={12} />
              重新改写
            </button>
          </div>
        )}
      </div>
      <div
        ref={rightPanelRef}
        className="doc-rewrite-result-panel-content"
        onMouseUp={handleRightPanelMouseUp}
        onScroll={() => { if (showPartialToolbar) setShowPartialToolbar(false); }}
      >
        {rewriteResult ? stripMarkdown(rewriteResult) : (isRewriting ? "等待输出..." : "")}
      </div>
    </div>
  );

  return (
    <div className="doc-rewrite">
      {/* Header */}
      <div className="app-page-header">
        <h2 className="app-page-title">文档改写</h2>
        <p className="app-page-subtitle">
          上传参考文档分析文字风格，再对目标文档进行智能改写
        </p>
      </div>

      <div className="doc-rewrite-toolbar">
        {step === "rewrite" && (
          <button
            className="icon-btn doc-rewrite-toolbar-back"
            onClick={() => setStep("style")}
            title="返回风格设置"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="doc-rewrite-steps">
          <div className={`doc-rewrite-step ${step === "style" ? "active" : ""}`}>
            <Sparkles size={12} />
            <span>1. 文档风格选择</span>
          </div>
          <div className={`doc-rewrite-step ${step === "rewrite" ? "active" : ""}`}>
            <Wand2 size={12} />
            <span>2. 选择改写文档</span>
          </div>
        </div>
      </div>

     {/* Step 1: Style */}
     {step === "style" && (
       <div className="doc-rewrite-body">
        <div className="doc-rewrite-form">
            <div className="doc-rewrite-section">
              <label className="doc-rewrite-label">选择已保存的风格</label>
              <div className="doc-rewrite-select">
                <button
                  ref={profileBtnRef}
                  className="doc-rewrite-select-btn"
                  onClick={() => setShowProfileList(!showProfileList)}
                >
                  <span>
                    {selectedProfileId
                      ? profiles.find((p) => p.id === selectedProfileId)?.name || "已选择"
                      : "点击选择..."}
                  </span>
                  {showProfileList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {/* New style panel: reference upload + analyze (hidden by default) */}
            {showNewStylePanel && (
              <>
                <div className="doc-rewrite-section">
                  <label className="doc-rewrite-label">参考文档（用于分析文字风格）</label>
                  <div className="doc-rewrite-mode-tabs">
                    <button
                      className={`doc-rewrite-mode-tab ${refInputMode === "upload" ? "active" : ""}`}
                      onClick={() => setRefInputMode("upload")}
                    >
                      <Upload size={12} />
                      上传文件
                    </button>
                    <button
                      className={`doc-rewrite-mode-tab ${refInputMode === "paste" ? "active" : ""}`}
                      onClick={() => setRefInputMode("paste")}
                    >
                      <ClipboardPaste size={12} />
                      粘贴文本
                    </button>
                  </div>

                  {refInputMode === "upload" ? (
                    <div
                      className="doc-rewrite-upload"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileUpload(file, "ref");
                      }}
                    >
                      {refFileName ? (
                        <div className="doc-rewrite-file-loaded">
                          <FileText size={14} />
                          <span>{refFileName}</span>
                          <button
                            className="icon-btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRefText("");
                              setRefFileName(null);
                              setStyleProfile("");
                              setSelectedProfileId(null);
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={20} />
                          <span>点击或拖拽上传文件</span>
                          <span className="doc-rewrite-upload-hint">
                            支持 TXT、MD、DOCX、PDF、Excel
                          </span>
                        </>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,.docx,.pdf,.xlsx,.xls"
                        className="hidden-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "ref");
                          e.target.value = "";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="doc-rewrite-paste">
                      <textarea
                        className="doc-rewrite-textarea"
                        value={pastedRefText}
                        onChange={(e) => setPastedRefText(e.target.value)}
                        placeholder="在此粘贴参考文档的文本内容..."
                        rows={6}
                      />
                      {pastedRefText && (
                        <button
                          className="doc-rewrite-confirm-btn"
                          onClick={() => {
                            setRefText(pastedRefText);
                            setRefFileName(null);
                            setStyleProfile("");
                            setSelectedProfileId(null);
                          }}
                        >
                          确认文本
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Analyze button */}
                {refText && !styleProfile && (
                  <button
                    className="doc-rewrite-primary-btn"
                    onClick={handleAnalyzeStyle}
                    disabled={analyzing}
                  >
                    {analyzing ? (
                      <>
                        <Loader2 size={14} className="spin" />
                        正在分析风格...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        分析文字风格
                      </>
                    )}
                  </button>
                )}

                {analyzeError && <div className="doc-rewrite-error">{analyzeError}</div>}
              </>
            )}

            {/* Style profile display */}
            {styleProfile && (
              <div className="doc-rewrite-section">
                <div className="doc-rewrite-profile-header">
                  <label className="doc-rewrite-label">风格分析结果</label>
                </div>
                <div className="doc-rewrite-profile-content">{styleProfile}</div>

                {showSaveDialog && (
                  <div className="doc-rewrite-save-dialog">
                    <input
                      type="text"
                      className="doc-rewrite-save-input"
                      placeholder="输入风格名称..."
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveProfile();
                      }}
                      autoFocus
                    />
                    <button
                      className="doc-rewrite-confirm-btn"
                      onClick={handleSaveProfile}
                      disabled={saving || !profileName.trim()}
                    >
                      {saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
                      保存
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setShowSaveDialog(false);
                        setProfileName("");
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div className="doc-rewrite-profile-actions">
                  {!selectedProfileId && (
                    <button
                      className="doc-rewrite-save-btn"
                      onClick={() => setShowSaveDialog(true)}
                    >
                     <BookmarkPlus size={12} />
                      保存风格（可选）
                   </button>
                  )}
                  <button
                    className="doc-rewrite-primary-btn"
                    onClick={() => setStep("rewrite")}
                  >
                    下一步：上传文档并改写
                    <ChevronDown size={14} className="rotate-minus-90" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Rewrite */}
      {step === "rewrite" && (
        <div className="doc-rewrite-body doc-rewrite-rewrite-body">
          {/* Config area: only show when NOT rewriting and NO result */}
          {!isRewriting && !rewriteResult && (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {/* Collapsed config bar */}
              {configCollapsed ? (
                <div className="doc-rewrite-collapsed-bar">
                  <Sparkles size={14} />
                  <span className="doc-rewrite-collapsed-style">
                    风格:{" "}
                    {selectedProfileId
                      ? profiles.find((p) => p.id === selectedProfileId)?.name
                      : "自定义"}
                  </span>
                  <span className="doc-rewrite-collapsed-file">
                    {docFileName || "已加载文档"}
                  </span>
                  <button
                    className="doc-rewrite-confirm-btn"
                    onClick={() => setConfigCollapsed(false)}
                  >
                    修改并重新改写
                    <Wand2 size={12} />
                  </button>
                </div>
              ) : (
                <div className="doc-rewrite-config">
              <div className="doc-rewrite-form">
                {/* Current style */}
                <div className="doc-rewrite-style-summary">
                  <Sparkles size={14} />
                  <span>
                    当前风格:{" "}
                    {selectedProfileId
                      ? profiles.find((p) => p.id === selectedProfileId)?.name
                      : "自定义（来自参考文档分析）"}
                  </span>
                  <button
                    className="doc-rewrite-reselect-btn"
                    onClick={() => setStep("style")}
                  >
                    重新选择
                  </button>
                </div>

                {/* Document to rewrite */}
                <div className="doc-rewrite-section">
                  <label className="doc-rewrite-label">需要改写的文档</label>
                  <div className="doc-rewrite-mode-tabs">
                    <button
                      className={`doc-rewrite-mode-tab ${docInputMode === "upload" ? "active" : ""}`}
                      onClick={() => setDocInputMode("upload")}
                    >
                      <Upload size={12} />
                      上传文件
                    </button>
                    <button
                      className={`doc-rewrite-mode-tab ${docInputMode === "paste" ? "active" : ""}`}
                      onClick={() => setDocInputMode("paste")}
                    >
                      <ClipboardPaste size={12} />
                      粘贴文本
                    </button>
                  </div>

                  {docInputMode === "upload" ? (
                    <div
                      className="doc-rewrite-upload"
                      onClick={() => docFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileUpload(file, "doc");
                      }}
                    >
                      {docFileName ? (
                        <div className="doc-rewrite-file-loaded">
                          <FileText size={14} />
                          <span>{docFileName}</span>
                          <button
                            className="icon-btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocText("");
                              setDocFileName(null);
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={20} />
                          <span>点击或拖拽上传文件</span>
                          <span className="doc-rewrite-upload-hint">
                            支持 TXT、MD、DOCX、PDF、Excel
                          </span>
                        </>
                      )}
                      <input
                        ref={docFileInputRef}
                        type="file"
                        accept=".txt,.md,.docx,.pdf,.xlsx,.xls"
                        className="hidden-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "doc");
                          e.target.value = "";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="doc-rewrite-paste">
                      <textarea
                        className="doc-rewrite-textarea"
                        value={pastedDocText}
                        onChange={(e) => setPastedDocText(e.target.value)}
                        placeholder="在此粘贴需要改写的文档内容..."
                        rows={6}
                      />
                      {pastedDocText && (
                        <button
                          className="doc-rewrite-confirm-btn"
                          onClick={() => {
                            setDocText(pastedDocText);
                            setDocFileName(null);
                          }}
                        >
                          确认文本
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Requirements */}
                <div className="doc-rewrite-section">
                  <label className="doc-rewrite-label">额外要求（可选）</label>
                  <textarea
                    className="doc-rewrite-textarea doc-rewrite-textarea-sm"
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    placeholder="例如：保持专业术语不变、增加段落之间的过渡、语气更正式等..."
                    rows={3}
                  />
                </div>

                {/* Rewrite button */}
                <button
                  className="doc-rewrite-primary-btn"
                  onClick={isRewriting ? handleStopRewrite : handleRewrite}
                  disabled={!styleProfile.trim() || !docText.trim()}
                >
                  {isRewriting ? (
                    <>
                      <X size={14} />
                      停止改写
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} />
                      开始改写
                    </>
                  )}
                  </button>
              </div>
              </div>
            )}
            </div>
          )}

          {rewriteError && <div className="doc-rewrite-error">{rewriteError}</div>}

          {/* Result panel: only show when rewriting or has result */}
          {(rewriteResult || isRewriting) && (
            <div className="doc-rewrite-result">
              <div className="doc-rewrite-result-header">
                <div className="doc-rewrite-result-title">
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setRewriteResult("");
                      setIsRewriting(false);
                      setConfigCollapsed(false);
                      setRewriteHistory([]);
                    }}
                    title="返回修改"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  {isRewriting && <Loader2 size={14} className="spin" />}
                  <span>{isRewriting ? "正在改写..." : "改写结果"}</span>
                </div>
                {!isRewriting && rewriteResult && (
                  <div className="doc-rewrite-result-actions">
                    <button className="report-action-btn" onClick={handleCopy}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "已复制" : "复制"}
                    </button>
                    <button className="report-action-btn" onClick={handleDownloadDocx}>
                      <Download size={14} />
                      下载 docx
                    </button>
                  </div>
                )}
              </div>
              <div className="doc-rewrite-result-panels">
                {showPartialRewritePanel && !isRewriting ? (
                  <>
                    {/* Rewrite mode: 改写后 shifts left, instruction panel on right */}
                    {rewrittenPanel}
                    <div className="doc-rewrite-inline-rewrite">
                    <div className="doc-rewrite-inline-rewrite-header">
                      <Wand2 size={12} />
                      <span>局部改写选中文本</span>
                    </div>
                    {/* Full selected text, fully shown (red border, yellow tint) */}
                    <div className="doc-rewrite-inline-rewrite-selected">
                      {partialSelectedText}
                    </div>
                    <textarea
                      ref={partialInputRef}
                      className="doc-rewrite-inline-rewrite-input"
                      placeholder="输入改写指令，如：更正式、更简洁…（Ctrl+Enter 提交）"
                      value={partialInstruction}
                      onChange={(e) => {
                        setPartialInstruction(e.target.value);
                        adjustPartialInput();
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          (e.ctrlKey || e.metaKey) &&
                          partialInstruction.trim() &&
                          !isPartialRewriting
                        ) {
                          e.preventDefault();
                          handlePartialRewrite();
                        }
                        if (e.key === "Escape") {
                          setShowPartialRewritePanel(false);
                        }
                      }}
                      rows={3}
                      autoFocus
                      disabled={isPartialRewriting}
                    />
                    {partialRewriteError && (
                      <div className="doc-rewrite-error">{partialRewriteError}</div>
                    )}
                    <div className="doc-rewrite-inline-rewrite-actions">
                      <button
                        className="doc-rewrite-confirm-btn"
                        onClick={handlePartialRewrite}
                        disabled={!partialInstruction.trim() || isPartialRewriting}
                      >
                        {isPartialRewriting ? (
                          <>
                            <Loader2 size={12} className="spin" />
                            改写中...
                          </>
                        ) : (
                          <>
                            <Wand2 size={12} />
                       改写
                   </>
                 )}
                    </button>
                    <span className="doc-rewrite-actions-gap" />
                    <button
                      className="doc-rewrite-cancel-btn"
                      onClick={() => {
                        setShowPartialRewritePanel(false);
                        setPartialInstruction("");
                        setPartialRewriteError(null);
                      }}
                      disabled={isPartialRewriting}
                    >
                      <X size={12} />
                      取消
                    </button>
                  </div>
                </div>
                </>
              ) : (
                 /* Normal mode: 原文 (left) | 改写后 (right) */
                 <>
                    <div className="doc-rewrite-result-panel">
                      <div className="doc-rewrite-result-panel-header">原文</div>
                      <div className="doc-rewrite-result-panel-content">{docText}</div>
                    </div>
                    {rewrittenPanel}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating partial-rewrite toolbar */}
      {showPartialToolbar && toolbarPosition && !isRewriting && (
        <div
          className="doc-rewrite-partial-toolbar"
          style={{
            position: "fixed",
            top: `${toolbarPosition.top}px`,
            left: `${toolbarPosition.left}px`,
            transform: toolbarPosition.below ? "none" : "translateY(-100%)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="doc-rewrite-partial-toolbar-actions">
            <button
              className="report-action-btn"
              onClick={() => {
                navigator.clipboard.writeText(partialSelectedText);
                setShowPartialToolbar(false);
                window.getSelection()?.removeAllRanges();
              }}
              title="复制选中文本"
            >
              <Copy size={13} />
              复制
            </button>
            <button
              className="report-action-btn"
              onClick={() => {
                setShowPartialToolbar(false);
                setShowPartialRewritePanel(true);
              }}
              title="局部改写选中文本"
            >
              <Wand2 size={13} />
              改写
            </button>
          </div>
        </div>
     )}
      {showProfileList && profileDropdownPos && typeof document !== "undefined"
        ? createPortal(
            <div
              className="doc-rewrite-profile-portal doc-rewrite-select-dropdown is-portal"
              style={{
                position: "fixed",
                top: profileDropdownPos.top,
                left: profileDropdownPos.left,
                width: profileDropdownPos.width,
                maxHeight: profileDropdownPos.maxHeight,
                zIndex: 1000,
              }}
              role="listbox"
            >
              {profiles.length === 0 ? (
                <div className="doc-rewrite-select-empty">暂无保存的风格</div>
              ) : (
                profiles.map((p) => (
                  <div
                    key={p.id}
                    className={`doc-rewrite-select-item ${selectedProfileId === p.id ? "active" : ""}`}
                    onClick={() => handleSelectProfile(p)}
                  >
                    <span>{p.name}</span>
                    <button
                      className="icon-btn-sm danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProfile(p.id);
                      }}
                      title="删除"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
              {/* Footer: create a new style via reference upload */}
              <div
                className="doc-rewrite-select-item doc-rewrite-select-add"
                onClick={startNewStyle}
              >
                <Plus size={12} />
                <span>新增风格</span>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
