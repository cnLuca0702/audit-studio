"use client";

import { useState, useEffect, useCallback } from "react";
import Header, { type AppMode } from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSessions } from "@/hooks/useSessions";
import { useAgentSession } from "@/hooks/useAgentSession";
import type { AppId } from "@/components/AppRenderer";
import type { HistoryItem } from "@/components/AppHistoryList";

export default function Home() {
  const [mode, setMode] = useState<AppMode>("app");
  const [currentApp, setCurrentApp] = useState<AppId | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [cwd, setCwd] = useState("");
  const [homePath, setHomePath] = useState("");
  const [recentCwds, setRecentCwds] = useState<string[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [viewingHistory, setViewingHistory] = useState<HistoryItem | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [appGroupsRefreshKey, setAppGroupsRefreshKey] = useState(0);

  const { sessions, refresh: refreshSessions, deleteSession, renameSession } = useSessions();
  const {
    state: agentState,
    connected,
    createSession: createAgentSession,
    sendMessage,
    addUserMessage,
    loadContext,
    resetState,
  } = useAgentSession(agentSessionId);

  // Load home directory and cwd history on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/home").then((r) => r.json()),
      fetch("/api/cwd-history").then((r) => r.json()),
    ])
      .then(([home, history]) => {
        const homeDir = home.path || "";
        setHomePath(homeDir);
        setRecentCwds(history.recentCwds ?? []);
        if (history.lastCwd) {
          setCwd(history.lastCwd);
        } else if (homeDir) {
          setCwd(homeDir);
        }
      })
      .catch(() => {});
  }, []);

  // Load app history
  useEffect(() => {
    fetch("/api/app-history")
      .then((r) => r.json())
      .then((data) => setHistoryItems(data.items ?? []))
      .catch(() => {});
  }, []);

  const handleModeChange = useCallback((m: AppMode) => {
    setMode(m);
    setViewingHistory(null);
    if (m === "app") {
      setCurrentApp(null);
    }
  }, []);

  const handleSelectApp = useCallback((appId: AppId) => {
    setCurrentApp(appId);
    setViewingHistory(null);
  }, []);

  const handleSelectHistory = useCallback((item: HistoryItem) => {
    setViewingHistory(item);
  }, []);

  const handleBackFromHistory = useCallback(() => {
    setViewingHistory(null);
  }, []);

  const handleDeleteHistory = useCallback((id: string) => {
    setHistoryItems((prev) => prev.filter((i) => i.id !== id));
    setViewingHistory((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      setCurrentSessionId((prev) => (prev === id ? null : prev));
      if (currentSessionId === id) {
        setAgentSessionId(null);
        resetState();
      }
    },
    [deleteSession, currentSessionId, resetState]
  );

  const handleCwdChange = useCallback(async (next: string) => {
    setCwd(next);
    try {
      const res = await fetch("/api/cwd-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: next }),
      });
      const data = await res.json();
      if (data.recentCwds) setRecentCwds(data.recentCwds);
    } catch {
      // ignore
    }
  }, []);

  const handleSelectSession = useCallback(async (session: any) => {
    setCurrentSessionId(session.id);
    const sessionCwd = session.cwd || cwd;
    if (sessionCwd) handleCwdChange(sessionCwd);
    try {
      // Resume the agent on the existing session file so the conversation
      // continues in the SAME file (no duplicate session after refresh).
      const res = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: session.cwd || cwd, sessionFile: session.path }),
      });
      const data = await res.json();
      if (data.sessionId) {
        setAgentSessionId(data.sessionId);
        await loadContext(session.id);
      }
    } catch {
      // ignore
    }
  }, [cwd, loadContext, handleCwdChange]);

  const handleNewSession = useCallback(async () => {
    try {
      // Create the agent session first (it owns the session file), then point
      // both ids at it — avoids the old "sessions/new + agent/new = two files" split.
      const sid = await createAgentSession({ cwd });
      setAgentSessionId(sid);
      setCurrentSessionId(sid);
      resetState();
      refreshSessions();
    } catch {
      // ignore
    }
  }, [cwd, createAgentSession, resetState, refreshSessions]);

  const handleSettingsModelsChanged = useCallback(() => {
    setModelsRefreshKey((k) => k + 1);
  }, []);

  const handleAppGroupsChanged = useCallback(() => {
    setAppGroupsRefreshKey((k) => k + 1);
  }, []);

  const handleSend = useCallback(async (message: string) => {
    addUserMessage(message);
    try {
      if (!agentSessionId) {
        const sid = await createAgentSession({ cwd });
        setAgentSessionId(sid);
        await sendMessage(message, "prompt", sid);
      } else {
        await sendMessage(message);
      }
    } catch {
      // ignore
    }
  }, [agentSessionId, cwd, createAgentSession, sendMessage, addUserMessage]);

  // Drag the divider to resize the left column (220–440px, i.e. 1×–2× base width).
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(220, Math.min(440, startW + (ev.clientX - startX)));
      setSidebarWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const currentSession = sessions.find((s: any) => s.id === currentSessionId);
  const sessionName = currentSession?.name || currentSession?.firstMessage?.slice(0, 40) || undefined;

  return (
    <div className="h-screen flex flex-col bg-[#f5f5f5]">
      <Header
        mode={mode}
        onModeChange={handleModeChange}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        {mode === "platform" ? (
          <iframe
            src="https://www.hzisa.org/"
            title="开发模式"
            className="flex-1 w-full border-0 bg-white"
          />
        ) : (
          <>
        <Sidebar
          mode={mode}
          width={sidebarWidth}
          currentApp={currentApp}
          onSelectApp={handleSelectApp}
          historyItems={historyItems}
          selectedHistoryId={viewingHistory?.id ?? null}
          onSelectHistory={handleSelectHistory}
          onDeleteHistory={handleDeleteHistory}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onRefreshSessions={refreshSessions}
          onDeleteSession={handleDeleteSession}
          onRenameSession={renameSession}
          appGroupsRefreshKey={appGroupsRefreshKey}
        />
        <div className="sidebar-resizer" onMouseDown={startResize} />
        <ChatArea
          mode={mode}
          currentApp={currentApp}
          agentState={agentState}
          connected={connected || agentSessionId === null}
          currentSessionId={currentSessionId}
          agentSessionId={agentSessionId}
          sessionName={sessionName}
          cwd={cwd}
          homePath={homePath}
          recentCwds={recentCwds}
          onCwdChange={handleCwdChange}
          onSend={handleSend}
          modelsRefreshKey={modelsRefreshKey}
          viewingHistory={viewingHistory}
          onBackFromHistory={handleBackFromHistory}
        />
          </>
        )}
      </div>
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onModelsChanged={handleSettingsModelsChanged}
        onAppGroupsChanged={handleAppGroupsChanged}
      />
    </div>
  );
}
