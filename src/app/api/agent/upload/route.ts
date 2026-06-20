import { NextResponse } from "next/server";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { isPathAllowedForBrowse } from "@/lib/path-access";

function safeFilename(name: string): string {
  const base = basename(name).replace(/[^\w.\-()+\u4e00-\u9fff]/g, "_");
  return base || "upload";
}

// POST /api/agent/upload — save uploaded file into cwd/uploads
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const cwd = form.get("cwd");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (typeof cwd !== "string" || !cwd.trim()) {
      return NextResponse.json({ error: "Missing cwd" }, { status: 400 });
    }

    const workDir = cwd.trim();
    const targetDir = join(workDir, "uploads");
    if (!isPathAllowedForBrowse(workDir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const filename = safeFilename(file.name);
    const destPath = join(targetDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(destPath, buffer);

    return NextResponse.json({ path: destPath, name: filename });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
