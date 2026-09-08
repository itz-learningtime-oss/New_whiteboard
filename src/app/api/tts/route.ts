import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MEDIA_DIR, prepareStorage } from "@/lib/storage";

export const runtime = "nodejs";

const VOICES: Record<string, { id: string; rate: string; pitch: string; volume: string }> = {
  neerja: { id: "en-IN-NeerjaExpressiveNeural", rate: "-8%", pitch: "-3Hz", volume: "+5%" },
  brian: { id: "en-US-BrianNeural", rate: "-12%", pitch: "-3Hz", volume: "+5%" },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, voice = "neerja" } = body as { text?: string; voice?: string };
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return NextResponse.json({ error: "Provide at least 5 characters of text for narration." }, { status: 400 });
    }
    if (text.length > 10000) {
      return NextResponse.json({ error: "Keep the narration text under 10,000 characters." }, { status: 400 });
    }
    if (!VOICES[voice]) {
      return NextResponse.json({ error: `Choose a valid voice: ${Object.keys(VOICES).join(", ")}.` }, { status: 400 });
    }
    await prepareStorage();

    const python = process.env.PYTHON_BINARY || "python3";
    const script = `
import asyncio, json, edge_tts, tempfile, subprocess, wave
voice_cfg = ${JSON.stringify(VOICES[voice])}
text = ${JSON.stringify(text.trim())}
output = "${MEDIA_DIR}/" + "${randomUUID()}" + ".mp3"
communicate = edge_tts.Communicate(text, voice_cfg["id"], rate=voice_cfg["rate"], pitch=voice_cfg["pitch"], volume=voice_cfg["volume"])
words = []
with open(output, "wb") as f:
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            f.write(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            words.append({"word": chunk["text"], "start": round(chunk["offset"]/1e7,3), "end": round((chunk["offset"]+chunk["duration"])/1e7,3)})
if not words:
    raise RuntimeError("No word boundaries returned.")
probe = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", output], capture_output=True, text=True, timeout=30)
dur = float(probe.stdout.strip()) if probe.returncode==0 else words[-1]["end"]+0.1
offset = words[0]["start"]
for w in words:
    w["start"]=round(w["start"]-offset,3); w["end"]=round(w["end"]-offset,3)
dur=round(dur-offset,3) if dur>offset else round(dur,3)
# Save timestamps alongside
ts_path=output.replace(".mp3",".json")
with open(ts_path,"w") as jf: json.dump({"words":words,"duration":dur,"voice":"${voice}","source":"edge-tts-word-boundary"}, jf)
print(json.dumps({"audio":output,"timestamps":ts_path,"duration":dur,"words":len(words)}))
`.trim();

    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(python, ["-c", script], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", d => { stdout += d.toString(); });
      child.stderr.on("data", d => { stderr += d.toString(); });
      child.on("close", code => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr.slice(-1000) || "TTS generation failed."));
      });
      child.on("error", reject);
      setTimeout(() => { child.kill("SIGTERM"); reject(new Error("TTS timed out.")); }, 120_000);
    });

    const data = JSON.parse(result);
    const audioName = path.basename(data.audio);
    const tsName = audioName.replace(".mp3", ".json");
    const audioUrl = `/api/media/${audioName}`;
    const words = JSON.parse(await readFile(data.timestamps, "utf-8"));

    return NextResponse.json({
      audioUrl,
      audioName: `tts-${voice}.mp3`,
      duration: data.duration,
      words: words.words,
      timingSource: "word-level",
      voice,
      wordCount: data.words,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice generation failed. Check your network and try again." },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    voices: Object.entries(VOICES).map(([key, v]) => ({
      key,
      id: v.id,
      rate: v.rate,
      pitch: v.pitch,
      volume: v.volume,
    })),
    info: "Edge TTS generates audio using Microsoft's neural voice service. Requires network access.",
  });
}
