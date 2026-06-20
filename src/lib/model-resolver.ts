import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface ResolvedAgentModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: Record<string, string | null>;
  input: string[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export function resolveModel(provider: string, modelId: string): ResolvedAgentModel | null {
  try {
    const agentDir = join(homedir(), ".pi", "agent");
    const modelsPath = join(agentDir, "models.json");
    if (!existsSync(modelsPath)) return null;

    const modelsConfig = JSON.parse(readFileSync(modelsPath, "utf8"));
    const providerConfig = modelsConfig.providers?.[provider];
    if (!providerConfig?.apiKey || !providerConfig?.baseUrl) return null;

    const modelDef = providerConfig.models?.find((m: any) => m.id === modelId);
    if (!modelDef) return null;

    return {
      id: modelDef.id,
      name: modelDef.name ?? modelDef.id,
      api: modelDef.api ?? providerConfig.api ?? "openai-completions",
      provider,
      baseUrl: providerConfig.baseUrl,
      reasoning: modelDef.reasoning ?? false,
      contextWindow: modelDef.contextWindow ?? 128000,
      maxTokens: modelDef.maxTokens ?? 16384,
      thinkingLevelMap: modelDef.thinkingLevelMap,
      input: modelDef.input ?? ["text"],
      cost: modelDef.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
  } catch {
    return null;
  }
}

export function resolveDefaultModelFromSettings(): {
  provider: string;
  modelId: string;
  model: ResolvedAgentModel | null;
} | null {
  try {
    const agentDir = join(homedir(), ".pi", "agent");
    const settingsPath = join(agentDir, "settings.json");
    if (!existsSync(settingsPath)) return null;

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const provider = settings.defaultProvider;
    const modelId = settings.defaultModel;
    if (!provider || !modelId) return null;

    return { provider, modelId, model: resolveModel(provider, modelId) };
  } catch {
    return null;
  }
}
