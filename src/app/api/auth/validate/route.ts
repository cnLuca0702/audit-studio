import { NextResponse } from "next/server";

interface ValidateBody {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}

// Provider base URLs (same as all-providers)
const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  "minimax-TokenPlan-cn": "https://api.minimaxi.com/v1",
  "bailian-cn": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "zhipu-coding-cn": "https://open.bigmodel.cn/api/coding/paas/v4",
};

// POST /api/auth/validate — validate API key and fetch available models
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ValidateBody;
    const { provider, apiKey, baseUrl: customBaseUrl } = body;

    if (!provider || !apiKey) {
      return NextResponse.json(
        { ok: false, error: "provider and apiKey are required" },
        { status: 400 }
      );
    }

    const baseUrl = customBaseUrl || PROVIDER_BASE_URLS[provider];
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: `Unknown provider: ${provider}` },
        { status: 400 }
      );
    }

    const start = Date.now();

    // Step 1: Validate key by listing models
    const models = await fetchModelsFromProvider(provider, baseUrl, apiKey);
    const latency = Date.now() - start;

    if (!models.ok) {
      return NextResponse.json({
        ok: false,
        error: models.error,
        latency,
      });
    }

    return NextResponse.json({
      ok: true,
      latency,
      models: models.models,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message ?? String(error),
    });
  }
}

interface ModelEntry {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

async function fetchModelsFromProvider(
  _provider: string,
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; models?: ModelEntry[]; error?: string }> {
  try {
    return await fetchOpenAICompatibleModels(baseUrl, apiKey);
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; models?: ModelEntry[]; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
  }

  const data = await res.json();
  const rawModels = data.data ?? data.models ?? [];

  const models: ModelEntry[] = rawModels
    .filter((m: any) => m.id && typeof m.id === "string")
    .map((m: any) => ({
      id: m.id,
      name: m.id,
      contextWindow: m.context_window,
      maxTokens: m.max_tokens,
    }))
    .sort((a: ModelEntry, b: ModelEntry) => a.id.localeCompare(b.id));

  return { ok: true, models };
}
