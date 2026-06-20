"use client";

import { useRef, useEffect } from "react";
import { MessageView } from "./MessageView";
import { ChatInput, type ModelOption } from "./ChatInput";

interface ChatPanelProps {
  messages: any[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onStop?: () => void;
  connected: boolean;
  sessionName?: string;
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

export function ChatPanel({
  messages,
  isStreaming,
  onSend,
  onStop,
  connected,
  cwd,
  homePath,
  recentCwds,
  onCwdChange,
  models,
  activeProvider,
  activeModelId,
  activeModelName,
  onModelChange,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distFromBottom < 100;
  };

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-panel">
      <div className="chat-panel-messages" ref={scrollRef} onScroll={handleScroll}>
        {isEmpty ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">🤖</div>
            <h3 className="chat-empty-title">AuditStudio</h3>
            <p className="chat-empty-desc">开始一段新的对话，输入你的问题即可</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageView key={msg.id || msg.toolCallId || i} message={msg} />
            ))}
            {isStreaming && (
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            )}
          </>
        )}
      </div>

      <div className="chat-panel-input">
        <ChatInput
          onSend={onSend}
          onStop={onStop}
          disabled={!connected}
          isStreaming={isStreaming}
          placeholder="输入消息，按 Enter 发送"
          cwd={cwd}
          homePath={homePath}
          recentCwds={recentCwds}
          onCwdChange={onCwdChange}
          models={models}
          activeProvider={activeProvider}
          activeModelId={activeModelId}
          activeModelName={activeModelName}
          onModelChange={onModelChange}
        />
      </div>
    </div>
  );
}
