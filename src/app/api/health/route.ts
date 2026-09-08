import { db } from "@/db";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  
  // Database
  try {
    await db.execute(sql`select 1`);
    checks.database = { ok: true };
  } catch (e) {
    checks.database = { ok: false, detail: "PostgreSQL unreachable" };
  }

  // Storage directory
  const storageDir = path.join(process.cwd(), ".data", "media");
  checks.storage = { ok: existsSync(path.join(process.cwd(), ".data")), detail: existsSync(storageDir) ? "media folder exists" : "media folder missing" };

  // FFmpeg
  try { execSync("ffmpeg -version", { stdio: "ignore", timeout: 5000 }); checks.ffmpeg = { ok: true }; } catch { checks.ffmpeg = { ok: false, detail: "ffmpeg not found" }; }

  // Python
  try { execSync(`${process.env.PYTHON_BINARY || "python3"} --version`, { stdio: "ignore", timeout: 5000 }); checks.python = { ok: true }; } catch { checks.python = { ok: false, detail: "python3 not found" }; }

  // Edge TTS
  try { execSync(`${process.env.PYTHON_BINARY || "python3"} -c "import edge_tts"`, { stdio: "ignore", timeout: 5000 }); checks.edgeTts = { ok: true }; } catch { checks.edgeTts = { ok: false, detail: "edge-tts not installed" }; }

  // Static assets
  const assets = [
    "assets/hand_marker.png", "assets/storybook_spread_bg.png",
    "assets/fonts/storybook.ttf", "public/images/village-story.jpg",
  ];
  const missing = assets.filter(a => !existsSync(path.join(process.cwd(), a)));
  checks.assets = { ok: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(", ")}` : "All bundled" };

  const allOk = Object.values(checks).every(c => c.ok);
  return Response.json({ ok: allOk, checks, timestamp: new Date().toISOString() }, { status: allOk ? 200 : 207 });
}
