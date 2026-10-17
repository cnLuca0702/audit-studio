import { NextResponse } from "next/server";
import { requestWebSearch } from "@/lib/search-web";
import { SECRET_MASK } from "@/lib/config-secrets";

export async function POST(req: Request) {
  try {
    const { provider, apiKey } = await req.json();
    if (!["serpapi", "brave", "tavily", "bing"].includes(provider) || typeof apiKey !== "string" || !apiKey.trim() || apiKey === SECRET_MASK) {
      return NextResponse.json({ ok: false, error: "请提供支持的服务商和 API Key" }, { status: 400 });
    }
    const start = Date.now();
    await requestWebSearch(provider, apiKey.trim(), "test", 1, req.signal);
    return NextResponse.json({ ok: true, latency: Date.now() - start });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "验证失败" });
  }
}
