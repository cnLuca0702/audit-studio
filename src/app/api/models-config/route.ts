import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "models.json");

// Known provider api types (must match all-providers/route.ts)
const PROVIDER_API_TYPES: Record<string, string> = {
  "deepseek": "openai-completions",
  "minimax-TokenPlan-cn": "openai-completions",
  "bailian-cn": "openai-completions",
  "zhipu-coding-cn": "openai-completions",
};

function ensureDir() {
  const dir = join(homedir(), ".pi", "agent");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readConfig(): Record<string, any> {
  if (!existsSync(CONFIG_PATH)) return { providers: {} };
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function writeConfig(data: Record<string, any>) {
  ensureDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
}

// GET /api/models-config — read models.json
export async function GET() {
  try {
    return NextResponse.json(readConfig());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT /api/models-config — write models.json (full replace)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    writeConfig(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH /api/models-config — update provider models or apiKey
// Body: { provider, apiKey?, baseUrl?, models?: ModelEntry[], addModels?: string[], removeModels?: string[] }
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { provider, apiKey, baseUrl, models, addModels, removeModels } = body as {
      provider: string;
      apiKey?: string;
      baseUrl?: string;
      models?: Array<{
        id: string;
        name?: string;
        contextWindow?: number;
        maxTokens?: number;
        reasoning?: boolean;
        thinkingLevelMap?: Record<string, string | null>;
      }>;
      addModels?: string[];
      removeModels?: string[];
    };

    if (!provider) {
      return NextResponse.json({ error: "provider is required" }, { status: 400 });
    }

    const config = readConfig();
    if (!config.providers) config.providers = {};

    // Get or create provider entry
    let providerConfig = config.providers[provider];
    if (!providerConfig) {
      providerConfig = { models: [] };
      config.providers[provider] = providerConfig;
    }

    // Set api type from known providers (required by SDK's parseModels)
    if (!providerConfig.api && PROVIDER_API_TYPES[provider]) {
      providerConfig.api = PROVIDER_API_TYPES[provider];
    }

    // Update apiKey if provided
    if (apiKey !== undefined) {
      providerConfig.apiKey = apiKey;
    }

    // Update baseUrl if provided
    if (baseUrl !== undefined) {
      providerConfig.baseUrl = baseUrl;
    }

    // Full model list replacement
    if (models !== undefined) {
      providerConfig.models = models.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
        ...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
        ...(m.reasoning !== undefined ? { reasoning: m.reasoning } : {}),
        ...(m.thinkingLevelMap ? { thinkingLevelMap: m.thinkingLevelMap } : {}),
      }));
    }

    // Add specific models by ID (from available list)
    if (addModels && Array.isArray(addModels)) {
      const existingIds = new Set(providerConfig.models.map((m: any) => m.id));
      for (const modelId of addModels) {
        if (!existingIds.has(modelId)) {
          providerConfig.models.push({ id: modelId, name: modelId });
        }
      }
    }

    // Remove specific models by ID
    if (removeModels && Array.isArray(removeModels)) {
      const removeSet = new Set(removeModels);
      providerConfig.models = providerConfig.models.filter(
        (m: any) => !removeSet.has(m.id)
      );
    }

    writeConfig(config);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
