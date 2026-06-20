import { NextResponse } from "next/server";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

interface SkillInfo {
  name: string;
  path: string;
  description?: string;
  version?: string;
  isSymlink?: boolean;
}

function readSkillInfo(dirName: string): SkillInfo | null {
  const skillPath = join(SKILLS_DIR, dirName);
  try {
    const stat = statSync(skillPath);
    if (!stat.isDirectory()) return null;

    // Try to read SKILL.md or package.json for metadata
    let description: string | undefined;
    let version: string | undefined;

    const skillMdPath = join(skillPath, "SKILL.md");
    if (existsSync(skillMdPath)) {
      const content = readFileSync(skillMdPath, "utf8");
      // Extract first non-heading line as description
      const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
      if (lines.length > 0) description = lines[0].trim().slice(0, 200);
    }

    const pkgPath = join(skillPath, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (!description) description = pkg.description;
      version = pkg.version;
    }

    return {
      name: dirName,
      path: skillPath,
      description,
      version,
      isSymlink: stat.isSymbolicLink?.() ?? false,
    };
  } catch {
    return null;
  }
}

// GET /api/skills — list installed skills
export async function GET() {
  try {
    if (!existsSync(SKILLS_DIR)) {
      return NextResponse.json({ skills: [] });
    }

    const entries = readdirSync(SKILLS_DIR);
    const skills = entries
      .map((name) => readSkillInfo(name))
      .filter((s): s is SkillInfo => s !== null);

    return NextResponse.json({ skills });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH /api/skills — update skill configuration
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { name, description } = body as { name?: string; description?: string };

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const skillPath = join(SKILLS_DIR, name);
    if (!existsSync(skillPath)) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Update SKILL.md description if provided
    if (description !== undefined) {
      const skillMdPath = join(skillPath, "SKILL.md");
      if (existsSync(skillMdPath)) {
        const content = readFileSync(skillMdPath, "utf8");
        // Replace the first non-heading line
        const lines = content.split("\n");
        let replaced = false;
        const updated = lines
          .map((line) => {
            if (!replaced && line.trim() && !line.startsWith("#")) {
              replaced = true;
              return description;
            }
            return line;
          })
          .join("\n");
        writeFileSync(skillMdPath, updated, "utf8");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
