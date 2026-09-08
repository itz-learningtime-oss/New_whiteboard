import { readFile, stat } from "node:fs/promises";
import { localAsset } from "@/lib/storage";
import { NextResponse } from "next/server";
const mime: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", webm: "audio/webm" };
export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await context.params; const filename = localAsset(`/api/media/${name}`); const info = await stat(filename);
    const headers = new Headers({ "Content-Type": mime[name.split(".").at(-1)!] || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" });
    const range = request.headers.get("range"); const bytes = await readFile(/* turbopackIgnore: true */ filename);
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      const start = Number(match[1]); const end = Math.min(match[2] ? Number(match[2]) : info.size - 1, info.size - 1);
      if (start > end || start >= info.size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`); headers.set("Content-Length", String(end - start + 1));
      return new NextResponse(bytes.subarray(start, end + 1), { status: 206, headers });
    }
    headers.set("Content-Length", String(info.size)); return new NextResponse(bytes, { headers });
  } catch { return NextResponse.json({ error: "Media file not found." }, { status: 404 }); }
}
