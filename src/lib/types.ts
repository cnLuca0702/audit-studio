// Shared types for pi-web

export interface SessionInfo {
  id: string;
  path: string;
  cwd: string;
  name: string | undefined;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId: string | undefined;
}

export interface SessionContext {
  messages: NormalizedMessage[];
  entryIds: string[];
  thinkingLevel: string;
  model: { provider: string; modelId: string } | undefined;
}

export interface NormalizedMessage {
  role: string;
  content: any;
  timestamp?: number;
  [key: string]: any;
}

export interface AgentState {
  running: boolean;
  state?: {
    isStreaming: boolean;
    model?: { provider: string; id: string };
    thinkingLevel?: string;
    messages?: any[];
  };
}

export interface TreeEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  [key: string]: any;
}

export interface TreeNode {
  entry: TreeEntry;
  children: TreeNode[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  api: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
}
