import path from "path";

/**
 * Extract text content from an uploaded file.
 * Supports: .txt, .md, .docx, .pdf, .xlsx, .xls
 */
export async function extractText(file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (ext) {
    case ".txt":
    case ".md":
      return buffer.toString("utf-8");

    case ".docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.default.extractRawText({ buffer: buffer as any });
      return result.value || "";
    }

    case ".pdf": {
      const pdfParse = require(/* turbopackIgnore: true */ "pdf-parse");
      const result = await pdfParse(buffer);
      return result?.text || "";
    }

    case ".xlsx":
    case ".xls": {
      const XLSX = require(/* turbopackIgnore: true */ "xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets: string[] = [];
      for (const sheetName of workbook.sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
        if (csv.trim()) {
          sheets.push(`【${sheetName}】\n${csv}`);
        }
      }
      return sheets.join("\n\n") || "";
    }

    default:
      throw new Error(`不支持的文件格式: ${ext}`);
  }
}
