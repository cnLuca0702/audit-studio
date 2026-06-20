import { NextResponse } from "next/server";
import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { isPathAllowedForBrowse } from "@/lib/path-access";

// GET /api/cwd/browse?path=/absolute/path
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path")?.trim() ?? "";
  if (!rawPath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const filePath = resolve(rawPath);

  if (!isPathAllowedForBrowse(filePath)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Path not found" }, { status: 404 });
  }

  try {
    const stat = statSync(filePath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    const entries = readdirSync(filePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: join(filePath, entry.name),
        isDirectory: true,
      }));

    return NextResponse.json({ path: filePath, entries });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
