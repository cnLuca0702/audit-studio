import { NextResponse } from "next/server";
import { DEFAULT_PERSONA } from "@/lib/dsh/config";
export async function GET() { return NextResponse.json({prompt:DEFAULT_PERSONA}); }
