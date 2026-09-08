import { NextResponse } from "next/server";
import { db } from "@/db";
import { renders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processes } from "@/lib/render-job";
import { dbRequired } from "@/lib/api";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return NextResponse.json({ error: "Invalid render ID." }, { status: 400 });
  const missing = dbRequired(); if (missing) return missing;
  try {
  const [job] = await db.select().from(renders).where(eq(renders.id, id));
  if (!job) return NextResponse.json({ error: "Render not found." }, { status: 404 });
  if (job.status === "rendering" && !processes.has(id) && Date.now() - job.createdAt.getTime() > 60_000) {
    await db.update(renders).set({ status: "failed", error: "The renderer restarted. Please export again." }).where(eq(renders.id, id));
    return NextResponse.json({ ...job, status: "failed", error: "The renderer restarted. Please export again." });
  }
  return NextResponse.json({ ...job, url: job.status === "complete" ? `/api/render/${id}/download` : null });
  } catch { return NextResponse.json({ error: "Unable to load the render job." }, { status: 500 }); }
}
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return NextResponse.json({ error: "Invalid render ID." }, { status: 400 });
  const missing = dbRequired(); if (missing) return missing;
  try {
  const child = processes.get(id); child?.kill("SIGTERM");
  await db.update(renders).set({ status: "cancelled", error: "Cancelled by the creator." }).where(eq(renders.id, id));
  return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Unable to cancel the render job." }, { status: 500 }); }
}
