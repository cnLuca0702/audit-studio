import { NextResponse } from "next/server";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  createReadStream,
} from "fs";
import { join, extname } from "path";
import { watch } from "fs";
import { isPathAllowed } from "@/lib/path-access";

// MIME type map for common binary formats
const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

function isBinaryFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext in MIME_MAP;
}

// GET /api/files/[...path]?type=list|read|watch
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const filePath = "/" + pathSegments.join("/");
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "list";

  if (!isPathAllowed(filePath)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Path not found" }, { status: 404 });
  }

  try {
    const stat = statSync(filePath);

    // ---- list ----
    if (type === "list") {
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: "Not a directory" }, { status: 400 });
      }
      const entries = readdirSync(filePath, { withFileTypes: true }).map(
        (entry) => ({
          name: entry.name,
          path: join(filePath, entry.name),
          isDirectory: entry.isDirectory(),
        })
      );
      return NextResponse.json({ path: filePath, entries });
    }

    // ---- read ----
    if (type === "read") {
      if (!stat.isFile()) {
        return NextResponse.json({ error: "Not a file" }, { status: 400 });
      }

      // Binary files — stream with Range support
      if (isBinaryFile(filePath)) {
        const mimeType = getMimeType(filePath);
        const rangeHeader = req.headers.get("range");

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunkSize = end - start + 1;

          // Use ReadableStream for range responses
          const { Readable } = await import("stream");
          const nodeStream = createReadStream(filePath, { start, end });
          const webStream = Readable.toWeb(nodeStream) as ReadableStream;

          return new NextResponse(webStream, {
            status: 206,
            headers: {
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(chunkSize),
              "Content-Type": mimeType,
            },
          });
        }

        // Full file — stream
        const { Readable } = await import("stream");
        const nodeStream = createReadStream(filePath);
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;

        return new NextResponse(webStream, {
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(stat.size),
            "Accept-Ranges": "bytes",
          },
        });
      }

      // Text files
      const content = readFileSync(filePath, "utf8");
      return NextResponse.json({
        path: filePath,
        content,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }

    // ---- watch (SSE) ----
    if (type === "watch") {
      const encoder = new TextEncoder();
      let watcher: ReturnType<typeof watch> | null = null;

      const stream = new ReadableStream({
        start(controller) {
          // Send initial event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "init", path: filePath })}\n\n`)
          );

          try {
            watcher = watch(filePath, { recursive: true }, (eventType, filename) => {
              try {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: eventType, file: filename ?? filePath, timestamp: Date.now() })}\n\n`
                  )
                );
              } catch {
                // Stream already closed
              }
            });
          } catch (err) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`)
            );
          }
        },
        cancel() {
          watcher?.close();
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
