import { NextResponse } from "next/server";
import JSZip from "jszip";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { validateProject, alignedWords, getScenes } from "@/lib/story";
import { localAsset } from "@/lib/storage";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const project = validateProject(await request.json());
    if (project.mode === "classic") throw new Error("Classic video uses browser export. Choose storybook or whiteboard mode for an offline Python kit.");
    if (!project.audioUrl) throw new Error("Add your narration before downloading the render kit.");
    const zip = new JSZip(); const root = process.cwd();
    const files = ["main.py", "requirements.txt", "UPSTREAM-LICENSE.txt", "src/__init__.py", "src/audio_manager.py", "src/canvas_camera.py", "src/contour_processor.py", "src/sketch_animator.py", "src/subtitles.py", "src/video_exporter.py", "src/storybook_layout.py", "src/storybook_engine.py", "src/page_flip.py", "assets/hand_marker.png", "assets/LICENSE.md", "assets/fonts/storybook.ttf", "assets/fonts/OFL.txt", "assets/fonts/Caveat-OFL.txt", "assets/storybook_spread_bg.png"];
    await Promise.all(files.map(async file => {
      const diskPath = path.join(root, file);
      zip.file(file, await readFile(/* turbopackIgnore: true */ diskPath));
    }));
    zip.file("assets/fonts/handwriting.ttf", await readFile(path.join(root, "public/fonts/caveat.ttf")));
    const scenes = getScenes(project); if (scenes.length > 30) throw new Error("Split stories longer than 30 pages into separate kits.");
    let totalBytes = 0; const images: string[] = [];
    for (const [i, scene] of scenes.entries()) { const source = localAsset(scene.image); totalBytes += (await stat(source)).size; if (totalBytes > 128 * 1024 * 1024) throw new Error("The kit is too large. Use smaller illustrations."); const name = `inputs/page-${String(i + 1).padStart(2, "0")}${path.extname(source)}`; images.push(name); zip.file(name, await readFile(source)); }
    const audioSource = localAsset(project.audioUrl); const audio = `inputs/narration${path.extname(audioSource)}`; zip.file(audio, await readFile(audioSource));
    zip.file("inputs/story.txt", project.script); zip.file("inputs/timestamps.json", JSON.stringify({ words: alignedWords(project), source: project.timingSource }, null, 2));
    const args = ["python3", "main.py", "--mode", project.mode === "storybook" ? "storybook" : "whiteboard", "--images", ...images, "--text", "inputs/story.txt", "--audio", audio, "--timestamps", "inputs/timestamps.json", "--output", "my-storybook.mp4", "--fps", "30", "--page-turn", project.settings.transition, "--page-turn-duration", String(project.settings.transitionDuration), "--paper-style", project.settings.paper, "--sketch-speed", String(project.settings.sketchSpeed)];
    if (!project.settings.hand) args.push("--no-hand"); if (!project.settings.highlight) args.push("--no-highlight"); if (project.settings.textPen) args.push("--text-pen"); if (project.settings.font === "handwritten") args.push("--storybook-font", "assets/fonts/handwriting.ttf");
    const command = args.join(" ");
    zip.file("render.sh", `#!/usr/bin/env bash\nset -e\ncd "$(dirname "$0")"\n${command}\n`, { unixPermissions: "755" });
    zip.file("render.bat", `@echo off\r\ncd /d "%~dp0"\r\n${command.replace(/^python3/, "python")}\r\npause\r\n`);
    zip.file("project.json", JSON.stringify(project, null, 2));
    zip.file("README.md", `# ${project.name}\n\nYour complete My Voice, My Story offline render kit.\n\n## Render\n1. Install Python 3.10+ and FFmpeg (including ffprobe).\n2. Run: python -m pip install -r requirements.txt\n3. macOS/Linux: bash render.sh\n   Windows: render.bat\n\nThe output is my-storybook.mp4: H.264 / AAC, 1920 × 1080, 30 FPS.\n\n## Audio synchronization\nThis project's timing source: ${project.timingSource}. Word-level JSON uses the original audio clock. Estimated timings and SRT-derived word boundaries are approximations, not forced alignment. Replace inputs/timestamps.json with matching Whisper word-level timestamps for precise synchronization.\n\nParagraphs are separated by blank lines. Each uses a matching image. Page turns run for ${project.settings.transitionDuration}s over the existing timeline; they never shift the audio.\n\nLeft viewport: (60,40)–(930,1040). Right viewport: (990,40)–(1860,1040). Text and pen overlays are clipped to their own page surfaces.\n\nSource based on itz-learningtime-oss/MY_VOICE_MY_story. See UPSTREAM-LICENSE.txt and asset/font licenses. Your uploaded media remains yours.\n`);
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 3 } });
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="my-storybook-render-kit.zip"' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare your kit." }, { status: 400 }); }
}
