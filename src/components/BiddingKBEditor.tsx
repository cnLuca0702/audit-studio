"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Pencil, Trash2, Save, X, Loader2, FileText, AlertTriangle, Upload } from "lucide-react";

export interface KBEditorItem {
  id: string;
  name: string;
  text: string;
  created?: number;
  /** True for the built-in default knowledge base (read from reference.md). */
  isDefault?: boolean;
}

interface BiddingKBEditorProps {
  item: KBEditorItem;
  /** "view" shows text read-only; "edit" shows editable name+text. */
  mode: "view" | "edit";
  saving?: boolean;
  onClose: () => void;
  onSave?: (patch: { name: string; text: string }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  /** Optional: when editing the default KB, allow replacing it via file upload. */
  onReplaceFile?: (file: File) => Promise<void> | void;
}

export function BiddingKBEditor({
  item,
  mode,
  saving,
  onClose,
  onSave,
  onDelete,
  onReplaceFile,
}: BiddingKBEditorProps) {
  const [name, setName] = useState(item.name);
  const [text, setText] = useState(item.text);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when the target item changes (e.g. user re-opens another KB).
  useEffect(() => {
    setName(item.name);
    setText(item.text);
    setError(null);
    setConfirmingDelete(false);
  }, [item.id, item.name, item.text]);

  // Esc to close, Cmd/Ctrl+S to save (only in edit mode).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (
        mode === "edit" &&
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        void commit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, name, text]);

  const dirty = mode === "edit" && (name.trim() !== item.name || text !== item.text);

  const commit = async () => {
    if (mode !== "edit" || !onSave) return;
    const nextName = name.trim();
    if (!nextName) {
      setError("名称不能为空");
      return;
    }
    if (!text.trim()) {
      setError("知识库内容不能为空");
      return;
    }
    setError(null);
    try {
      await onSave({ name: nextName, text });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    try {
      await onDelete();
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setConfirmingDelete(false);
    }
  };

  const handleReplaceFile = async (file: File) => {
    if (!onReplaceFile) return;
    setReplacing(true);
    setError(null);
    try {
      await onReplaceFile(file);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setReplacing(false);
    }
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="bidding-kb-modal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bidding-kb-modal" onClick={stop}>
        <div className="bidding-kb-modal-header">
          <div className="bidding-kb-modal-title">
            {mode === "view" ? <Eye size={16} /> : <Pencil size={16} />}
            <span>{mode === "view" ? "查看知识库" : "编辑知识库"}</span>
            {item.isDefault && <span className="bidding-kb-badge">默认</span>}
          </div>
          <button className="bidding-kb-modal-close" onClick={onClose} title="关闭 (Esc)">
            <X size={16} />
          </button>
        </div>

        <div className="bidding-kb-modal-body">
          {mode === "edit" ? (
            <>
              <label className="bidding-kb-modal-label">名称</label>
              <input
                className="bidding-kb-modal-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="知识库名称"
                autoFocus={!item.isDefault}
                maxLength={120}
              />

              <label className="bidding-kb-modal-label">
                内容
                <span className="bidding-kb-modal-counter">{text.length.toLocaleString()} 字</span>
              </label>
              <textarea
                className="bidding-kb-modal-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="知识库正文内容（法律法规、规章、技术标准等审查参考资料）"
                spellCheck={false}
              />

              {item.isDefault && onReplaceFile && (
                <div className="bidding-kb-modal-replace">
                  <div className="bidding-kb-modal-replace-hint">
                    提示：默认知识库通常很大，可直接上传文件覆盖当前内容。
                  </div>
                  <button
                    type="button"
                    className="bidding-kb-modal-btn"
                    onClick={() => replaceInputRef.current?.click()}
                    disabled={replacing || saving}
                  >
                    {replacing ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
                    {replacing ? "上传并覆盖中…" : "上传文件覆盖默认知识库"}
                  </button>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleReplaceFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bidding-kb-modal-meta">
                <FileText size={13} />
                <span className="bidding-kb-modal-meta-name">{item.name}</span>
                <span className="bidding-kb-modal-meta-len">{item.text.length.toLocaleString()} 字</span>
              </div>
              <pre className="bidding-kb-modal-pre">{item.text || "（空内容）"}</pre>
            </>
          )}

          {error && <div className="bidding-kb-modal-error">{error}</div>}
        </div>

        <div className="bidding-kb-modal-footer">
          {mode === "edit" && onDelete && !item.isDefault && (
            confirmingDelete ? (
              <div className="bidding-kb-confirm">
                <AlertTriangle size={14} />
                <span>确定删除？</span>
                <button className="danger small" onClick={handleDelete}>
                  删除
                </button>
                <button className="small" onClick={() => setConfirmingDelete(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button
                className="bidding-kb-modal-danger"
                onClick={() => setConfirmingDelete(true)}
                disabled={!!saving}
              >
                <Trash2 size={13} /> 删除
              </button>
            )
          )}

          <div className="bidding-kb-modal-footer-right">
            <button className="bidding-kb-modal-btn" onClick={onClose} disabled={!!saving}>
              取消
            </button>
            {mode === "edit" && onSave && (
              <button
                className="bidding-kb-modal-btn primary"
                onClick={commit}
                disabled={!!saving || !dirty}
                title={dirty ? "保存 (⌘/Ctrl+S)" : "未修改"}
              >
                {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                保存
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}