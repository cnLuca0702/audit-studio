"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { type AppId } from "./AppRenderer";
import { AppHistoryList, type HistoryItem } from "./AppHistoryList";
import { getAppCatalogItem } from "@/lib/app-catalog";
import { getSidebarAppGroups, type AppGroupConfig } from "@/lib/app-groups";

interface SidebarProps {
  mode: "app" | "agent";
  currentApp: AppId | null;
  onSelectApp: (appId: AppId) => void;
  historyItems: HistoryItem[];
  selectedHistoryId?: string | null;
  onSelectHistory?: (item: HistoryItem) => void;
  onDeleteHistory?: (id: string) => void;
  sessions: any[];
  currentSessionId: string | null;
  onSelectSession: (session: any) => void;
  onNewSession: () => void;
  onRefreshSessions?: () => void;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string, name: string) => void;
  width?: number;
  appGroupsRefreshKey?: number;
}

export default function Sidebar({
  mode,
  currentApp,
  onSelectApp,
  historyItems,
  selectedHistoryId,
  onSelectHistory,
  onDeleteHistory,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onRefreshSessions,
  onDeleteSession,
  onRenameSession,
  width = 220,
  appGroupsRefreshKey = 0,
}: SidebarProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [appGroups, setAppGroups] = useState<AppGroupConfig[]>([]);
  const [appGroupsLoaded, setAppGroupsLoaded] = useState(false);
  const [appNames, setAppNames] = useState<Record<string, string>>({});

  const handleRefreshSessions = () => {
    if (!onRefreshSessions || refreshing) return;
    setRefreshing(true);
    onRefreshSessions();
    setTimeout(() => setRefreshing(false), 600);
  };
  const [activeTab, setActiveTab] = useState<"apps" | "sessions">(
    mode === "app" ? "apps" : "sessions"
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (mode !== "app") return;

    let cancelled = false;
    setAppGroupsLoaded(false);

    fetch("/api/app-groups")
      .then((r) => {
        if (!r.ok) throw new Error("failed to load app groups");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setAppGroups(Array.isArray(data.groups) ? data.groups : []);
        setAppNames(data.appNames && typeof data.appNames === "object" ? data.appNames : {});
      })
      .catch(() => {
        if (cancelled) return;
        setAppGroups([]);
      })
      .finally(() => {
        if (!cancelled) setAppGroupsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, appGroupsRefreshKey]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const sessionLabel = (session: any) =>
    session.name || session.firstMessage?.slice(0, 30) || "新会话";

  const startRenameSession = (session: any) => {
    setEditingSessionId(session.id);
    setEditName(sessionLabel(session));
  };

  const cancelRenameSession = () => setEditingSessionId(null);

  const commitRenameSession = (session: any) => {
    const name = editName.trim();
    setEditingSessionId(null);
    if (name && name !== session.name) {
      onRenameSession?.(session.id, name);
    }
  };

  const handleDeleteSession = (session: any) => {
    if (!window.confirm(`确定删除会话「${sessionLabel(session)}」？此操作不可恢复。`)) return;
    onDeleteSession?.(session.id);
  };

  return (
    <aside className="bg-[#ebebeb] flex flex-col border-r border-[#d0d0d0] select-none" style={{ width }}>
      {/* Tabs — only in app mode */}
      {mode === "app" && (
        <div className="flex items-center px-3 pt-3 pb-1">
          <div className="flex flex-1 bg-[#d5d5d5] rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab("apps")}
              className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${
                activeTab === "apps"
                  ? "bg-white text-[#333] shadow-sm"
                  : "text-[#666] hover:text-[#333]"
              }`}
            >
              应用
            </button>
            <button
              onClick={() => setActiveTab("sessions")}
              className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${
                activeTab === "sessions"
                  ? "bg-white text-[#333] shadow-sm"
                  : "text-[#666] hover:text-[#333]"
              }`}
            >
              历史
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2" data-sidebar-apps-scroll>
        {/* App mode: apps tab */}
        {mode === "app" && activeTab === "apps" && (
          <>
            {!appGroupsLoaded ? null : getSidebarAppGroups(appGroups).length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-[#999]">暂无应用分组</div>
            ) : (
            getSidebarAppGroups(appGroups).map((group) => {
              const collapsed = collapsedGroups.has(group.name);
              return (
                <div key={group.name} className="mb-2">
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-[#d5d5d5] transition-colors"
                  >
                    {collapsed ? (
                      <ChevronRight size={14} className="text-[#999] shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="text-[#999] shrink-0" />
                    )}
                    <span className="text-[15px] font-semibold text-[#555]">
                      {group.name}
                    </span>
                  </button>
                  {!collapsed &&
                    group.appIds.map((appId) => {
                      const app = getAppCatalogItem(appId);
                      const displayName = appNames[appId]?.trim() || app.name;
                      return (
                      <div
                        key={appId}
                        data-sidebar-app={appId}
                        onClick={() => onSelectApp(appId)}
                        className={`flex items-center gap-3 pl-5 pr-3 py-2 rounded-lg cursor-pointer transition-all mt-0.5 ${
                          currentApp === appId
                            ? "bg-white shadow-sm"
                            : "hover:bg-[#d5d5d5]"
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm">
                          {app.icon}
                        </div>
                        <span className="text-sm font-medium text-[#333] truncate">
                          {displayName}
                        </span>
                      </div>
                    );})}
                </div>
              );
            })
            )}
          </>
        )}

        {/* App mode: history tab — items open in the main area on the right */}
        {mode === "app" && activeTab === "sessions" && (
          <AppHistoryList
            items={historyItems}
            selectedId={selectedHistoryId}
            onSelect={onSelectHistory}
            onDelete={onDeleteHistory}
          />
        )}

        {/* Agent mode: always show sessions */}
        {mode === "agent" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={onNewSession}
                className="flex flex-1 items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#666] hover:bg-[#d5d5d5] transition-colors"
              >
                <Plus size={16} />
                <span>新建会话</span>
              </button>
              <button
                onClick={handleRefreshSessions}
                title="刷新会话"
                aria-label="刷新会话"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-[#666] hover:bg-[#d5d5d5] transition-colors shrink-0"
              >
                <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
              </button>
            </div>

            {sessions.length === 0 && (
              <div className="text-center text-sm text-[#999] mt-8">暂无会话</div>
            )}
            {sessions.map((session: any) => {
              const isEditing = editingSessionId === session.id;
              return (
                <div
                  key={session.id}
                  onClick={() => !isEditing && onSelectSession(session)}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-1 ${
                    currentSessionId === session.id
                      ? "bg-white shadow-sm"
                      : "hover:bg-[#d5d5d5]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        className="w-full text-sm font-medium text-[#333] border border-indigo-500 rounded px-1 py-0 outline-none bg-white"
                        value={editName}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRenameSession(session);
                          else if (e.key === "Escape") cancelRenameSession();
                        }}
                      />
                    ) : (
                      <div className="text-sm font-medium text-[#333] truncate">
                        {sessionLabel(session)}
                      </div>
                    )}
                    <div className="text-[10px] text-[#999]">
                      {session.messageCount || 0} 条消息
                    </div>
                  </div>
                  {isEditing ? (
                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        title="保存"
                        onClick={() => commitRenameSession(session)}
                        className="p-1 rounded-md text-[#666] hover:bg-[#eee]"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        title="取消"
                        onClick={cancelRenameSession}
                        className="p-1 rounded-md text-[#999] hover:bg-[#eee]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        title="重命名"
                        onClick={() => startRenameSession(session)}
                        className="p-1 rounded-md text-[#999] hover:text-[#666] hover:bg-[#eee]"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        title="删除"
                        onClick={() => handleDeleteSession(session)}
                        className="p-1 rounded-md text-[#999] hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}
