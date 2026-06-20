import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

let appVersion = "0.0.0";
let piVersion = "0.0.0";
try {
  appVersion = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8")).version;
} catch {}
try {
  piVersion = JSON.parse(
    readFileSync(join(__dirname, "../../pi-mono/packages/coding-agent/package.json"), "utf-8")
  ).version;
} catch {}

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-tui",
    "mammoth",
    "pdf-parse",
  ],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
