import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, extname } from "node:path";
import mammoth from "mammoth";
import { checkedFile, workspacePath } from "@/lib/chat-documents";
import { isPathAllowedForBrowse } from "@/lib/path-access";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cwd = params.get("cwd") || "";
  if (!isPathAllowedForBrowse(cwd)) return NextResponse.json({ error: "工作目录不可访问" }, { status: 403 });
  try {
    const path = params.get("path") || ".";
    const action = params.get("action") || "list";
    if (action === "list") {
      const directory = await workspacePath(cwd, path);
      const entries = await readdir(directory, { withFileTypes: true });
      const items = await Promise.all(entries.filter(e => !e.name.startsWith(".") && !e.isSymbolicLink()).map(async e => ({ name: e.name, path: join(directory, e.name), isDirectory: e.isDirectory(), modified: (await stat(join(directory, e.name))).mtimeMs })));
      return NextResponse.json({ entries: items }, { headers: { "Cache-Control": "no-store" } });
    }
    const { file, type } = await checkedFile(cwd, path);
    const buffer = await readFile(file);
    if (action === "preview" && extname(file).toLowerCase() === ".docx") {
      const result = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ content: result.value });
    }
    if (action === "preview" && ![".pdf", ".md", ".txt"].includes(extname(file).toLowerCase())) {
      return NextResponse.json({ error: "此格式暂不支持预览，可直接下载" }, { status: 415 });
    }
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": type,
      "Content-Disposition": `${action === "download" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(basename(file))}`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "文件操作失败" }, { status: 400 }); }
}
