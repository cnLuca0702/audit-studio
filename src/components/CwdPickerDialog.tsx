"use client";

import { useState, useEffect, useCallback } from "react";
import { X, FolderOpen, ChevronRight, Clock, Home } from "lucide-react";
import { displayPath, fetchDirectory, parentPath, type DirEntry } from "@/lib/files-api";

interface CwdPickerDialogProps {
  open: boolean;
  cwd: string;
  recentCwds: string[];
  homePath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function CwdPickerDialog({
  open,
  cwd,
  recentCwds,
  homePath = "",
  onClose,
  onSelect,
}: CwdPickerDialogProps) {
  const [browsePath, setBrowsePath] = useState(cwd);
  const [pathInput, setPathInput] = useState(cwd);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDir = useCallback(async (path: string) => {
    if (!path.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchDirectory(path.trim());
      setBrowsePath(data.path);
      setPathInput(data.path);
      setEntries(data.entries);
    } catch (err: any) {
      setError(err?.message ?? "无法读取该目录");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const start = cwd.trim() || homePath;
    if (start) loadDir(start);
  }, [open, cwd, homePath, loadDir]);

  const goUp = () => {
    if (!browsePath) return;
    const parent = parentPath(browsePath.replace(/\/+$/, ""));
    if (!parent || parent === browsePath.replace(/\/+$/, "")) return;
    loadDir(parent);
  };

  const applyPathInput = () => {
    loadDir(pathInput.trim());
  };

  const handleSelect = () => {
    if (!browsePath.trim()) return;
    onSelect(browsePath.trim());
    onClose();
  };

  if (!open) return null;

  return (
    <div className="cwd-picker-overlay" onClick={onClose}>
      <div className="cwd-picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cwd-picker-header">
          <h3 className="cwd-picker-title">选择工作目录</h3>
          <button type="button" className="cwd-picker-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {recentCwds.length > 0 && (
          <div className="cwd-picker-recent">
            <div className="cwd-picker-section-label">
              <Clock size={13} />
              最近使用
            </div>
            <div className="cwd-picker-recent-list">
              {recentCwds.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`cwd-picker-recent-item ${p === cwd ? "active" : ""}`}
                  title={p}
                  onClick={() => {
                    onSelect(p);
                    onClose();
                  }}
                >
                  {displayPath(p, homePath)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cwd-picker-path-row">
          <input
            className="cwd-picker-path-input"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyPathInput()}
            placeholder="输入绝对路径后按 Enter"
          />
          <button type="button" className="cwd-picker-path-go" onClick={applyPathInput}>
            前往
          </button>
        </div>

        <div className="cwd-picker-current">
          <FolderOpen size={14} />
          <span className="cwd-picker-current-text">{browsePath}</span>
        </div>

        <div className="cwd-picker-toolbar">
          <button type="button" className="cwd-picker-nav-btn" onClick={goUp}>
            ← 上级目录
          </button>
          {homePath && (
            <button type="button" className="cwd-picker-nav-btn" onClick={() => loadDir(homePath)}>
              <Home size={13} />
              主目录
            </button>
          )}
        </div>

        <div className="cwd-picker-list">
          {loading && <div className="cwd-picker-status">加载中...</div>}
          {!loading && error && <div className="cwd-picker-status error">{error}</div>}
          {!loading && !error && entries.length === 0 && (
            <div className="cwd-picker-status">此目录下没有子文件夹</div>
          )}
          {!loading && entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="cwd-picker-entry"
              onClick={() => loadDir(entry.path)}
            >
              <span>📁</span>
              <span className="cwd-picker-entry-name">{entry.name}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>

        <div className="cwd-picker-footer">
          <button type="button" className="cwd-picker-btn-cancel" onClick={onClose}>取消</button>
          <button type="button" className="cwd-picker-btn-confirm" onClick={handleSelect} disabled={!browsePath.trim()}>
            选择此目录
          </button>
        </div>
      </div>
    </div>
  );
}
