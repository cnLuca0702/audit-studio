"use client";

import { useState, useEffect, useCallback } from "react";
import { Markdown } from "./Markdown";
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
        {tab === "files" && <FileExplorer key={cwd} cwd={cwd} />}
        {tab === "tools" && <ToolPanel />}
        {tab === "settings" && <ModelPanel />}
      </div>
    </div>
  );
}

interface FileEntry { name: string; path: string; isDirectory: boolean; modified: number }
function FileExplorer({ cwd }: { cwd?: string }) {
  const [path, setPath] = useState(cwd || "");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const url = useCallback((action: string, file: string) => `/api/files?${new URLSearchParams({ cwd: cwd || "", path: file, action })}`, [cwd]);

  useEffect(() => {
    if (!cwd || !path) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(url("list", path), { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEntries(data.entries.sort((a: FileEntry, b: FileEntry) => Number(b.isDirectory) - Number(a.isDirectory) || b.modified - a.modified));
        setError("");
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "文件加载失败"); }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [cwd, path, url, refresh]);


  return <div className="file-explorer">
    <div className="file-explorer-path">
      <button onClick={() => { setPath(cwd || ""); setSelected(null); }}>工作目录</button>
      <button onClick={() => setRefresh(v => v + 1)}>刷新</button>
      {path !== cwd && <button onClick={() => setPath(path.slice(0, path.lastIndexOf("/")) || "/")}>← 上级目录</button>}
      <span className="file-path-current">{path}</span>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="file-explorer-list">
      {!entries.length && !error && <div className="file-empty">{cwd ? "暂无文件，生成的文档将保存在 outputs 文件夹" : "请先选择工作目录"}</div>}
      {entries.map(entry => <button key={entry.path} className="file-entry" onClick={() => {
        if (entry.isDirectory) { setPath(entry.path); setSelected(null); } else setSelected(entry);
      }}><span>{entry.isDirectory ? "📁" : "📄"}</span><span className="file-entry-name">{entry.name}</span>{entry.isDirectory && <ChevronRight size={12} />}</button>)}
    </div>
    {selected && <FilePreview key={`${selected.path}:${selected.modified}`} entry={selected} url={url} onClose={() => setSelected(null)} />}
  </div>;
}

function FilePreview({ entry, url, onClose }: { entry: FileEntry; url: (action: string, path: string) => string; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const isPdf = /\.pdf$/i.test(entry.name);
  const [loading, setLoading] = useState(!isPdf);
  useEffect(() => {
    if (isPdf) return;
    const controller = new AbortController();
    fetch(url("preview", entry.path), { signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error((await res.json()).error);
      return /\.docx$/i.test(entry.name) ? (await res.json()).content : res.text();
    }).then(value => { if (!controller.signal.aborted) setContent(value); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [entry.path, entry.name, isPdf, url]);
  return <section className="file-preview">
    <div className="file-preview-toolbar"><strong>{entry.name}</strong><a href={url("download", entry.path)} download={entry.name}>下载</a><button onClick={onClose} aria-label="关闭预览">×</button></div>
    {/\.docx$/i.test(entry.name) && <p className="file-preview-note">Word 正文预览，完整排版请下载查看。</p>}
    {isPdf ? <iframe title={entry.name} src={url("preview", entry.path)} /> : loading ? <p>正在加载预览…</p> : error ? <p role="alert">{error}</p> : /\.md$/i.test(entry.name) ? <Markdown content={content} /> : <pre>{content}</pre>}
  </section>;
}

function ToolPanel() {
  const tools = [
    { name: "export_document", desc: "生成 Word、PDF、Markdown 文档" },
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
  const [models, setModels] = useState<{ provider: string; id: string; name: string }[]>([]);
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
