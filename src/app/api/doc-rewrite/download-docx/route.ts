import { NextResponse } from "next/server";
import { join } from "path";
import { homedir } from "os";
import { Document, Packer, Paragraph, TextRun } from "docx";

interface DownloadBody {
  content: string;
  filename?: string;
}

// POST /api/doc-rewrite/download-docx — generate docx
export async function POST(req: Request) {
  try {
    const { content, filename } = (await req.json()) as DownloadBody;
    if (!content?.trim()) {
      return NextResponse.json({ error: "内容为空" }, { status: 400 });
    }

    const doc = new Document({
      sections: [
        {
          children: content.split("\n").map(
            (line) =>
              new Paragraph({
                children: [new TextRun({ text: line, size: 24, font: "Microsoft YaHei" })],
                spacing: { after: 200 },
              })
          ),
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeName = (filename?.replace(/\.docx?$/i, "") || "rewritten-document") + ".docx";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "生成文档失败" }, { status: 500 });
  }
}
