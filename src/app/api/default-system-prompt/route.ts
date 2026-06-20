import { NextResponse } from "next/server";
import path from "node:path";

export async function GET() {
  try {
    // Load buildSystemPrompt from SDK internals via direct path
    const sdkPath = path.join(
      process.cwd(),
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
      "dist",
      "core",
      "system-prompt.js"
    );
    const { buildSystemPrompt } = await import(/* turbopackIgnore: true */ sdkPath);

    const prompt = buildSystemPrompt({
      cwd: process.cwd(),
      selectedTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      toolSnippets: {
        read: "Read file contents",
        bash: "Execute bash commands (ls, grep, find, etc.)",
        edit: "Make precise file edits with exact text replacement, including multiple disjoint edits in one call",
        write: "Create or overwrite files",
        grep: "Search file contents for patterns (respects .gitignore)",
        find: "Find files by glob pattern (respects .gitignore)",
        ls: "List directory contents",
      },
      promptGuidelines: [
        "Use read to examine files instead of cat or sed.",
        "Use write only for new files or complete rewrites.",
        "Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)",
      ],
    });

    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
