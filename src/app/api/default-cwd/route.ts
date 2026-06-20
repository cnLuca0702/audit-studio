import { NextResponse } from "next/server";
import { mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// POST /api/default-cwd — create default working directory ~/pi-cwd-YYYYMMDD
export async function POST() {
  try {
    const today = new Date();
    const dateStr =
      String(today.getFullYear()) +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    const dirPath = join(homedir(), `pi-cwd-${dateStr}`);

    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    return NextResponse.json({ path: dirPath });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
