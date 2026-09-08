import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MEDIA_DIR, prepareStorage } from "@/lib/storage";
import { db, isDbConfigured } from "@/db";
import { media } from "@/db/schema";
import { pythonBinary } from "@/lib/api";

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

    const python = pythonBinary();
    const script = `
import asyncio, json, edge_tts, tempfile, subprocess, wave, re
voice_cfg = ${JSON.stringify(VOICES[voice])}
text = ${JSON.stringify(text.trim())}
output = "${MEDIA_DIR}/" + "${randomUUID()}" + ".mp3"
def normal(s): return re.sub(r"[^\\w]", "", s.lower(), flags=re.UNICODE)
def distribute(bounds, tokens):
    words = []
    for kind, btext, start, end in bounds:
        if end <= start: continue
        if kind == "WordBoundary":
            words.append({"word": btext, "start": round(start,3), "end": round(end,3)})
            continue
        parts = btext.split()
        if not parts: continue
        weights = [max(2, len(normal(p))) + (3 if re.search(r"[.!?\\u201d]$", p) else 0) for p in parts]
        total = sum(weights) or 1
        cursor = start
        for part, weight in zip(parts, weights):
            nxt = cursor + weight / total * (end - start)
            words.append({"word": part, "start": round(cursor,3), "end": round(nxt,3)})
            cursor = nxt
    if [normal(w["word"]) for w in words] != [normal(t) for t in tokens]:
        span = (bounds[0][2], bounds[-1][3])
        weights = [max(2, len(normal(t))) + (3 if re.search(r"[.!?\\u201d]$", t) else 0) for t in tokens]
        total = sum(weights) or 1
        cursor = span[0]; words = []
        for token, weight in zip(tokens, weights):
            nxt = cursor + weight / total * (span[1] - span[0])
            words.append({"word": token, "start": round(cursor,3), "end": round(nxt,3)})
            cursor = nxt
    return words
communicate = edge_tts.Communicate(text, voice_cfg["id"], rate=voice_cfg["rate"], pitch=voice_cfg["pitch"], volume=voice_cfg["volume"])
bounds = []
with open(output, "wb") as f:
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            f.write(chunk["data"])
        elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
            bounds.append((chunk["type"], chunk["text"], chunk["offset"]/1e7, (chunk["offset"]+chunk["duration"])/1e7))
if not bounds:
    raise RuntimeError("No timing data returned. Check your network and try again.")
words = distribute(bounds, text.split())
for i in range(1, len(words)):
    if words[i]["start"] < words[i-1]["end"]:
        words[i]["start"] = words[i-1]["end"]
    if words[i]["end"] <= words[i]["start"]:
        words[i]["end"] = round(words[i]["start"] + 0.05, 3)
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
    // Register the narration in the media library so it survives restarts.
    if (isDbConfigured()) {
      try {
        const info = await stat(data.audio);
        await db.insert(media).values({
          filename: audioName,
          originalName: `tts-${voice}.mp3`,
          mimeType: "audio/mpeg",
          size: info.size,
        });
      } catch (error) { console.error("TTS media register:", error); }
    }

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
