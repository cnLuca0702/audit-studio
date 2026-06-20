import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
}

// GET /api/models — return available models and the configured default
export async function GET() {
  try {
    const configPath = join(homedir(), ".pi", "agent", "models.json");
    if (!existsSync(configPath)) {
      return NextResponse.json({ models: [], defaultModel: "", defaultProvider: "" });
    }

    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
    let defaultModel = "";
    let defaultProvider = "";

    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      defaultModel = settings.defaultModel ?? "";
      defaultProvider = settings.defaultProvider ?? "";
    }

    const models: ModelInfo[] = [];
    const providers = raw.providers ?? {};

    for (const [providerId, provider] of Object.entries(providers) as [string, any][]) {
      for (const m of provider.models ?? []) {
        models.push({
          id: m.id,
          name: m.name ?? m.id,
          provider: providerId,
          reasoning: m.reasoning,
          input: m.input,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
        });
      }
    }

    return NextResponse.json({ models, defaultModel, defaultProvider });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
