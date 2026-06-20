/**
 * RPC Manager - Manages AgentSession lifecycle
 *
 * This module provides a way to manage agent sessions from API routes.
 * It maintains a map of active sessions and provides methods to create,
 * send messages, and subscribe to events.
 *
 * Uses globalThis to persist the session map across Next.js dev mode
 * module instances (each API route gets its own module copy in dev).
 *
 * Event buffering: events emitted before SSE subscriber connects are
 * captured and replayed on subscription, preventing lost events due
 * to timing race conditions.
 */

import { getSessionDir } from "./session-dir";
import { getPiSdk } from "./pi-sdk";

type AgentSession = any;
type AgentSessionEvent = any;

let _sdk: any = null;

async function getSdk() {
  if (!_sdk) {
    _sdk = await getPiSdk();
  }
  return _sdk;
}

interface ManagedSession {
  session: AgentSession;
  createdAt: number;
  lastActivity: number;
  eventBuffer: any[];
  bufferUnsubscribe: (() => void) | null;
}

// Use globalThis to persist across Next.js dev mode module instances
const GLOBAL_KEY = "__pi_agent_sessions__";

function getSessions(): Map<string, ManagedSession> {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new Map<string, ManagedSession>();
  }
  return (globalThis as any)[GLOBAL_KEY] as Map<string, ManagedSession>;
}

// Session timeout (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;
// Max buffered events per session
const MAX_BUFFER_SIZE = 500;

/**
 * Install a buffer listener on a session to capture all events.
 * Events are kept for replay when SSE subscribers connect.
 */
function installBufferListener(managed: ManagedSession): void {
  managed.bufferUnsubscribe = managed.session.subscribe((event: any) => {
    managed.eventBuffer.push(event);
    if (managed.eventBuffer.length > MAX_BUFFER_SIZE) {
      managed.eventBuffer = managed.eventBuffer.slice(-MAX_BUFFER_SIZE);
    }
  });
}

/**
 * Get or create a managed session
 */
export async function getOrCreateSession(
  sessionId: string,
  options?: {
    cwd?: string;
    thinkingLevel?: string;
    tools?: string[];
    sessionFile?: string;
  }
): Promise<AgentSession> {
  // Clean up expired sessions
  cleanupExpiredSessions();

  // Return existing session if available
  const existing = getSessions().get(sessionId);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing.session;
  }

  // Create new session — explicitly resolve model from settings.json
  // because SDK's findInitialModel may fail in Next.js dev mode due to
  // node:fs module resolution issues
  const sdk = await getSdk();
  const resolvedCwd = options?.cwd || require("os").homedir();
  console.log(`[rpc-manager] Creating agent session with cwd: ${resolvedCwd}`);

  // Try to resolve model and system prompt explicitly from settings + models config
  let resolvedModel: any = undefined;
  let resolvedSystemPrompt: string = "";
  let resolvedSystemPromptMode: "" | "replace" | "append" = "";
  let resolvedThinkingLevel: string | undefined;
  let agentDir: string | undefined;
  try {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");

    agentDir = path.join(os.homedir(), ".pi", "agent");
    const settingsPath = path.join(agentDir, "settings.json");
    const modelsPath = path.join(agentDir, "models.json");

    // Read settings for system prompt and thinking level config
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      resolvedSystemPrompt = settings.systemPrompt || "";
      resolvedSystemPromptMode = settings.systemPromptMode || "";
      resolvedThinkingLevel = settings.defaultThinkingLevel || undefined;
    }

    if (fs.existsSync(modelsPath) && fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      const modelsConfig = JSON.parse(fs.readFileSync(modelsPath, "utf8"));

      const defaultProvider = settings.defaultProvider;
      const defaultModelId = settings.defaultModel;

      if (defaultProvider && defaultModelId && modelsConfig.providers?.[defaultProvider]) {
        const providerConfig = modelsConfig.providers[defaultProvider];
        const modelDef = providerConfig.models?.find((m: any) => m.id === defaultModelId);
        if (modelDef && providerConfig.apiKey && providerConfig.baseUrl) {
          resolvedModel = {
            id: modelDef.id,
            name: modelDef.name ?? modelDef.id,
            api: modelDef.api ?? providerConfig.api ?? "openai-completions",
            provider: defaultProvider,
            baseUrl: providerConfig.baseUrl,
            reasoning: modelDef.reasoning ?? false,
            contextWindow: modelDef.contextWindow ?? 128000,
            maxTokens: modelDef.maxTokens ?? 16384,
            thinkingLevelMap: modelDef.thinkingLevelMap,
            input: modelDef.input ?? ["text"],
            cost: modelDef.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          };
          console.log(`[rpc-manager] Resolved model from settings: ${defaultProvider}/${defaultModelId}`);
        }
      }
    }
  } catch (err) {
    console.warn("[rpc-manager] Failed to resolve from settings, using SDK defaults:", err);
  }

  // Build custom ResourceLoader
  // Always create one to disable AGENTS.md/CLAUDE.md auto-discovery (noContextFiles: true),
  // which otherwise walks up from cwd and injects unrelated project context into prompts.
  let resourceLoader: any = undefined;
  if (agentDir) {
    try {
      const { DefaultResourceLoader } = sdk;
      const loaderOptions: any = {
        cwd: resolvedCwd,
        agentDir,
        noContextFiles: true,
      };
      if (resolvedSystemPromptMode === "replace" && resolvedSystemPrompt) {
        loaderOptions.systemPrompt = resolvedSystemPrompt;
      } else if (resolvedSystemPromptMode === "append" && resolvedSystemPrompt) {
        loaderOptions.appendSystemPrompt = [resolvedSystemPrompt];
      }
      resourceLoader = new DefaultResourceLoader(loaderOptions);
      await resourceLoader.reload();
      if (resolvedSystemPromptMode && resolvedSystemPrompt) {
        console.log(`[rpc-manager] Custom system prompt (${resolvedSystemPromptMode} mode, ${resolvedSystemPrompt.length} chars)`);
      } else {
        console.log(`[rpc-manager] ResourceLoader created (noContextFiles=true, using SDK default prompt)`);
      }
    } catch (err) {
      console.warn("[rpc-manager] Failed to create ResourceLoader:", err);
      resourceLoader = undefined;
    }
  }

  // Create or resume a SessionManager. Resuming (open) reuses an existing session
  // file so the agent continues that conversation instead of creating a new file.
  const customSessionDir = getSessionDir(resolvedCwd);
  let sessionManager;
  if (options?.sessionFile) {
    sessionManager = sdk.SessionManager.open(options.sessionFile, customSessionDir);
    console.log(`[rpc-manager] Resuming session file: ${options.sessionFile}`);
  } else {
    sessionManager = sdk.SessionManager.create(resolvedCwd, customSessionDir);
    console.log(`[rpc-manager] Session directory: ${customSessionDir}`);
  }

  const sessionOptions: any = {
    cwd: resolvedCwd,
    thinkingLevel: (options?.thinkingLevel || resolvedThinkingLevel) as any,
    tools: options?.tools,
    sessionManager,
  };
  if (resolvedModel) {
    sessionOptions.model = resolvedModel;
  }
  if (resourceLoader) {
    sessionOptions.resourceLoader = resourceLoader;
  }

  const { session } = await sdk.createAgentSession(sessionOptions);

  // Debug: log selected model
  const model = session.model;
  console.log(
    `[rpc-manager] Session created — model: ${model ? `${model.provider}/${model.id}` : "NONE"}, ` +
    `thinking: ${session.thinkingLevel}, isStreaming: ${session.isStreaming}`
  );

  const managed: ManagedSession = {
    session,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    eventBuffer: [],
    bufferUnsubscribe: null,
  };

  // Install buffer listener IMMEDIATELY after creation so no events are missed
  installBufferListener(managed);

  getSessions().set(sessionId, managed);

  return session;
}

