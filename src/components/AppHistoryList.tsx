"use client";

import { useState, useEffect } from "react";
import { Clock, FileText, BarChart3, MapPin, Wand2, Merge, Pencil, Trash2, Check, X } from "lucide-react";
import type { AppId } from "./AppRenderer";

export interface HistoryItem {
  id: string;
  appType: "app" | "agent";
  appId?: AppId;
  appName: string;
  timestamp: number;
  summary: string;
}

interface AppHistoryListProps {
  items: HistoryItem[];
  selectedId?: string | null;
  onSelect?: (item: HistoryItem) => void;
  onDelete?: (id: string) => void;
}

const APP_ICONS: Record<string, React.ReactNode> = {
  price: <BarChart3 size={14} />,
  city: <MapPin size={14} />,
  rewrite: <Wand2 size={14} />,
  merge: <Merge size={14} />,
  agent: <FileText size={14} />,
};

function groupByTime(items: HistoryItem[]): [string, HistoryItem[]][] {
  const now = Date.now();
  const day = 86400000;
  const groups: Record<string, HistoryItem[]> = {
    "今天": [],
    "昨天": [],
    "近 7 天": [],
    "近 30 天": [],
    "更早": [],
  };

  for (const item of items) {
    const age = now - item.timestamp;
    if (age < day) groups["今天"].push(item);
    else if (age < 2 * day) groups["昨天"].push(item);
    else if (age < 7 * day) groups["近 7 天"].push(item);
    else if (age < 30 * day) groups["近 30 天"].push(item);
    else groups["更早"].push(item);
  }

  return Object.entries(groups).filter(([, v]) => v.length > 0);
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppHistoryList({ items, selectedId, onSelect, onDelete }: AppHistoryListProps) {
  const [localItems, setLocalItems] = useState<HistoryItem[]>(items);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Fetch fresh data on every mount
  useEffect(() => {
    setRefreshing(true);
    fetch("/api/app-history")
      .then((r) => r.json())
      .then((data) => setLocalItems(data.items ?? []))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);

  const startRename = (item: HistoryItem) => {
    setEditingId(item.id);
    setEditName(item.appName);
  };

  const cancelRename = () => setEditingId(null);

  const commitRename = async (item: HistoryItem) => {
    const name = editName.trim();
    setEditingId(null);
    if (!name || name === item.appName) return;
    setLocalItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, appName: name } : i))
    );
    try {
      await fetch(`/api/app-history/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: name }),
      });
    } catch {
      // ignore — local state already updated optimistically
    }
  };

  const handleDelete = async (item: HistoryItem) => {
    if (!window.confirm(`确定删除「${item.appName}」？此操作不可恢复。`)) return;
    setLocalItems((prev) => prev.filter((i) => i.id !== item.id));
    onDelete?.(item.id);
    try {
      await fetch(`/api/app-history/${item.id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  };

  if (refreshing && localItems.length === 0) {
    return (
      <div className="history-empty">
        <Clock size={24} className="history-empty-icon" />
        <p>加载中...</p>
      </div>
    );
  }

  if (!refreshing && localItems.length === 0) {
    return (
      <div className="history-empty">
        <Clock size={24} className="history-empty-icon" />
        <p>暂无使用记录</p>
      </div>
    );
  }

  const groups = groupByTime(localItems);

  return (
    <div className="history-list">
      {groups.map(([label, groupItems]) => (
        <div key={label} className="history-group">
          <div className="history-group-label">{label}</div>
          {groupItems.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className={`history-item ${selectedId === item.id ? "active" : ""} ${
                  isEditing ? "editing" : ""
                }`}
                onClick={() => !isEditing && onSelect?.(item)}
              >
                <span className="history-item-icon">
                  {APP_ICONS[item.appId || item.appType] || <FileText size={14} />}
                </span>
                <div className="history-item-info">
                  {isEditing ? (
                    <input
                      className="history-rename-input"
                      value={editName}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(item);
                        else if (e.key === "Escape") cancelRename();
                      }}
                    />
                  ) : (
                    <span className="history-item-name">{item.appName}</span>
                  )}
                  <span className="history-item-time">{formatDateTime(item.timestamp)}</span>
                </div>
                <div className="history-item-actions" onClick={(e) => e.stopPropagation()}>
                  {isEditing ? (
                    <>
                      <button title="保存" onClick={() => commitRename(item)}>
                        <Check size={13} />
                      </button>
                      <button title="取消" onClick={cancelRename}>
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button title="重命名" onClick={() => startRename(item)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        className="danger"
                        title="删除"
                        onClick={() => handleDelete(item)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
