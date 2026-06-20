"use client";

import { useState, useEffect } from "react";
import { filesListUrl } from "@/lib/files-api";
import { X, FolderOpen, Wrench, Settings, ChevronRight } from "lucide-react";

interface RightPanelProps {
  cwd?: string;
  visible: boolean;
  onClose: () => void;
}

export function RightPanel({ cwd, visible, onClose }: RightPanelProps) {
  const [tab, setTab] = useState<"files" | "tools" | "settings">("files");

  if (!visible) return null;

  return (
    <div className="right-panel">
      <div className="right-panel-header">
        <div className="right-panel-tabs">
          <button
            className={`right-panel-tab ${tab === "files" ? "active" : ""}`}
            onClick={() => setTab("files")}
          >
            <FolderOpen size={14} />
            <span>文件</span>
          </button>
          <button
            className={`right-panel-tab ${tab === "tools" ? "active" : ""}`}
            onClick={() => setTab("tools")}
          >
            <Wrench size={14} />
            <span>工具</span>
          </button>
          <button
            className={`right-panel-tab ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            <Settings size={14} />
            <span>模型</span>
          </button>
        </div>
        <button className="right-panel-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="right-panel-content">
        {tab === "files" && <FileExplorer cwd={cwd} />}
        {tab === "tools" && <ToolPanel />}
        {tab === "settings" && <ModelPanel />}
      </div>
    </div>
  );
}

function FileExplorer({ cwd }: { cwd?: string }) {
  const [path, setPath] = useState(cwd || "");
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    fetch(filesListUrl(path))
      .then((r) => r.json())
      .then((data) => {
        const items = (data.entries ?? []).sort((a: any, b: any) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(items);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [path]);

  return (
    <div className="file-explorer">
      {path && (
        <div className="file-explorer-path">
          <button
            className="file-path-back"
            onClick={() => {
              const parent = path.split("/").slice(0, -1).join("/");
              if (parent) setPath(parent || "/");
            }}
          >
            ← 上级目录
          </button>
          <span className="file-path-current">{path}</span>
        </div>
      )}
      <div className="file-explorer-list">
        {loading && <div className="file-loading">加载中...</div>}
        {!loading && entries.length === 0 && (
          <div className="file-empty">目录为空</div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.path}
            className={`file-entry ${entry.isDirectory ? "file-dir" : "file-file"}`}
            onClick={() => {
              if (entry.isDirectory) setPath(entry.path);
            }}
          >
            <span className="file-entry-icon">
              {entry.isDirectory ? "📁" : "📄"}
            </span>
            <span className="file-entry-name">{entry.name}</span>
            {entry.isDirectory && <ChevronRight size={12} className="file-entry-arrow" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolPanel() {
  const tools = [
    { name: "read", desc: "读取文件内容" },
    { name: "bash", desc: "执行 Shell 命令" },
    { name: "edit", desc: "编辑文件" },
    { name: "write", desc: "写入文件" },
    { name: "grep", desc: "搜索文件内容" },
    { name: "find", desc: "查找文件" },
    { name: "ls", desc: "列出目录内容" },
  ];

  return (
    <div className="tool-panel">
      <div className="tool-panel-title">内置工具</div>
      {tools.map((tool) => (
        <div key={tool.name} className="tool-item">
          <span className="tool-item-name">{tool.name}</span>
          <span className="tool-item-desc">{tool.desc}</span>
        </div>
      ))}
    </div>
  );
}

function ModelPanel() {
  const [models, setModels] = useState<any[]>([]);
  const [defaultModel, setDefaultModel] = useState("");

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models ?? []);
        setDefaultModel(data.defaultModel ?? "");
      })
      .catch(() => {});
  }, []);

  return (
    <div className="model-panel">
      <div className="model-panel-title">已配置模型</div>
      {models.length === 0 && <div className="model-empty">暂无模型</div>}
      {models.map((m) => (
        <div key={`${m.provider}/${m.id}`} className={`model-item ${m.id === defaultModel ? "active" : ""}`}>
          <span className="model-item-name">{m.name}</span>
          <span className="model-item-provider">{m.provider}</span>
          {m.id === defaultModel && <span className="model-item-default">默认</span>}
        </div>
      ))}
    </div>
  );
}