/**
 * Get an existing session
 */
export function getSession(sessionId: string): AgentSession | null {
  const managed = getSessions().get(sessionId);
  if (managed) {
    managed.lastActivity = Date.now();
    return managed.session;
  }
  return null;
}

/**
 * Remove a session
 */
export function removeSession(sessionId: string): void {
  const managed = getSessions().get(sessionId);
  if (managed) {
    if (managed.bufferUnsubscribe) {
      try { managed.bufferUnsubscribe(); } catch { /* ignore */ }
    }
    managed.session.dispose();
    getSessions().delete(sessionId);
  }
}

/**
 * Check if a session is alive
 */
export function isSessionAlive(sessionId: string): boolean {
  return getSessions().has(sessionId);
}

/**
 * Get all active session IDs
 */
export function getActiveSessionIds(): string[] {
  return Array.from(getSessions().keys());
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  const sessions = getSessions();
  for (const [id, managed] of sessions.entries()) {
    if (now - managed.lastActivity > SESSION_TIMEOUT) {
      if (managed.bufferUnsubscribe) {
        try { managed.bufferUnsubscribe(); } catch { /* ignore */ }
      }
      managed.session.dispose();
      sessions.delete(id);
    }
  }
}

/**
 * Subscribe to session events with replay of buffered events.
 *
 * This solves the timing race where prompt() emits events before
 * the SSE subscriber connects:
 * 1. Session is created → buffer listener captures ALL events
 * 2. SSE subscriber connects → buffered events replayed first
 * 3. Real-time listener registered atomically (same microtask)
 *    so no events are missed between replay and live forwarding
 *
 * Returns an unsubscribe function, or null if session not found.
 */
export function subscribeToSession(
  sessionId: string,
  listener: (event: AgentSessionEvent) => void
): (() => void) | null {
  const managed = getSessions().get(sessionId);
  if (!managed) return null;

  managed.lastActivity = Date.now();

  // 1. Snapshot and clear buffer (so replayed events won't be duplicated)
  const pending = managed.eventBuffer;
  managed.eventBuffer = [];

  // 2. Register real-time listener BEFORE replaying.
  //    Any event emitted during replay will go to both:
  //    - the new buffer (via wrapper) — but those are duplicates of pending
  //    - the listener directly (via this subscription)
  //    Since we already cleared the buffer, wrapper pushes to new buffer
  //    but listener also fires — listener sends to SSE directly. ✓
  const unsubscribe = managed.session.subscribe(listener);

  // 3. Replay buffered events (all synchronous, no await gaps)
  for (const event of pending) {
    try {
      listener(event);
    } catch { /* ignore */ }
  }

  return () => {
    try { unsubscribe(); } catch { /* ignore */ }
  };
}
