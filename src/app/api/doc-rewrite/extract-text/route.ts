import { NextResponse } from "next/server";
import { extractText } from "@/lib/file-parser";

export const runtime = "nodejs";

// POST /api/doc-rewrite/extract-text — upload file, extract text
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "文件大小不能超过 20MB" }, { status: 400 });
    }
    const text = await extractText(file);
    if (!text.trim()) {
      return NextResponse.json({ error: "未能从文件中提取到文本内容" }, { status: 400 });
    }
    return NextResponse.json({ text });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "文件解析失败" },
      { status: 500 }
    );
  }
}
