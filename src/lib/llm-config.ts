import { appPath } from "./app-config";
import { join } from "path";

const AGENT_DIR = appPath();

export interface ResolvedModel {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  api: string;
  maxTokens: number;
}

/**
 * Resolve the default LLM provider config from settings.json + models.json.
 * Shared by city-research generation and the rewrite endpoint.
 */
export function resolveDefaultModel(): ResolvedModel | null {
  try {
    const fs = require("fs");
    const settingsPath = join(AGENT_DIR, "settings.json");
    const modelsPath = join(AGENT_DIR, "models.json");

    if (!fs.existsSync(settingsPath) || !fs.existsSync(modelsPath)) return null;

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const modelsConfig = JSON.parse(fs.readFileSync(modelsPath, "utf8"));

    const defaultProvider = settings.defaultProvider;
    const defaultModelId = settings.defaultModel;

    if (!defaultProvider || !defaultModelId) return null;

    const provider = modelsConfig.providers?.[defaultProvider];
    if (!provider) return null;

    const baseUrl = provider.baseUrl || "https://api.openai.com/v1";
    const apiKey = provider.apiKey || "";
    const api = provider.api || "openai-completions";

    if (!apiKey) return null;

    const model = provider.models?.find((m: any) => m.id === defaultModelId);
    if (!model) {
      if (provider.models?.length > 0) {
        return { baseUrl, apiKey, modelId: provider.models[0].id, api, maxTokens: provider.models[0].maxTokens ?? 16384 };
      }
      return null;
    }

    return { baseUrl, apiKey, modelId: defaultModelId, api, maxTokens: model.maxTokens ?? 16384 };
  } catch {
    return null;
  }
}
