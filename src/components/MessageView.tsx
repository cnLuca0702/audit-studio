"use client";

import { useState } from "react";
import { Markdown } from "./Markdown";
import { ChevronDown, ChevronRight, Wrench, Brain, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface MessageViewProps {
  message: any;
}

export function MessageView({ message }: MessageViewProps) {
  const [showThinking, setShowThinking] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  if (!message) return null;

  const role = message.role;
  const content = message.content;

  // User message — right-aligned bubble
  if (role === "user") {
    const text = typeof content === "string" ? content : extractText(content);
    return (
      <div className="message message-user">
        <div className="user-message-bubble">
          <Markdown content={text} />
        </div>
      </div>
    );
  }

  // Assistant message — container with think/tool/answer sections
  if (role === "assistant") {
    const parts = Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }];
    const toolParts = parts.filter((p: any) => p.type === "toolCall");

    const thinkingParts: { text: string }[] = [];
    const textParts: { text: string }[] = [];

    for (const part of parts) {
      if (part.type === "thinking") {
        const t = part.thinking || part.text || "";
        if (t) thinkingParts.push({ text: t });
      } else if (part.type === "text") {
        const raw = part.text || "";
        const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
        let match: RegExpExecArray | null;
        while ((match = thinkRegex.exec(raw)) !== null) {
          if (match[1].trim()) thinkingParts.push({ text: match[1].trim() });
        }
        const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (cleaned) textParts.push({ text: cleaned });
      }
    }

    const hasError = message.stopReason === "error" || message.errorMessage;
    const errorMessage = message.errorMessage || (hasError ? "Unknown error" : null);
    const hasContent = textParts.length > 0 || toolParts.length > 0 || thinkingParts.length > 0;

    if (!hasContent && !hasError) {
      return (
        <div className="message message-assistant">
          <div className="assistant-message-container">
            <div className="assistant-loading">
              <Loader2 size={14} className="spin" />
              <span>Thinking...</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="message message-assistant">
        <div className="assistant-message-container">
          {/* Thinking blocks */}
          {thinkingParts.length > 0 && (
            <div className="thinking-section">
              <button
                className="thinking-toggle"
                onClick={() => setShowThinking(!showThinking)}
              >
                {showThinking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Brain size={14} />
                <span>Thinking ({thinkingParts.length})</span>
              </button>
              {showThinking && (
                <div className="thinking-content">
                  {thinkingParts.map((t, i: number) => (
                    <div key={i} className="thinking-text">
                      <Markdown content={t.text} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tool calls */}
          {toolParts.map((tool: any, i: number) => {
            const toolId = tool.toolCallId || `tool-${i}`;
            const expanded = expandedTools.has(toolId);
            const isRunning = tool._status === "running";
            const isDone = tool._status === "done";
            const isError = tool.isError;
            const toolInput = tool.input ?? tool.arguments ?? {};

            return (
              <div key={toolId} className={`tool-call-block ${isRunning ? "tool-running" : ""}`}>
                <button
                  className="tool-call-header"
                  onClick={() => {
                    const next = new Set(expandedTools);
                    if (expanded) next.delete(toolId);
                    else next.add(toolId);
                    setExpandedTools(next);
                  }}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Wrench size={14} />
                  <span className="tool-name">{tool.toolName || "tool"}</span>
                  {isRunning && (
                    <span className="tool-status tool-status-running">
                      <Loader2 size={12} className="spin" />
                      running
                    </span>
                  )}
                  {isDone && !isError && (
                    <span className="tool-status tool-status-done">
                      <CheckCircle2 size={12} />
                    </span>
                  )}
                  {isDone && isError && (
                    <span className="tool-status tool-status-error">
                      <XCircle size={12} />
                      error
                    </span>
                  )}
                  {!expanded && !isRunning && (
                    <span className="tool-preview">
                      {JSON.stringify(toolInput).substring(0, 80)}
                    </span>
                  )}
                </button>
                {expanded && (
                  <div className="tool-call-details">
                    <div className="tool-call-section">
                      <div className="tool-call-section-label">Input</div>
                      <pre className="tool-call-json">
                        {JSON.stringify(toolInput, null, 2)}
                      </pre>
                    </div>
                    {isDone && tool.result !== undefined && (
                      <div className="tool-call-section">
                        <div className="tool-call-section-label">
                          Result {isError && <span className="tool-error-label">(error)</span>}
                        </div>
                        <pre className={`tool-call-json ${isError ? "tool-call-error" : ""}`}>
                          {typeof tool.result === "string"
                            ? tool.result
                            : JSON.stringify(tool.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Text content */}
          {textParts.map((part: any, i: number) => (
            <div key={i} className="message-text">
              <Markdown content={part.text || ""} />
            </div>
          ))}

          {/* Error display */}
          {hasError && errorMessage && (
            <div className="message-error">
              <div className="error-icon">⚠</div>
              <div className="error-text">{errorMessage}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Compaction summary
  if (role === "compactionSummary") {
    return (
      <div className="message message-compaction">
        <div className="compaction-label">Session compacted</div>
        <div className="compaction-text">
          <Markdown content={typeof content === "string" ? content : extractText(content)} />
        </div>
      </div>
    );
  }

  // System/custom messages
  if (role === "system" || role === "custom") {
    return (
      <div className="message message-system">
        <Markdown content={typeof content === "string" ? content : extractText(content)} />
      </div>
    );
  }

  return null;
}

function extractText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
  }
  return String(content ?? "");
}
