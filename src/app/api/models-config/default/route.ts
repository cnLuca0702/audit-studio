import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

function ensureDir() {
  const dir = join(homedir(), ".pi", "agent");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// GET /api/models-config/default — get default model, thinking level, system prompt, and search config
export async function GET() {
  try {
    if (!existsSync(SETTINGS_PATH)) {
      return NextResponse.json({
        defaultProvider: "",
        defaultModel: "",
        defaultThinkingLevel: "",
        systemPrompt: "",
        systemPromptMode: "",
        searchApiProvider: "",
        searchApiKey: "",
      });
    }
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    return NextResponse.json({
      defaultProvider: settings.defaultProvider ?? "",
      defaultModel: settings.defaultModel ?? "",
      defaultThinkingLevel: settings.defaultThinkingLevel ?? "",
      systemPrompt: settings.systemPrompt ?? "",
      systemPromptMode: settings.systemPromptMode ?? "",
      searchApiProvider: settings.searchApiProvider ?? "",
      searchApiKey: settings.searchApiKey ?? "",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT /api/models-config/default — set default model, thinking level, system prompt, and/or search config
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { defaultProvider, defaultModel, defaultThinkingLevel, systemPrompt, systemPromptMode, searchApiProvider, searchApiKey } = body as {
      defaultProvider?: string;
      defaultModel?: string;
      defaultThinkingLevel?: string;
      systemPrompt?: string;
      systemPromptMode?: string;
      searchApiProvider?: string;
      searchApiKey?: string;
    };

    ensureDir();
    let settings: Record<string, any> = {};
    if (existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    }

    if (defaultProvider !== undefined) settings.defaultProvider = defaultProvider;
    if (defaultModel !== undefined) settings.defaultModel = defaultModel;
    if (defaultThinkingLevel !== undefined) settings.defaultThinkingLevel = defaultThinkingLevel || undefined;
    if (systemPrompt !== undefined) settings.systemPrompt = systemPrompt || undefined;
    if (systemPromptMode !== undefined) settings.systemPromptMode = systemPromptMode || undefined;
    if (searchApiProvider !== undefined) settings.searchApiProvider = searchApiProvider || undefined;
    if (searchApiKey !== undefined) settings.searchApiKey = searchApiKey || undefined;
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");

    return NextResponse.json({
      ok: true,
      defaultProvider: settings.defaultProvider,
      defaultModel: settings.defaultModel,
      defaultThinkingLevel: settings.defaultThinkingLevel,
      systemPrompt: settings.systemPrompt ?? "",
      systemPromptMode: settings.systemPromptMode ?? "",
      searchApiProvider: settings.searchApiProvider ?? "",
      searchApiKey: settings.searchApiKey ?? "",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}