import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface TestBody {
  provider: string;
  modelId: string;
  apiKey?: string;
}

// Resolve base URL and API style from models.json for a given provider
function resolveProvider(providerId: string) {
  const configPath = join(homedir(), ".pi", "agent", "models.json");
  if (!existsSync(configPath)) return null;
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  return raw.providers?.[providerId] ?? null;
}

// POST /api/models-config/test — test model connection
export async function POST(req: Request) {
  try {
    const { provider, modelId, apiKey } = (await req.json()) as TestBody;

    if (!provider || !modelId) {
      return NextResponse.json(
        { ok: false, error: "provider and modelId are required" },
        { status: 400 }
      );
    }

    const providerConfig = resolveProvider(provider);
    const baseUrl = providerConfig?.baseUrl ?? "https://api.openai.com/v1";
    const effectiveApiKey = apiKey ?? providerConfig?.apiKey ?? "";

    if (!effectiveApiKey) {
      return NextResponse.json(
        { ok: false, error: "No API key available" },
        { status: 400 }
      );
    }

    const start = Date.now();

    // Try a minimal chat completions request
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const latency = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        latency,
        error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
      });
    }

    return NextResponse.json({ ok: true, latency });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message ?? String(error),
    });
  }
}
