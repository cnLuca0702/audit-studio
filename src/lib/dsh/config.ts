import { configurationHash, normalizeReasoningEfforts } from "./config-values";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { appPath, dshHome } from "../app-config";

interface ModelConfig {
  id:string; name?:string; contextWindow?:number; maxTokens?:number; input?:string[];
  reasoning?:boolean; thinkingLevelMap?:Record<string,string|null>;
}
interface ProviderConfig {name?:string;api?:string;baseUrl?:string;apiKey?:string;models?:ModelConfig[];}
interface AppSettings {
  defaultProvider?:string; defaultModel?:string; defaultThinkingLevel?:string;
  systemPromptMode?:string; systemPrompt?:string;
}

export const DEFAULT_PERSONA = "你是 Audit Studio 审计工作助手。请准确、清晰地协助用户开展审计、分析和文档工作，使用用户的语言回答。";
export function readConfigFile<T = AppSettings>(name: string): T {
  try { return JSON.parse(readFileSync(appPath(name), "utf8")); } catch { return {} as T; }
}
export function runtimeConfig(writePatch = true) {
  const settings = readConfigFile("settings.json");
  const models = readConfigFile<{providers?: Record<string,ProviderConfig>}>("models.json");
  const auth = readConfigFile<Record<string,{key?:string}>>("auth.json");
  const env: Record<string,string> = {};
  const providers: Record<string, unknown> = {};
  for (const [id, raw] of Object.entries(models.providers || {})) {
    const provider = raw;
    const keyEnv = "AUDIT_STUDIO_KEY_" + createHash("sha256").update(id).digest("hex").slice(0,24).toUpperCase();
    env[keyEnv] = provider.apiKey || auth[id]?.key || "";
    providers[id] = {
      displayName: provider.name || id, api: provider.api || "openai-completions",
      baseURL: provider.baseUrl, apiKeyEnv: keyEnv,
      models: (provider.models || []).map((m) => ({
        id: m.id, name: m.name || m.id, contextWindow: m.contextWindow || 128000,
        maxTokens: m.maxTokens || 16384, input: m.input || ["text"],
        ...(m.thinkingLevelMap ? {reasoningEfforts: normalizeReasoningEfforts(m.thinkingLevelMap)} : m.reasoning ? {reasoningEfforts: {off: null, low: "low", medium: "medium", high: "high"}} : {}),
      })),
    };
  }
  const selection = { provider: settings.defaultProvider, model: settings.defaultModel };
  if (!selection.provider || !selection.model || !providers[selection.provider]) throw new Error("请先配置默认模型");
  const patch = [
    {id: "llm-pi-ai", config: {providers}},
    {id: "agent-default-model", config: {...selection, reasoningEffort: settings.defaultThinkingLevel || undefined}},
    {id: "acp", config: selection},
    {id: "system-prompt", config: {
      includeHarnessIdentity: false,
      personaPrefix: settings.systemPromptMode === "replace" && settings.systemPrompt ? settings.systemPrompt : DEFAULT_PERSONA,
      personaSuffix: settings.systemPromptMode === "append" ? settings.systemPrompt || "" : "",
    }},
  ];
  // JSON is valid YAML. Never serialize credentials into the dsh overlay.
  const patchPath = join(dshHome(), "audit-studio.patch.yml");
  if (writePatch) writeFileSync(patchPath, JSON.stringify(patch, null, 2), {mode: 0o600});
  return {patchPath, env, settings, fingerprint: configurationHash(patch, env)};
}
