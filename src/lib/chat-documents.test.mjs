import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mammoth from "mammoth";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { exportDocument, workspacePath } from "./chat-documents.ts";

test("中文 Word、Markdown 可生成并读取，重名文件不覆盖", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "chat-export-"));
  try {
    const content = "# 项目总结\n\n中文内容、预算 100 万元。\n第二段。";
    const word = await exportDocument(cwd, { filename: "总结.docx", format: "docx", content });
    const buffer = await readFile(word.path);
    assert.equal(buffer.subarray(0, 2).toString(), "PK");
    assert.match((await mammoth.extractRawText({ buffer })).value, /中文内容、预算 100 万元/);
    const md = await exportDocument(cwd, { filename: "总结", format: "md", content });
    assert.equal(await readFile(md.path, "utf8"), content);
    const duplicate = await exportDocument(cwd, { filename: "总结", format: "md", content: "新版本" });
    assert.notEqual(duplicate.path, md.path);
    assert.equal(await readFile(md.path, "utf8"), content);

  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("中文 PDF 可生成并提取正文", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "chat-pdf-"));
  try {
    const content = "# 项目总结\n\n中文内容、预算 100 万元。\n第二段。";
    const pdf = await exportDocument(cwd, { filename: "总结", format: "pdf", content });
    const pdfBuffer = await readFile(pdf.path);
    assert.equal(pdfBuffer.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdfBuffer.length > 1000);
    const parsed = await require("pdf-parse")(pdfBuffer);
    assert.match(parsed.text.replace(/\s/g, ""), /中文内容、预算100万元/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("禁止跨工作目录读取及 outputs 符号链接逃逸", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "chat-export-"));
  const outside = await mkdtemp(join(tmpdir(), "chat-outside-"));
  try {
    await assert.rejects(workspacePath(cwd, ".."), /超出工作目录/);
    await symlink(outside, join(cwd, "outputs"));
    await assert.rejects(exportDocument(cwd, { filename: "test", format: "md", content: "test" }), /超出工作目录/);
    await assert.rejects(exportDocument(cwd, { filename: "test", format: "exe", content: "test" }), /支持/);
    await assert.rejects(exportDocument(cwd, { filename: "test", format: "md", content: "" }), /不能为空/);
  } finally { await rm(cwd, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
