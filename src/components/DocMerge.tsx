"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  ClipboardPaste,
  FileText,
  X,
  Plus,
  Copy,
  Download,
  Check,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import { useAppHistory } from "@/hooks/useAppHistory";

type Step = "input" | "result";
type InputMode = "upload" | "paste";
type MergeMode = "supplement" | "newdoc";

const MERGE_PROMPTS: Record<MergeMode, string> = {
  supplement:
    "以主文档内容为基础，把辅助文档内容按照对应提示词要求对主文档进行补充完善。保持主文档的章节结构和行文风格，在相关章节中融入辅助文档的内容，使文档更加完整充实。",
  newdoc:
    "模仿主文档的叙述逻辑、文章结构、文字风格，将辅助文档的内容按照对应提示词要求整合进去，生成一篇新文档。新文档应继承主文档的框架和语气，但内容来自所有文档的有机整合。",
};

interface AuxDoc {
  id: string;
  text: string;
  fileName: string;
  prompt: string;
  inputMode: InputMode;
  pastedText: string;
}

interface HistoryEntry {
  text: string;
  type: "merge";
}

export function DocMerge() {
  const { saveToHistory } = useAppHistory();
  const [step, setStep] = useState<Step>("input");

  // Main document
  const [mainText, setMainText] = useState("");
  const [mainFileName, setMainFileName] = useState("");
  const [mainInputMode, setMainInputMode] = useState<InputMode>("upload");
  const [pastedMainText, setPastedMainText] = useState("");
  const mainFileInputRef = useRef<HTMLInputElement>(null);

  // Auxiliary documents
  const [auxDocs, setAuxDocs] = useState<AuxDoc[]>([]);

  // Merge
  const [mergeMode, setMergeMode] = useState<MergeMode>("supplement");
  const [mergeResult, setMergeResult] = useState("");
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const mergeAbortRef = useRef<AbortController | null>(null);

  // Undo history
  const [mergeHistory, setMergeHistory] = useState<HistoryEntry[]>([]);

  // Save to history when merge completes
  useEffect(() => {
    if (mergeResult && step === "result") {
      saveToHistory("merge", "文档合并", mergeResult);
    }
  }, [mergeResult, step]);

  // UI
  const [copied, setCopied] = useState(false);

  // ── File upload ──
  async function handleFileUpload(file: File, target: "main" | string) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/doc-rewrite/extract-text", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "文件解析失败");

      if (target === "main") {
        setMainText(data.text);
        setMainFileName(file.name);
      } else {
        updateAuxDoc(target, { text: data.text, fileName: file.name });
      }
    } catch (err: any) {
      alert(err.message || "文件解析失败");
    }
  }

  // ── Aux doc management ──
  function addAuxDoc() {
    setAuxDocs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: "",
        fileName: "",
        prompt: "",
        inputMode: "upload",
        pastedText: "",
      },
    ]);
  }

  function removeAuxDoc(id: string) {
    setAuxDocs((prev) => prev.filter((d) => d.id !== id));
  }

  function updateAuxDoc(id: string, patch: Partial<AuxDoc>) {
    setAuxDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // ── Undo ──
  function pushHistory() {
    setMergeHistory((prev) => [...prev, { text: mergeResult, type: "merge" }]);
  }

  function handleUndo() {
    if (mergeHistory.length === 0) return;
    const prev = mergeHistory[mergeHistory.length - 1];
    setMergeHistory((h) => h.slice(0, -1));
    setMergeResult(prev.text);
    setMergeError(null);
  }

  // ── Merge ──
  async function handleMerge() {
    const validAux = auxDocs.filter((d) => d.text.trim());
    if (!mainText.trim() || validAux.length === 0 || isMerging) return;

    if (mergeResult) pushHistory();

    setMergeResult("");
    setMergeError(null);
    setIsMerging(true);
    setStep("result");
    mergeAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/doc-merge/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainText,
          mainFileName,
          auxDocs: validAux.map((d) => ({
            text: d.text,
            fileName: d.fileName,
            prompt: d.prompt,
          })),
          mergePrompt: MERGE_PROMPTS[mergeMode],
          includeMainAsAux: true,
        }),
        signal: mergeAbortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "合并失败");
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
              setMergeError(parsed.error);
              break;
            }
            if (parsed.warning) {
              setMergeError(parsed.warning);
            }
            if (parsed.content) {
              fullContent += parsed.content;
              setMergeResult(fullContent);
            }
          } catch {
            /* skip */
          }
        }
      }

      if (sseBuffer.trim()) {
        const trimmed = sseBuffer.trim();
        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload !== "[DONE]") {
            try {
              const parsed = JSON.parse(payload);
              if (parsed.content) {
                fullContent += parsed.content;
                setMergeResult(fullContent);
              }
            } catch {
              /* skip */
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMergeError(err.message || "合并出错");
      }
    } finally {
      setIsMerging(false);
      mergeAbortRef.current = null;
    }
  }

  function handleStopMerge() {
    mergeAbortRef.current?.abort();
  }

  // ── Utilities ──
  function stripMarkdown(md: string): string {
    const thinkPattern = new RegExp("<think>[\\s\\S]*?(?:<" + "/think>|$)", "gi");
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(stripMarkdown(mergeResult));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("复制失败");
    }
  }

  async function handleDownloadDocx() {
    try {
      const res = await fetch("/api/doc-rewrite/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: stripMarkdown(mergeResult),
          filename: "合并文档.docx",
        }),
      });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "合并文档.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    }
  }

  function handleConfirmMain() {
    if (mainInputMode === "paste" && pastedMainText.trim()) {
      setMainText(pastedMainText);
      setMainFileName("");
    }
  }

  function confirmAllAndMerge() {
    auxDocs.forEach((doc) => {
      if (doc.inputMode === "paste" && doc.pastedText.trim() && !doc.text.trim()) {
        updateAuxDoc(doc.id, { text: doc.pastedText, fileName: "" });
      }
    });
    handleMerge();
  }

  function handleBackToInput() {
    setMergeResult("");
    setMergeError(null);
    setMergeHistory([]);
    setStep("input");
  }

  const mainReady = mainInputMode === "upload" ? !!mainText.trim() : !!pastedMainText.trim();
  const auxReady = auxDocs.some((d) => d.text.trim() || (d.inputMode === "paste" && d.pastedText.trim()));

  // Preview text: prefer mainText (from upload), fall back to pastedMainText
  const previewText = mainText || pastedMainText;

  return (
    <div className="doc-merge-container">
      {/* Header */}
      <div className="app-page-header doc-merge-header">
        <h2 className="app-page-title">文档合并</h2>
        <p className="app-page-subtitle doc-merge-subtitle">
          上传主文档确定框架，添加辅助文档并设定使用提示词，一键合并
        </p>
      </div>

      {/* ── Input view: two columns ── */}
      {step === "input" && (
        <div className="doc-merge-input-row">
          {/* ── Left column: Main document (35%) ── */}
          <div className="doc-merge-main-col">
            <div className="doc-merge-section-title">
              <span className="doc-merge-step-badge">1</span>
              主文档
              <span className="doc-merge-section-hint">确定框架和风格</span>
            </div>

            {/* Compact upload/paste tabs */}
            <div className="doc-rewrite-mode-tabs">
              <button
                className={`doc-rewrite-mode-tab ${mainInputMode === "upload" ? "active" : ""}`}
                onClick={() => setMainInputMode("upload")}
              >
                <Upload size={12} /> 上传
              </button>
              <button
                className={`doc-rewrite-mode-tab ${mainInputMode === "paste" ? "active" : ""}`}
                onClick={() => setMainInputMode("paste")}
              >
                <ClipboardPaste size={12} /> 粘贴
              </button>
            </div>

            {/* Compact upload zone */}
            {mainInputMode === "upload" ? (
              <div
                className="doc-rewrite-upload doc-merge-upload-compact"
                onClick={() => mainFileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file, "main");
                }}
              >
                {mainFileName ? (
                  <div className="doc-rewrite-file-loaded">
                    <FileText size={14} />
                    <span>{mainFileName}</span>
                    <span className="doc-merge-file-chars">{mainText.length} 字</span>
                    <button
                      className="icon-btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMainText("");
                        setMainFileName("");
                        if (mainFileInputRef.current) mainFileInputRef.current.value = "";
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload size={16} />
                    <span>点击或拖拽上传</span>
                  </>
                )}
                <input
                  ref={mainFileInputRef}
                  type="file"
                  accept=".txt,.md,.docx,.pdf,.xlsx,.xls"
                  className="hidden-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, "main");
                  }}
                />
              </div>
            ) : (
              <textarea
                className="doc-rewrite-textarea doc-merge-paste-compact"
                value={pastedMainText}
                onChange={(e) => setPastedMainText(e.target.value)}
                onBlur={handleConfirmMain}
                placeholder="在此粘贴主文档内容..."
              />
            )}

            {/* Always-visible preview */}
            <div className="doc-merge-preview">
              <div className="doc-merge-preview-label">
                内容预览
                {previewText && (
                  <span className="doc-merge-preview-chars">{previewText.length} 字</span>
                )}
              </div>
              <div className="doc-merge-preview-text">
                {previewText ? (
                  previewText
                ) : (
                  <span className="doc-merge-preview-empty">
                    上传或粘贴主文档后，此处显示内容预览
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column: merge settings + aux docs + start button (65%) ── */}
          <div className="doc-merge-aux-col">
            {/* ② Merge settings */}
            <div className="doc-merge-settings">
              <div className="doc-merge-section-title">
                <span className="doc-merge-step-badge">2</span>
                合并方式
              </div>

              <label
                className={`doc-merge-radio ${mergeMode === "supplement" ? "doc-merge-radio-active" : ""}`}
              >
                <input
                  type="radio"
                  name="mergeMode"
                  checked={mergeMode === "supplement"}
                  onChange={() => setMergeMode("supplement")}
                />
                <span className="doc-merge-radio-text">
                  <strong>补充完善</strong>
                  <span>以主文档为基础，将辅助文档内容融入对应章节，完善主文档</span>
                </span>
              </label>

              <label
                className={`doc-merge-radio ${mergeMode === "newdoc" ? "doc-merge-radio-active" : ""}`}
              >
                <input
                  type="radio"
                  name="mergeMode"
                  checked={mergeMode === "newdoc"}
                  onChange={() => setMergeMode("newdoc")}
                />
                <span className="doc-merge-radio-text">
                  <strong>生成新文档</strong>
                  <span>模仿主文档风格与结构，整合所有内容生成全新文档</span>
                </span>
              </label>
            </div>

            {/* ③ Auxiliary documents */}
            <div className="doc-merge-section-title" style={{ marginTop: 4 }}>
              <span className="doc-merge-step-badge">3</span>
              辅助文档
              <span className="doc-merge-section-hint">设定使用提示词</span>
            </div>

            <div className="doc-merge-aux-scroll">
              {auxDocs.map((doc, idx) => (
                <AuxDocCard
                  key={doc.id}
                  doc={doc}
                  index={idx}
                  onUpdate={(patch) => updateAuxDoc(doc.id, patch)}
                  onRemove={() => removeAuxDoc(doc.id)}
                  onFileUpload={(file) => handleFileUpload(file, doc.id)}
                />
              ))}

              <button className="doc-merge-btn-add" onClick={addAuxDoc}>
                <Plus size={14} /> 添加辅助文档
              </button>
            </div>

            {/* ④ Start merge button */}
            <div className="doc-merge-start-bar">
              {!mainReady && (
                <span className="doc-merge-hint">请先上传主文档</span>
              )}
              {mainReady && !auxReady && (
                <span className="doc-merge-hint">请至少添加一份辅助文档</span>
              )}
              <button
                className="doc-merge-btn-primary doc-merge-btn-start"
                disabled={!mainReady || !auxReady}
                onClick={confirmAllAndMerge}
              >
                开始合并
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Result view ── */}
      {step === "result" && (
        <div className="doc-merge-result">
          <div className="doc-merge-result-header">
            <button className="doc-merge-btn-back" onClick={handleBackToInput}>
              <ArrowLeft size={14} /> 返回编辑
            </button>
            <span className="doc-merge-result-title">
              {isMerging ? "合并中..." : "合并结果"}
            </span>
            <div className="doc-merge-header-actions">
              {isMerging && (
                <button
                  className="doc-merge-btn-stop"
                  onClick={handleStopMerge}
                >
                  停止
                </button>
              )}
              {!isMerging && mergeResult && (
                <>
                  <button
                    className="doc-merge-undo-btn"
                    onClick={handleUndo}
                    disabled={mergeHistory.length === 0}
                    title={
                      mergeHistory.length > 0
                        ? `撤回（剩余 ${mergeHistory.length} 次）`
                        : "无撤回历史"
                    }
                  >
                    <RotateCcw size={12} />
                    撤回{mergeHistory.length > 0 ? ` (${mergeHistory.length})` : ""}
                  </button>
                  <button
                    className="doc-merge-btn-action"
                    onClick={handleMerge}
                    title="重新合并"
                  >
                    <RotateCcw size={12} />
                    重新合并
                  </button>
                  <button
                    className="doc-merge-btn-action"
                    onClick={handleCopy}
                    title="复制"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "已复制" : "复制"}
                  </button>
                  <button
                    className="doc-merge-btn-action"
                    onClick={handleDownloadDocx}
                    title="下载 DOCX"
                  >
                    <Download size={12} />
                    下载 DOCX
                  </button>
                </>
              )}
            </div>
          </div>

          {mergeError && (
            <div className="doc-merge-error">{mergeError}</div>
          )}

          <div className="doc-merge-result-panels">
            <div className="doc-merge-result-panel">
              <div className="doc-merge-result-panel-header">主文档</div>
              <div className="doc-merge-result-panel-content">{mainText}</div>
            </div>
            <div className="doc-merge-result-panel">
              <div className="doc-merge-result-panel-header">合并初稿</div>
              <div className="doc-merge-result-panel-content">
                {mergeResult
                  ? stripMarkdown(mergeResult)
                  : isMerging
                    ? "等待输出..."
                    : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AuxDocCard sub-component (horizontal layout) ──
function AuxDocCard({
  doc,
  index,
  onUpdate,
  onRemove,
  onFileUpload,
}: {
  doc: AuxDoc;
  index: number;
  onUpdate: (patch: Partial<AuxDoc>) => void;
  onRemove: () => void;
  onFileUpload: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="doc-merge-aux-card">
      {/* Left: upload/paste zone */}
      <div className="doc-merge-aux-left">
        {doc.inputMode === "upload" ? (
          <div
            className="doc-merge-aux-upload"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) onFileUpload(file);
            }}
          >
            {doc.text ? (
              <>
                <FileText size={16} />
                <span className="doc-merge-aux-fname">{doc.fileName || "已上传"}</span>
                <span className="doc-merge-aux-chars">{doc.text.length} 字</span>
                <button
                  className="icon-btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ text: "", fileName: "" });
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <>
                <Upload size={14} />
                <span>上传文件</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.docx,.pdf,.xlsx,.xls"
              className="hidden-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileUpload(file);
              }}
            />
          </div>
        ) : (
          <textarea
            className="doc-merge-aux-paste"
            value={doc.pastedText}
            onChange={(e) => onUpdate({ pastedText: e.target.value })}
            onBlur={() => {
              if (doc.pastedText.trim()) {
                onUpdate({ text: doc.pastedText, fileName: "" });
              }
            }}
            placeholder="粘贴内容..."
          />
        )}
        <button
          className="doc-merge-aux-switch"
          onClick={() => onUpdate({ inputMode: doc.inputMode === "upload" ? "paste" : "upload" })}
          title={doc.inputMode === "upload" ? "切换为粘贴" : "切换为上传"}
        >
          {doc.inputMode === "upload" ? <ClipboardPaste size={12} /> : <Upload size={12} />}
        </button>
      </div>

      {/* Right: prompt + header */}
      <div className="doc-merge-aux-right">
        <div className="doc-merge-aux-header">
          <span className="doc-merge-aux-title">辅助文档 {index + 1}</span>
          <button className="icon-btn-sm" onClick={onRemove} title="删除">
            <X size={13} />
          </button>
        </div>
        <textarea
          className="doc-merge-aux-prompt"
          value={doc.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          placeholder="使用提示词，例如：总结核心观点并整合到第一章"
        />
      </div>
    </div>
  );
}
