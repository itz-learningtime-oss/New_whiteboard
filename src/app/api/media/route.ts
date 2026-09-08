import { db } from "@/db";
import { media } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR, prepareStorage } from "@/lib/storage";

const types: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm", "video/webm": "webm" };
export async function GET() {
  try { const files = await db.select().from(media).orderBy(desc(media.createdAt)).limit(100); return NextResponse.json(files.map(f => ({ ...f, url: `/api/media/${f.filename}` }))); }
  catch { return NextResponse.json({ error: "Unable to load your media." }, { status: 500 }); }
}
export async function POST(request: Request) {
  let destination: string | undefined;
  try {
    if (Number(request.headers.get("content-length") || 0) > 32 * 1024 * 1024) return NextResponse.json({ error: "Choose a file smaller than 30 MB." }, { status: 413 });
    const data = await request.formData(); const file = data.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose an image or audio file.");
    const extension = types[file.type];
    if (!extension) throw new Error("Use a JPG, PNG, WebP, MP3, WAV, OGG, M4A, or WebM file.");
    const maxSize = file.type.startsWith("image/") ? 10 : 30;
    if (file.size > maxSize * 1024 * 1024) throw new Error(`This file exceeds the ${maxSize} MB limit.`);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (file.type === "image/png" && !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("This is not a valid PNG.");
    if (file.type === "image/jpeg" && !(bytes[0] === 255 && bytes[1] === 216)) throw new Error("This is not a valid JPEG.");
    if (file.type === "image/webp" && bytes.toString("ascii", 8, 12) !== "WEBP") throw new Error("This is not a valid WebP.");
    await prepareStorage(); const filename = `${randomUUID()}.${extension}`; destination = path.join(MEDIA_DIR, filename);
    await writeFile(destination, bytes);
    const [saved] = await db.insert(media).values({ filename, originalName: file.name.slice(0, 200), mimeType: file.type, size: file.size }).returning();
    return NextResponse.json({ ...saved, url: `/api/media/${filename}` }, { status: 201 });
  } catch (error) { if (destination) await unlink(destination).catch(() => {}); return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 }); }
}
