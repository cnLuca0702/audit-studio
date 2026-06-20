"use client";

import { AppModeGuide } from "./AppModeGuide";
import { AppRenderer, type AppId } from "./AppRenderer";
import { AgentLayout } from "./AgentLayout";
import { HistoryViewer } from "./HistoryViewer";
import type { HistoryItem } from "./AppHistoryList";
import type { AgentState } from "@/hooks/useAgentSession";

interface ChatAreaProps {
  mode: "app" | "agent";
  currentApp: AppId | null;
  agentState: AgentState;
  connected: boolean;
  currentSessionId: string | null;
  agentSessionId: string | null;
  sessionName?: string;
  cwd: string;
  homePath?: string;
  recentCwds?: string[];
  onCwdChange: (cwd: string) => void;
  onSend: (message: string) => void;
  onStop?: () => void;
  modelsRefreshKey?: number;
  viewingHistory?: HistoryItem | null;
  onBackFromHistory?: () => void;
}

function AppModeShell({
  children,
  centered = false,
  wide = false,
}: {
  children: React.ReactNode;
  centered?: boolean;
  wide?: boolean;
}) {
  return (
    <main className="app-mode-main">
      <div className={`app-mode-content-wrap${centered ? " is-centered" : ""}`}>
        <div className={`app-mode-content${wide ? " is-wide" : ""}`}>{children}</div>
      </div>
    </main>
  );
}

export default function ChatArea({
  mode,
  currentApp,
  agentState,
  connected,
  currentSessionId,
  agentSessionId,
  sessionName,
  cwd,
  homePath,
  recentCwds,
  onCwdChange,
  onSend,
  onStop,
  modelsRefreshKey,
  viewingHistory,
  onBackFromHistory,
}: ChatAreaProps) {
  // App mode: render the selected app (or a history item being viewed)
  if (mode === "app") {
    if (viewingHistory && onBackFromHistory) {
      return (
        <AppModeShell>
          <HistoryViewer item={viewingHistory} onBack={onBackFromHistory} />
        </AppModeShell>
      );
    }

    if (!currentApp) {
      return (
        <AppModeShell wide>
          <div className="app-mode-scroll app-mode-guide-scroll">
            <AppModeGuide />
          </div>
        </AppModeShell>
      );
    }

    return (
      <AppModeShell>
        <div className="app-mode-scroll">
          <AppRenderer appId={currentApp} />
        </div>
      </AppModeShell>
    );
  }

  // Agent mode: render the chat interface with right panel
  return (
    <main className="flex-1 flex flex-col bg-white min-w-0 overflow-hidden">
      <AgentLayout
        agentState={agentState}
        connected={connected}
        currentSessionId={currentSessionId}
        agentSessionId={agentSessionId}
        sessionName={sessionName}
        cwd={cwd}
        homePath={homePath}
        recentCwds={recentCwds}
        onCwdChange={onCwdChange}
        onSend={onSend}
        onStop={onStop}
        modelsRefreshKey={modelsRefreshKey}
      />
    </main>
  );
}
