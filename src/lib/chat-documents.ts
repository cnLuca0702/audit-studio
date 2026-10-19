import { mkdir, writeFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname, extname } from "node:path";
import { chromium } from "playwright";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export const DOCUMENT_PROMPT = `当用户要求将对话或回复整理为 Word、PDF、Markdown 等文件时，必须调用 export_document 工具，将完整正文作为 content 传入。Word 使用 docx 格式，不要通过 shell 安装依赖，也不要将纯文本直接改为 .docx/.pdf。可以多次调用以输出多个格式。工具成功后告知用户文件已保存，可在右侧成果栏预览和下载；失败时如实报告错误。`;

export async function workspacePath(cwd: string, path = ".") {
  const root = await realpath(cwd);
  const target = await realpath(resolve(root, path));
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error("文件超出工作目录");
  return target;
}

export async function exportDocument(cwd: string, args: { filename: string; format: string; content: string }) {
  const format = args.format === "word" ? "docx" : args.format.toLowerCase();
  if (!["docx", "pdf", "md", "txt"].includes(format)) throw new Error("支持 docx、pdf、md、txt 格式");
  if (!args.content?.trim()) throw new Error("文档正文不能为空");
  if (Buffer.byteLength(args.content) > 5 * 1024 * 1024) throw new Error("文档正文不能超过 5MB");
  const root = await realpath(cwd);
  await mkdir(resolve(root, "outputs"), { recursive: true });
  const outputDir = await workspacePath(root, "outputs");
  const base = args.filename.replace(/.*[/\\]/, "").replace(/\.(docx?|pdf|md|txt)$/i, "").replace(/[<>:"|?*\x00-\x1f]/g, "_").slice(0, 100) || "对话文档";
  // Exclusive writes prevent overwriting earlier exports or following an existing symlink.
  let buffer: Buffer;
  if (format === "docx") {
    buffer = await Packer.toBuffer(new Document({
      styles: { default: { document: { run: { font: "Microsoft YaHei", size: 24 }, paragraph: { spacing: { after: 120, line: 360 } } } } },
      sections: [{ children: args.content.split(/\r?\n/).map(line => {
        const heading = /^(#{1,3})\s+(.+)$/.exec(line);
        return new Paragraph({ heading: heading ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][heading[1].length - 1] : undefined,
          children: [new TextRun(heading ? heading[2] : line)] });
      }) }],
    }));
  } else if (format === "pdf") {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const escaped = args.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await page.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>@page{size:A4;margin:22mm}body{font-family:"Noto Sans CJK SC",sans-serif;font-size:12pt;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}</style><body>${escaped}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      buffer = await page.pdf({ format: "A4", printBackground: true });
    } finally { await browser.close(); }
  } else buffer = Buffer.from(args.content, "utf8");
  for (let n = 0; ; n++) {
    const path = resolve(outputDir, `${base}${n ? `-${n}` : ""}.${format}`);
    try { await writeFile(path, buffer, { flag: "wx" }); return { path, filename: path.slice(dirname(path).length + 1), size: buffer.length }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
}

export const FILE_TYPES: Record<string, string> = { ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
export async function checkedFile(cwd: string, path: string) {
  const file = await workspacePath(cwd, path);
  const info = await stat(file);
  if (!info.isFile()) throw new Error("请选择文件");
  if (info.size > 30 * 1024 * 1024) throw new Error("预览或下载的文件不能超过 30MB");
  return { file, type: FILE_TYPES[extname(file).toLowerCase()] || "application/octet-stream" };
}
