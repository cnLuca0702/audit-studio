import { NextResponse } from "next/server";
import { buildCleanDocx, buildRevisionDocx } from "@/lib/docx-export";

interface DownloadBody {
  /** 清稿模式正文（默认模式，DocMerge 等沿用 {content, filename} 契约） */
  content?: string;
  filename?: string;
  /** "revision" 时导出真实修订 DOCX */
  mode?: "clean" | "revision";
  before?: string;
  after?: string;
  operation?: {
    id?: unknown;
    kind?: unknown;
    createdAt?: unknown;
    summary?: unknown;
  };
}

const MAX_TEXT_LENGTH = 2_000_000;
const MAX_META_LENGTH = 500;
// XML 1.0 非法控制字符（代理对由 clamp 边界与 docx 库共同保证）
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// POST /api/doc-rewrite/download-docx — 生成 docx（清稿 / 真实修订）
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DownloadBody;

    if (body.mode === "revision") {
      // 修订模式：仅接受纯文本 before/after 与元数据，服务端重算 diff
      const before = body.before;
      const after = body.after;
      if (typeof before !== "string" || typeof after !== "string") {
        return errorResponse("修订导出需要 before/after 纯文本");
      }
      if (!before.trim() || !after.trim()) {
        return errorResponse("修订导出的正文不能为空");
      }
      if (before.length > MAX_TEXT_LENGTH || after.length > MAX_TEXT_LENGTH) {
        return errorResponse("正文超出导出上限");
      }
      if (XML_ILLEGAL.test(before) || XML_ILLEGAL.test(after)) {
        return errorResponse("正文包含无法写入 DOCX 的控制字符");
      }
      if (before === after) {
        return errorResponse("修订导出的前后文本相同，无修订可生成");
      }
      const op = body.operation ?? {};
      const id = typeof op.id === "string" ? op.id.trim() : "";
      const kind = op.kind;
      const createdAt = op.createdAt;
      const summary = typeof op.summary === "string" ? op.summary : "";
      if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) {
        return errorResponse("修订操作 ID 不合法");
      }
      if (kind !== "full" && kind !== "partial") {
        return errorResponse("修订操作种类不合法");
      }
      if (typeof createdAt !== "number" || !Number.isFinite(createdAt) || createdAt <= 0) {
        return errorResponse("修订操作时间不合法");
      }
      if (summary.length > MAX_META_LENGTH) {
        return errorResponse("修订说明过长");
      }

      const { buffer } = await buildRevisionDocx(before, after, {
        id,
        kind,
        createdAt,
        summary,
      });
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            `revision-${id.slice(0, 8)}.docx`
          )}`,
        },
      });
    }

    // 默认：清稿模式（保持既有 {content, filename} 契约）
    const { content, filename } = body;
    if (typeof content !== "string" || !content.trim()) {
      return errorResponse("内容为空");
    }
    if (content.length > MAX_TEXT_LENGTH) {
      return errorResponse("内容超出导出上限");
    }
    if (XML_ILLEGAL.test(content)) {
      return errorResponse("内容包含无法写入 DOCX 的控制字符");
    }

    const buffer = await buildCleanDocx(content);
    const safeName =
      (filename?.replace(/\.docx?$/i, "") || "rewritten-document") + ".docx";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "生成文档失败" }, { status: 500 });
  }
}
