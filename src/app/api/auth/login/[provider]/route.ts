import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// GET /api/auth/login/[provider] — initiate OAuth login flow
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  try {
    const authPath = join(homedir(), ".pi", "agent", "auth.json");
    if (!existsSync(authPath)) {
      return NextResponse.json(
        { error: "No auth configuration found" },
        { status: 404 }
      );
    }

    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    const providerConfig = auth[provider];

    if (!providerConfig) {
      return NextResponse.json(
        { error: `Provider "${provider}" not configured` },
        { status: 404 }
      );
    }

    // For API key providers, return the current config (sans sensitive data)
    if (providerConfig.type === "api_key") {
      return NextResponse.json({
        provider,
        type: "api_key",
        configured: !!providerConfig.key,
      });
    }

    // For OAuth providers, initiate the device code flow or redirect
    if (providerConfig.type === "oauth" || providerConfig.type === "device") {
      // Check if device code flow is supported
      if (providerConfig.deviceCodeUrl) {
        const res = await fetch(providerConfig.deviceCodeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: providerConfig.clientId ?? "",
            scope: providerConfig.scope ?? "",
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          return NextResponse.json(
            { error: `OAuth initiation failed: ${res.status}` },
            { status: 502 }
          );
        }

        const data = await res.json();
        return NextResponse.json({
          provider,
          type: "device_code",
          device_code: data.device_code,
          user_code: data.user_code,
          verification_uri: data.verification_uri,
          expires_in: data.expires_in,
          interval: data.interval,
        });
      }

      // Standard OAuth redirect URL
      if (providerConfig.authUrl) {
        return NextResponse.json({
          provider,
          type: "oauth",
          authUrl: providerConfig.authUrl,
          clientId: providerConfig.clientId,
        });
      }
    }

    return NextResponse.json(
      { error: `Unsupported auth type for "${provider}"` },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
