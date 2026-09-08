import { db, isDbConfigured } from "@/db";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { pythonBinary } from "@/lib/api";

export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail?: string; optional?: boolean };

function probe(command: string, optionalDetail: string): Check {
  try {
    execSync(command, { stdio: "ignore", timeout: 8000 });
    return { ok: true };
  } catch {
    return { ok: false, detail: optionalDetail, optional: true };
  }
}

function pythonCandidates(): string[] {
  const preferred = pythonBinary();
  const fallbacks = ["python", "python3", "py"];
  return [preferred, ...fallbacks.filter(c => c !== preferred)];
}

function workingPython(): string | null {
  for (const candidate of pythonCandidates()) {
    try {
      execSync(`${candidate} --version`, { stdio: "ignore", timeout: 8000 });
      return candidate;
    } catch { /* try the next candidate */ }
  }
  return null;
}

export async function GET() {
  const checks: Record<string, Check> = {};

  // Database (required)
  if (!isDbConfigured()) {
    checks.database = { ok: false, detail: "DATABASE_URL is not set. See README for local PostgreSQL setup." };
  } else {
    try {
      await db.execute(sql`select 1`);
      checks.database = { ok: true };
    } catch {
      checks.database = { ok: false, detail: "PostgreSQL unreachable. Is the service running and DATABASE_URL correct?" };
    }
  }

  // Storage directory (required)
  const storageDir = path.join(process.cwd(), ".data", "media");
  const dataExists = existsSync(path.join(process.cwd(), ".data"));
  checks.storage = {
    ok: dataExists,
    detail: existsSync(storageDir) ? "media folder exists" : dataExists ? "media folder will be created on first upload" : "data folder missing",
  };
  if (!existsSync(storageDir) && dataExists) checks.storage.ok = true;

  // FFmpeg (optional: only needed for MP4 render + TTS probing)
  const ffmpeg = probe("ffmpeg -version", "ffmpeg not found on PATH. Needed for MP4 export and voice generation.");
  checks.ffmpeg = ffmpeg;

  // Python (optional: only needed for MP4 render + voice generation)
  const python = workingPython();
  checks.python = python
    ? { ok: true, detail: `using ${python}`, optional: true }
    : { ok: false, detail: "No Python found (tried python, python3, py). Needed for MP4 export and voice generation.", optional: true };

  // Edge TTS (optional)
  if (python) {
    checks.edgeTts = probe(`${python} -c "import edge_tts"`, "edge-tts not installed. Run: python -m pip install -r requirements.txt");
  } else {
    checks.edgeTts = { ok: false, detail: "Skipped: no Python available.", optional: true };
  }

  // Static assets (optional but expected for the demo project)
  const assets = [
    "public/images/village-story.jpg",
    "public/images/village-garden.jpg",
    "public/images/village-sunset.jpg",
    "public/images/hand_marker.png",
    "public/audio/the-little-things.mp3",
    "public/audio/demo-timestamps.json",
    "public/fonts/lora.ttf",
    "public/fonts/caveat.ttf",
    "public/fonts/dm-sans.ttf",
    "assets/hand_marker.png",
    "assets/storybook_spread_bg.png",
    "assets/fonts/storybook.ttf",
  ];
  const missing = assets.filter(a => !existsSync(path.join(process.cwd(), a)));
  checks.assets = {
    ok: missing.length === 0,
    detail: missing.length ? `Missing: ${missing.join(", ")}. Run: python scripts/setup_assets.py` : "All bundled",
    optional: true,
  };

  const requiredOk = Object.values(checks).every(c => c.ok || c.optional);
  return Response.json({ ok: requiredOk, checks, timestamp: new Date().toISOString() }, { status: requiredOk ? 200 : 207 });
}
