"use client";

import { useCallback } from "react";

export interface HistoryItem {
  id: string;
  appType: "app" | "agent";
  appId?: string;
  appName: string;
  timestamp: number;
  summary: string;
  content: string;
}

export function useAppHistory() {
  const saveToHistory = useCallback(
    async (appId: string, appName: string, content: string, summary?: string) => {
      if (!content.trim()) return;
      // Use an explicit summary when provided (e.g. for JSON-stored reports where
      // slicing the raw content would leak field names like "cover"/"label").
      const finalSummary =
        summary && summary.trim()
          ? summary.trim().slice(0, 120)
          : content.replace(/[#*`\n]/g, " ").trim().slice(0, 120);
      try {
        await fetch("/api/app-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appType: "app",
            appId,
            appName,
            summary: finalSummary,
            content,
          }),
        });
      } catch {
        // ignore
      }
    },
    []
  );

  return { saveToHistory };
}
