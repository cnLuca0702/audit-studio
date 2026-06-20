type PiCodingAgentSdk = typeof import("@earendil-works/pi-coding-agent");

let cached: PiCodingAgentSdk | null = null;

/** Lazy-load pi-coding-agent so Next.js does not bundle its dynamic requires. */
export async function getPiSdk(): Promise<PiCodingAgentSdk> {
  if (!cached) {
    cached = await import("@earendil-works/pi-coding-agent");
  }
  return cached;
}
