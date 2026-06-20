import { NextResponse } from "next/server";
import { homedir } from "os";

// GET /api/home — return user home directory
export async function GET() {
  return NextResponse.json({ path: homedir() });
}
