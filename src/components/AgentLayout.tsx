"use client";

import { useState, useEffect, useCallback } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { RightPanel } from "./RightPanel";
import type { AgentState } from "@/hooks/useAgentSession";
import type { ModelOption } from "./ChatInput";

interface AgentLayoutProps {
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
}

export function AgentLayout({
  agentState,
  connected,
  currentSessionId,
  agentSessionId,
  sessionName,
  cwd,
  homePath = "",
  recentCwds = [],
  onCwdChange,
  onSend,
  onStop,
  modelsRefreshKey = 0,
}: AgentLayoutProps) {
  const [rightPanelVisible, setRightPanelVisible] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultModelId, setDefaultModelId] = useState("");

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setModels(data.models ?? []);
      setDefaultProvider(data.defaultProvider ?? "");
      setDefaultModelId(data.defaultModel ?? "");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels, modelsRefreshKey]);

  useEffect(() => {
    if (!agentSessionId || !modelsRefreshKey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models");
        const data = await res.json();
        if (cancelled || !data.defaultProvider || !data.defaultModel) return;
        await fetch(`/api/agent/${agentSessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "set_model",
            provider: data.defaultProvider,
            modelId: data.defaultModel,
          }),
        });
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [agentSessionId, modelsRefreshKey]);

  const activeProvider = agentState.modelProvider || defaultProvider;
  const activeModelId = agentState.modelId || defaultModelId;
  const activeModelName =
    models.find((m) => m.provider === activeProvider && m.id === activeModelId)?.name ||
    agentState.model ||
    activeModelId;

  const handleModelChange = useCallback(async (provider: string, modelId: string) => {
    try {
      await fetch("/api/models-config/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultProvider: provider, defaultModel: modelId }),
      });
      if (agentSessionId) {
        await fetch(`/api/agent/${agentSessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "set_model", provider, modelId }),
        });
      }
      setDefaultProvider(provider);
      setDefaultModelId(modelId);
      await loadModels();
    } catch {
      // ignore
    }
  }, [agentSessionId, loadModels]);

  const toggleRightPanel = useCallback(() => {
    setRightPanelVisible((v) => !v);
  }, []);

  return (
    <div className="agent-layout">
      <div className="agent-layout-toolbar">
        <div className="agent-toolbar-info">
          <span className="agent-toolbar-title">{sessionName || "新对话"}</span>
          {agentState.isStreaming && (
            <span className="agent-toolbar-streaming">
              <span className="streaming-dot" />
              生成中...
            </span>
          )}
        </div>
        <button
          className="toolbar-btn"
          onClick={toggleRightPanel}
          title={rightPanelVisible ? "隐藏成果栏" : "显示成果栏"}
        >
          {rightPanelVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>
      <div className="agent-layout-content">
        <div className="agent-layout-chat-wrap">
          <div className="agent-layout-chat">
            <ChatPanel
              messages={agentState.messages}
              isStreaming={agentState.isStreaming}
              onSend={onSend}
              onStop={onStop}
              connected={connected}
              sessionName={sessionName}
              cwd={cwd}
              homePath={homePath}
              recentCwds={recentCwds}
              onCwdChange={onCwdChange}
              models={models}
              activeProvider={activeProvider}
              activeModelId={activeModelId}
              activeModelName={activeModelName}
              onModelChange={handleModelChange}
            />
          </div>
        </div>
        {rightPanelVisible && (
          <div className="agent-layout-right">
            <RightPanel cwd={cwd} visible={rightPanelVisible} onClose={toggleRightPanel} />
          </div>
        )}
      </div>
    </div>
  );
}
