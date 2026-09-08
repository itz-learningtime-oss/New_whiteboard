import { NextResponse } from "next/server";
import { db } from "@/db";
import { renders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { RENDER_DIR } from "@/lib/storage";
import { dbRequired } from "@/lib/api";
import path from "node:path";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const missing = dbRequired(); if (missing) return missing;
  try {
    const { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid render.");
    const [job] = await db.select().from(renders).where(eq(renders.id, id));
    if (job?.status !== "complete") return NextResponse.json({ error: "This video is not ready yet." }, { status: 409 });
    const file = await readFile(path.join(RENDER_DIR, id, "story.mp4"));
    return new NextResponse(file, { headers: { "Content-Type": "video/mp4", "Content-Disposition": 'attachment; filename="my-storybook.mp4"', "Content-Length": String(file.length) } });
  } catch { return NextResponse.json({ error: "Video not found. Please render it again." }, { status: 404 }); }
}
