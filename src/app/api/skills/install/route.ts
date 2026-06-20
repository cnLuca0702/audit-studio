import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

interface InstallBody {
  name: string;
  content: string; // Markdown or JSON content for SKILL.md
}

// POST /api/skills/install — install a skill
export async function POST(req: Request) {
  try {
    const { name, content } = (await req.json()) as InstallBody;

    if (!name || !content) {
      return NextResponse.json(
        { error: "name and content are required" },
        { status: 400 }
      );
    }

    // Sanitize skill name — only allow safe characters
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json(
        { error: "Skill name can only contain alphanumeric characters, hyphens, and underscores" },
        { status: 400 }
      );
    }

    const skillDir = join(SKILLS_DIR, name);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    // Write SKILL.md
    const skillMdPath = join(skillDir, "SKILL.md");
    writeFileSync(skillMdPath, content, "utf8");

    return NextResponse.json({ ok: true, path: skillDir });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
