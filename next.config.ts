import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

let appVersion = "0.0.0";
let dshVersion = "0.0.0";
try {
  appVersion = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8")).version;
} catch {}
try {
  dshVersion = JSON.parse(
    readFileSync(join(__dirname, "node_modules/@deepseek-ai/dsh/package.json"), "utf-8")
  ).version;
} catch {}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@deepseek-ai/dsh",
    "@agentclientprotocol/sdk",
    "mammoth",
    "playwright",
    "pdf-parse",
  ],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_DSH_VERSION: dshVersion,
  },
};

export default nextConfig;
