import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DATA_DIR = join(homedir(), ".pi", "agent", "data");
const PROFILES_FILE = join(DATA_DIR, "doc-rewrite-profiles.json");

interface StyleProfile {
  id: string;
  name: string;
  profile: string;
  createdAt: number;
}

async function readProfiles(): Promise<StyleProfile[]> {
  if (!existsSync(PROFILES_FILE)) return [];
  try {
    const data = await readFile(PROFILES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeProfiles(profiles: StyleProfile[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
}

// DELETE /api/doc-rewrite/profiles/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profiles = await readProfiles();
  const filtered = profiles.filter((p) => p.id !== id);
  if (filtered.length === profiles.length) {
    return NextResponse.json({ error: "未找到该风格配置" }, { status: 404 });
  }
  await writeProfiles(filtered);
  return NextResponse.json({ success: true });
}
