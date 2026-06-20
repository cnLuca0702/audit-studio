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

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// GET /api/doc-rewrite/profiles — list profiles
export async function GET() {
  const profiles = await readProfiles();
  return NextResponse.json({ profiles });
}

// POST /api/doc-rewrite/profiles — save a profile
export async function POST(req: Request) {
  try {
    const { name, profile } = await req.json();
    if (!name?.trim() || !profile?.trim()) {
      return NextResponse.json({ error: "名称和风格描述不能为空" }, { status: 400 });
    }
    const profiles = await readProfiles();
    const newProfile: StyleProfile = {
      id: generateId(),
      name: name.trim(),
      profile: profile.trim(),
      createdAt: Date.now(),
    };
    profiles.push(newProfile);
    await writeProfiles(profiles);
    return NextResponse.json(newProfile);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "保存失败" }, { status: 500 });
  }
}
