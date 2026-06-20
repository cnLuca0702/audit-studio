"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  X,
  Plus,
  Search,
  Loader2,
  Download,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { saveAs } from "file-saver";
import { BiddingReportView } from "./BiddingReportView";
import { BiddingKBEditor, type KBEditorItem } from "./BiddingKBEditor";
import { buildBiddingHTML, type BiddingReviewResult } from "@/lib/bidding-report";
import { useAppHistory } from "@/hooks/useAppHistory";

interface KBItem {
  id: string;
  name: string;
  text: string;
  created: number;
}

const PHASE_TITLE: Record<string, string> = {
  extracting: "正在提取招标文件关键信息",
  reviewing: "正在进行合规性审查与报价敏感度分析",
  done: "审查完成",
};

function projectName(result: BiddingReviewResult): string {
  const t = result.sections[0]?.infoTable?.find((kv) => kv.label.includes("项目名称"));
  return t?.value || result.cover.subtitle || "招标文件";
}

export function BiddingReview() {
  const { saveToHistory } = useAppHistory();
  const docInputRef = useRef<HTMLInputElement>(null);
  const kbInputRef = useRef<HTMLInputElement>(null);

  const [docText, setDocText] = useState("");
  const [docFileName, setDocFileName] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [defaultKb, setDefaultKb] = useState<{ name: string; missing: boolean } | null>(null);
  const [kbList, setKbList] = useState<KBItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadingKb, setUploadingKb] = useState(false);

  // KB view / edit / delete modal state
  const [kbModal, setKbModal] = useState<KBEditorItem | null>(null);
  const [kbModalMode, setKbModalMode] = useState<"view" | "edit">("view");
  const [kbSaving, setKbSaving] = useState(false);
  const defaultKbTextRef = useRef<string>("");

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [phaseMessage, setPhaseMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<BiddingReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // elapsed timer
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  // load default kb meta + user kb list
  const refreshKb = useCallback(async () => {
    try {
      const [defRes, listRes] = await Promise.all([
        fetch("/api/bidding-review/kb/default"),
        fetch("/api/bidding-review/kb"),
      ]);
      const def = await defRes.json();
      setDefaultKb({ name: def.name || "默认知识库", missing: !!def.missing });
      const list = await listRes.json();
      setKbList(list.items ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshKb();
  }, [refreshKb]);

  const uploadDoc = async (file: File) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx"].includes(ext)) {
      setError("招标文件仅支持 pdf 或 docx 格式");
      return;
    }
    setUploadingDoc(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/doc-rewrite/extract-text", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setDocText(data.text || "");
      setDocFileName(file.name);
    } catch {
      setError("招标文件上传失败");
    } finally {
      setUploadingDoc(false);
    }
  };

  const uploadKb = async (file: File) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx", "txt", "md"].includes(ext)) {
      setError("知识库仅支持 pdf/docx/txt/md 格式");
      return;
    }
    setUploadingKb(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/bidding-review/kb", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      await refreshKb();
    } catch {
      setError("知识库上传失败");
    } finally {
      setUploadingKb(false);
    }
  };

  const toggleKb = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── KB view / edit / delete ─────────────────────────────────────────────
  const openDefaultKb = async (mode: "view" | "edit") => {
    setError(null);
    try {
      const res = await fetch("/api/bidding-review/kb/default?full=1");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "加载默认知识库失败");
        return;
      }
      const data = await res.json();
      const text = typeof data.text === "string" ? data.text : "";
      defaultKbTextRef.current = text;
      setKbModal({
        id: "__default__",
        name: data.name || defaultKb?.name || "默认知识库",
        text,
        isDefault: true,
      });
      setKbModalMode(mode);
    } catch (err: any) {
      setError(err?.message ?? "加载默认知识库失败");
    }
  };

  const openUserKb = (kb: KBItem, mode: "view" | "edit") => {
    setError(null);
    setKbModal({
      id: kb.id,
      name: kb.name,
      text: kb.text,
      created: kb.created,
      isDefault: false,
    });
    setKbModalMode(mode);
  };

  const handleSaveKb = async (patch: { name: string; text: string }) => {
    if (!kbModal) return;
    setKbSaving(true);
    try {
      if (kbModal.isDefault) {
        const res = await fetch("/api/bidding-review/kb/default", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: patch.name, text: patch.text }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "保存失败");
        defaultKbTextRef.current = patch.text;
        setDefaultKb((prev) => ({ name: patch.name, missing: false }));
      } else {
        const res = await fetch(`/api/bidding-review/kb/${encodeURIComponent(kbModal.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "保存失败");
        await refreshKb();
      }
      setKbModal(null);
    } finally {
      setKbSaving(false);
    }
  };

  const handleDeleteKb = async () => {
    if (!kbModal || kbModal.isDefault) return;
    setKbSaving(true);
    try {
      const res = await fetch(`/api/bidding-review/kb/${encodeURIComponent(kbModal.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "删除失败");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(kbModal.id);
        return next;
      });
      await refreshKb();
      setKbModal(null);
    } finally {
      setKbSaving(false);
    }
  };

  /** Replace default KB text by uploading a new pdf/docx/txt/md file. */
  const replaceDefaultKbFile = async (file: File) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx", "txt", "md"].includes(ext)) {
      setError("默认知识库仅支持 pdf/docx/txt/md 格式");
      return;
    }
    setUploadingKb(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const extract = await fetch("/api/doc-rewrite/extract-text", { method: "POST", body: fd });
      const extracted = await extract.json();
      if (extracted.error) {
        setError(extracted.error);
        return;
      }
      const text = (extracted.text || "").trim();
      if (!text) {
        setError("无法从文件中提取文本");
        return;
      }
      const save = await fetch("/api/bidding-review/kb/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: defaultKb?.name ?? "默认知识库", text }),
      });
      const saved = await save.json().catch(() => ({}));
      if (!save.ok) {
        setError(saved.error ?? "保存默认知识库失败");
        return;
      }
      defaultKbTextRef.current = text;
      setDefaultKb((prev) => ({ name: prev?.name ?? "默认知识库", missing: false }));
      await refreshKb();
    } catch (err: any) {
      setError(err?.message ?? "替换默认知识库失败");
    } finally {
      setUploadingKb(false);
    }
  };

  const startReview = async () => {
    if (!docText.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPhase("extracting");
    setPhaseMessage("正在提取招标文件关键信息…");
    setElapsed(0);

    const selectedTexts = kbList.filter((k) => selected.has(k.id)).map((k) => k.text);

    try {
      const res = await fetch("/api/bidding-review/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentText: docText, knowledgeBases: selectedTexts }),
      });
      if (!res.body) {
        setError("审查请求失败");
        setLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let got: BiddingReviewResult | null = null;
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
              if (evt.phase) {
                setPhase(evt.phase);
                if (evt.message) setPhaseMessage(evt.message);
              }
              if (evt.error) setError(evt.error);
              if (evt.result) {
                got = evt.result;
                setResult(evt.result);
                setPhase("done");
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      if (got) {
        const name = projectName(got);
        saveToHistory(
          "bidding",
          `招标审查: ${name}`,
          JSON.stringify(got),
          `${name} · 高风险 ${got.summary.high} 项 / 中风险 ${got.summary.medium} 项 / 低风险 ${got.summary.low} 项`
        );
      }
    } catch {
      setError("审查过程中断，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadHTML = () => {
    if (!result) return;
    const html = buildBiddingHTML(result);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    saveAs(blob, `${projectName(result)}审查报告.html`);
  };

  return (
    <div className="bidding-review">
      <div className="app-page-header bidding-header">
        <h2 className="app-page-title bidding-title">招标文件审查</h2>
        <p className="app-page-subtitle bidding-subtitle">
          上传招标文件，依据招标投标法律法规自动进行合规性审查与报价敏感度分析，生成结构化审查报告
        </p>
      </div>

      {/* ① 招标文件 */}
      <div className="bidding-section">
        <div className="bidding-section-title">① 招标文件</div>
        <div
          className="bidding-upload"
          onClick={() => !docFileName && docInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f && !docFileName) uploadDoc(f);
          }}
        >
          {uploadingDoc ? (
            <div className="bidding-upload-state">
              <Loader2 size={20} className="spin" /> 正在解析文件…
            </div>
          ) : docFileName ? (
            <div className="bidding-file-loaded">
              <FileText size={18} />
              <span className="bidding-file-name">{docFileName}</span>
              <span className="bidding-file-meta">{docText.length} 字</span>
              <button
                className="bidding-file-remove"
                title="移除"
                onClick={(e) => {
                  e.stopPropagation();
                  setDocFileName("");
                  setDocText("");
                }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="bidding-upload-empty">
              <Upload size={22} />
              <p>点击或拖拽上传招标文件</p>
              <span>支持 pdf / docx，单个文件</span>
            </div>
          )}
        </div>
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.docx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadDoc(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* ② 知识库 */}
      <div className="bidding-section">
        <div className="bidding-section-title">② 审查知识库</div>
        <div className="bidding-kb-list">
          <div className="bidding-kb-item default">
            <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked disabled />
              <span className="bidding-kb-name">{defaultKb?.name || "默认知识库"}</span>
              {defaultKb?.missing && <span className="bidding-kb-warn">未加载</span>}
              <span className="bidding-kb-badge">必选</span>
            </label>
            <div className="bidding-kb-actions">
              <button
                type="button"
                className="bidding-kb-action"
                title="查看"
                onClick={() => openDefaultKb("view")}
              >
                <Eye size={14} />
              </button>
              <button
                type="button"
                className="bidding-kb-action"
                title="编辑"
                onClick={() => openDefaultKb("edit")}
              >
                <Pencil size={14} />
              </button>
            </div>
          </div>

          {kbList.map((kb) => (
            <div key={kb.id} className="bidding-kb-item">
              <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={selected.has(kb.id)}
                  onChange={() => toggleKb(kb.id)}
                />
                <span className="bidding-kb-name">{kb.name}</span>
                <span className="bidding-kb-meta">{kb.text.length} 字</span>
              </label>
              <div className="bidding-kb-actions">
                <button
                  type="button"
                  className="bidding-kb-action"
                  title="查看"
                  onClick={() => openUserKb(kb, "view")}
                >
                  <Eye size={14} />
                </button>
                <button
                  type="button"
                  className="bidding-kb-action"
                  title="编辑"
                  onClick={() => openUserKb(kb, "edit")}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="bidding-kb-action danger"
                  title="删除"
                  onClick={() => openUserKb(kb, "edit")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <button
            className="bidding-kb-upload"
            onClick={() => kbInputRef.current?.click()}
            disabled={uploadingKb}
          >
            {uploadingKb ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {uploadingKb ? "上传中…" : "上传知识库（pdf/docx）"}
          </button>
          <input
            ref={kbInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadKb(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* 开始审查 */}
      <button
        className="bidding-start-btn"
        disabled={!docText.trim() || loading}
        onClick={startReview}
      >
        {loading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
        {loading ? "审查中…" : "开始审查"}
      </button>

      {error && <div className="bidding-error">{error}</div>}

      {loading && (
        <div className="bidding-loading">
          <Loader2 size={28} className="spin" />
          <div className="bidding-loading-body">
            <div className="bidding-loading-title">{PHASE_TITLE[phase] || "审查中"}</div>
            <div className="bidding-loading-msg">{phaseMessage}</div>
            <div className="bidding-loading-elapsed">
              已运行 {elapsed} 秒{elapsed > 60 && "（审查通常需要 1-3 分钟）"}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="bidding-result">
          <div className="bidding-result-header">
            <div className="bidding-summary">
              <span className="bidding-risk-badge high">高风险 {result.summary.high}</span>
              <span className="bidding-risk-badge medium">中风险 {result.summary.medium}</span>
              <span className="bidding-risk-badge low">低风险 {result.summary.low}</span>
            </div>
            <button className="bidding-dl-btn" onClick={handleDownloadHTML}>
              <Download size={14} /> 下载 HTML
            </button>
          </div>
          <BiddingReportView result={result} />
        </div>
      )}

      {kbModal && (
        <BiddingKBEditor
          item={kbModal}
          mode={kbModalMode}
          saving={kbSaving}
          onClose={() => {
            if (kbSaving) return;
            setKbModal(null);
          }}
          onSave={kbModalMode === "edit" ? handleSaveKb : undefined}
          onDelete={!kbModal.isDefault ? handleDeleteKb : undefined}
          onReplaceFile={kbModal.isDefault ? replaceDefaultKbFile : undefined}
        />
      )}
    </div>
  );
}
