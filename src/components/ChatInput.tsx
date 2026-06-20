"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Send, Square, Paperclip, FolderOpen, Cpu, ChevronDown, X, Loader2 } from "lucide-react";
import { CwdPickerDialog } from "./CwdPickerDialog";
import { ProviderLogo } from "./ProviderLogo";
import { getProviderLabel, getProviderLogo } from "@/lib/provider-labels";

export interface AttachedFile {
  path: string;
  name: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

interface ChatInputProps {
  onSend: (message: string, attachedFiles?: AttachedFile[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  cwd?: string;
  homePath?: string;
  recentCwds?: string[];
  onCwdChange?: (cwd: string) => void;
  models?: ModelOption[];
  activeProvider?: string;
  activeModelId?: string;
  activeModelName?: string;
  onModelChange?: (provider: string, modelId: string) => void;
}

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
  placeholder = "Type a message...",
  cwd = "",
  homePath = "",
  recentCwds = [],
  onCwdChange,
  models = [],
  activeProvider = "",
  activeModelId = "",
  activeModelName = "",
  onModelChange,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelMenuRect, setModelMenuRect] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const [cwdPickerOpen, setCwdPickerOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!modelOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (modelBtnRef.current?.contains(target)) return;
      if ((target as Element).closest?.(".chat-model-menu-portal")) return;
      setModelOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [modelOpen]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSubmit = () => {
    const text = value.trim();
    if ((!text && attachedFiles.length === 0) || disabled) return;

    let message = text;
    if (attachedFiles.length > 0) {
      const fileLines = attachedFiles.map((f) => `- ${f.path}`).join("\n");
      const prefix = `[上传文件]\n${fileLines}`;
      message = message ? `${prefix}\n\n${message}` : prefix;
    }

    onSend(message, attachedFiles);
    setValue("");
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming && onStop) {
        onStop();
      } else {
        handleSubmit();
      }
    }
  };

  const handleFilePick = async (files: FileList | null) => {
    if (!files?.length || !cwd.trim()) return;
    setUploading(true);
    try {
      const uploaded: AttachedFile[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("cwd", cwd.trim());
        const res = await fetch("/api/agent/upload", { method: "POST", body: form });
        const data = await res.json();
        if (res.ok && data.path) {
          uploaded.push({ path: data.path, name: data.name ?? file.name });
        }
      }
      if (uploaded.length) {
        setAttachedFiles((prev) => [...prev, ...uploaded]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleModelMenu = () => {
    if (modelOpen) {
      setModelOpen(false);
      return;
    }
    const rect = modelBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setModelMenuRect({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
      width: Math.max(rect.width, 240),
    });
    setModelOpen(true);
  };

  const currentModelLabel = activeModelName || activeModelId || "未配置";
  const modelsByProvider = models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  const modelMenu = modelOpen && modelMenuRect && typeof document !== "undefined"
    ? createPortal(
        <div
          className="chat-model-menu-portal"
          style={{
            position: "fixed",
            bottom: modelMenuRect.bottom,
            left: modelMenuRect.left,
            width: modelMenuRect.width,
            zIndex: 1000,
          }}
        >
          {Object.entries(modelsByProvider).map(([provider, items]) => (
            <div key={provider} className="chat-toolbar-model-section">
              <div className="chat-toolbar-model-group">
                <ProviderLogo logo={getProviderLogo(provider)} size={14} />
                <span className="chat-toolbar-model-group-label">{getProviderLabel(provider)}</span>
              </div>
              {items.map((m) => {
                const active = m.provider === activeProvider && m.id === activeModelId;
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    type="button"
                    className={`chat-toolbar-model-item ${active ? "active" : ""}`}
                    onClick={() => {
                      setModelOpen(false);
                      if (!active && onModelChange) onModelChange(m.provider, m.id);
                    }}
                  >
                    <span className="chat-toolbar-model-item-name">{m.name}</span>
                    {active && <span className="chat-toolbar-model-active-tag">当前</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="chat-input-container">
        <div className="chat-input-shell">
          {attachedFiles.length > 0 && (
            <div className="chat-attached-files">
              {attachedFiles.map((f) => (
                <span key={f.path} className="chat-attached-file">
                  <Paperclip size={11} />
                  <span className="chat-attached-file-name">{f.name}</span>
                  <button
                    type="button"
                    aria-label="移除文件"
                    onClick={() => setAttachedFiles((prev) => prev.filter((x) => x.path !== f.path))}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="chat-input-row">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
            />
            <button
              className={`send-btn ${isStreaming ? "stop-btn" : ""}`}
              onClick={isStreaming ? onStop : handleSubmit}
              disabled={isStreaming ? false : (!value.trim() && attachedFiles.length === 0) || disabled}
              title={isStreaming ? "停止生成" : "发送消息"}
            >
              {isStreaming ? <Square size={16} /> : <Send size={16} />}
            </button>
          </div>

          <div className="chat-meta-row">
            <button
              type="button"
              className={`chat-icon-btn chat-meta-upload ${attachedFiles.length ? "active" : ""}`}
              title={cwd.trim() ? "上传文件" : "请先设置工作目录"}
              disabled={disabled || uploading || !cwd.trim()}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 size={16} className="spin" /> : <Paperclip size={16} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden-input"
              onChange={(e) => handleFilePick(e.target.files)}
            />

            <button
              type="button"
              className="chat-cwd-bar chat-meta-cwd"
              title="点击选择工作目录"
              onClick={() => setCwdPickerOpen(true)}
            >
              <FolderOpen size={14} className="chat-cwd-bar-icon" />
              <span className="chat-cwd-bar-label">工作目录</span>
              <span className="chat-cwd-full-path">{cwd || "点击选择工作目录"}</span>
            </button>

            {models.length > 0 && onModelChange && (
              <div className="chat-footer-field chat-meta-model">
                <span className="chat-field-label">模型切换</span>
                <Cpu size={13} className="chat-field-icon" />
                <button
                  ref={modelBtnRef}
                  type="button"
                  className="chat-field-value-btn chat-model-trigger"
                  disabled={isStreaming}
                  onClick={toggleModelMenu}
                  title="切换模型"
                >
                  <span className="chat-model-trigger-label">{currentModelLabel}</span>
                  <ChevronDown size={13} />
                </button>
              </div>
            )}

          </div>
        </div>

        {modelMenu}

        <div className="chat-input-hint">
          <span>Enter 发送 · Shift+Enter 换行 · 成果文件默认保存至工作目录</span>
        </div>
      </div>

      <CwdPickerDialog
        open={cwdPickerOpen}
        cwd={cwd}
        recentCwds={recentCwds}
        homePath={homePath}
        onClose={() => setCwdPickerOpen(false)}
        onSelect={(path) => onCwdChange?.(path)}
      />
    </>
  );
}
