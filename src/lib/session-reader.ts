/**
 * Session file reader - parses .jsonl session files
 */

import { readFileSync, statSync } from "fs";
import { normalizeAssistantMessage } from "./normalize";
import type { SessionInfo, SessionContext, NormalizedMessage, TreeEntry, TreeNode } from "./types";

/**
 * Get session info from a session file
 */
export function getSessionInfo(sessionPath: string, sessionId: string): SessionInfo | null {
  try {
    const content = readFileSync(sessionPath, "utf8");
    const lines = content.trim().split("\n");

    if (lines.length === 0) return null;

    const header = JSON.parse(lines[0]);
    if (header.type !== "session") return null;

    // Get file modified time
    const stats = statSync(sessionPath);
    const modified = stats.mtime.toISOString();

    // Parse entries to get message count and first message
    const entries = parseEntries(lines.slice(1));
    const messageEntries = entries.filter((e) => e.type === "message");
    const firstUserMessage = messageEntries.find(
      (e) => e.message?.role === "user"
    );

    let firstMessage = "(no messages)";
    if (firstUserMessage?.message?.content) {
      const content = firstUserMessage.message.content;
      if (typeof content === "string") {
        firstMessage = content;
      } else if (Array.isArray(content)) {
        const textItem = content.find((c: any) => c.type === "text");
        firstMessage = textItem?.text || "(no messages)";
      }
    }

    // Get session name from session_info entries
    const sessionInfoEntries = entries.filter((e) => e.type === "session_info");
    const name =
      sessionInfoEntries.length > 0
        ? sessionInfoEntries[sessionInfoEntries.length - 1].name
        : undefined;

    return {
      id: sessionId,
      path: sessionPath,
      cwd: header.cwd || "",
      name,
      created: header.timestamp || modified,
      modified,
      messageCount: messageEntries.length,
      firstMessage: firstMessage.substring(0, 200),
      parentSessionId: header.parentSession,
    };
  } catch {
    return null;
  }
}

/**
 * Parse entries from JSONL lines
 */
export function parseEntries(lines: string[]): TreeEntry[] {
  const entries: TreeEntry[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      entries.push(entry);
    } catch {
      // Skip invalid lines
    }
  }

  return entries;
}

/**
 * Build session context from entries
 */
export function buildSessionContext(
  entries: TreeEntry[],
  leafId: string | null
): SessionContext {
  const entryMap = new Map<string, TreeEntry>();
  for (const entry of entries) {
    entryMap.set(entry.id, entry);
  }

  // Walk from leaf to root
  const path: TreeEntry[] = [];
  let currentId = leafId;

  while (currentId) {
    const entry = entryMap.get(currentId);
    if (!entry) break;
    path.unshift(entry);
    currentId = entry.parentId;
  }

  // Extract messages
  const messages: NormalizedMessage[] = [];
  const entryIds: string[] = [];
  let thinkingLevel = "medium";
  let model: { provider: string; modelId: string } | undefined;

  for (const entry of path) {
    if (entry.type === "message") {
      const msg = normalizeAssistantMessage(entry.message);
      messages.push(msg);
      entryIds.push(entry.id);
    } else if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId };
    } else if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel;
    } else if (entry.type === "compaction") {
      // Add compaction summary as a message
      messages.push({
        role: "compactionSummary",
        content: entry.summary || "",
        timestamp: new Date(entry.timestamp).getTime(),
      });
      entryIds.push(entry.id);
    }
  }

  return { messages, entryIds, thinkingLevel, model };
}

/**
 * Get tree structure from entries
 */
export function getTree(entries: TreeEntry[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create nodes
  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [] });
  }

  // Build tree
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    if (entry.parentId) {
      const parent = nodeMap.get(entry.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}
