import { NextResponse } from "next/server";
import { db } from "@/db";
import { renders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateProject, paragraphs } from "@/lib/story";
import { RENDER_DIR, prepareStorage } from "@/lib/storage";
import { renderArguments, processes } from "@/lib/render-job";
import { dbRequired, pythonBinary } from "@/lib/api";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let id: string | undefined;
  const missing = dbRequired(); if (missing) return missing;
  try {
    const project = validateProject(await request.json());
    if (project.mode !== "storybook") throw new Error("For whiteboard or classic mode, choose browser video export.");
    if (!project.audioUrl) throw new Error("Add a narration track before exporting an MP4.");
    if (project.duration > 840 || paragraphs(project.script).length > 100) throw new Error("Online MP4 rendering supports up to 14 minutes and 100 pages. Use the offline render kit for longer stories.");
    if (processes.size >= 2) return NextResponse.json({ error: "The renderer is busy. Please try again shortly or export a browser video." }, { status: 429 });
    await prepareStorage();
    const [job] = await db.insert(renders).values({ status: "rendering" }).returning(); id = job.id;
    const folder = path.join(RENDER_DIR, job.id); await mkdir(folder, { recursive: true });
    const args = await renderArguments(project, folder);
    const executable = pythonBinary();
    const child = spawn(/* turbopackIgnore: true */ executable, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONUNBUFFERED: "1", OMP_NUM_THREADS: "2", OPENBLAS_NUM_THREADS: "2" } });
    processes.set(job.id, child);
    let stderr = "", pending = "", lastUpdate = 0;
    const update = async (values: Partial<typeof renders.$inferInsert>) => { try { await db.update(renders).set(values).where(eq(renders.id, job.id)); } catch (error) { console.error("Render status:", error); } };
    const timeout = setTimeout(() => child.kill("SIGTERM"), 16 * 60 * 1000);
    child.stdout?.on("data", data => {
      pending += data.toString(); const lines = pending.split("\n"); pending = lines.pop() || "";
      for (const line of lines) { try { const event = JSON.parse(line); if (typeof event.progress === "number" && Date.now() - lastUpdate > 900) { lastUpdate = Date.now(); void update({ progress: Math.min(99, Math.round(event.progress * 100)) }); } } catch { /* Non-JSON output is not a progress event. */ } }
    });
    child.stderr?.on("data", data => { stderr = (stderr + data.toString()).slice(-4000); });
    child.on("error", error => { clearTimeout(timeout); processes.delete(job.id); void update({ status: "failed", error: `Renderer unavailable: ${error.message}. You can still download the Python kit.` }); });
    child.on("close", (code, signal) => {
      clearTimeout(timeout); processes.delete(job.id);
      const cancelled = signal === "SIGTERM" || code === 130 || code === 143;
      void update(code === 0 ? { status: "complete", progress: 100 } : { status: cancelled ? "cancelled" : "failed", error: cancelled ? "Rendering was cancelled or exceeded 16 minutes." : (stderr.trim().slice(-1600) || "The renderer stopped unexpectedly.") });
    });
    return NextResponse.json({ id: job.id, status: "rendering" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start the render.";
    if (id) await db.update(renders).set({ status: "failed", error: message }).where(eq(renders.id, id)).catch(() => {});
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
