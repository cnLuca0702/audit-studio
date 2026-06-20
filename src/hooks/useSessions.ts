"use client";

import { useState, useCallback, useEffect } from "react";

export interface SessionInfo {
  id: string;
  path: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions ?? data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSession = useCallback(async (cwd?: string, name?: string) => {
    const res = await fetch("/api/sessions/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, name }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await refresh();
    return data;
  }, [refresh]);

  const deleteSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await refresh();
  }, [refresh]);

  const renameSession = useCallback(async (id: string, name: string) => {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await refresh();
  }, [refresh]);

  return {
    sessions,
    loading,
    refresh,
    createSession,
    deleteSession,
    renameSession,
  };
}
