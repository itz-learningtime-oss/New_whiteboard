import { StoryProject, alignedWords, getScenes } from "@/lib/story";
import { localAsset } from "@/lib/storage";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChildProcess } from "node:child_process";

const globals = globalThis as typeof globalThis & { storybookProcesses?: Map<string, ChildProcess> };
export const processes = globals.storybookProcesses ||= new Map<string, ChildProcess>();
export async function renderArguments(project: StoryProject, folder: string) {
  const script = path.join(folder, "script.txt"); const timestamps = path.join(folder, "timestamps.json");
  await writeFile(script, project.script); await writeFile(timestamps, JSON.stringify({ words: alignedWords(project), timing_source: project.timingSource }));
  const args = ["main.py", "--mode", "storybook", "--images", ...getScenes(project).map(s => localAsset(s.image)), "--text", script, "--audio", localAsset(project.audioUrl), "--timestamps", timestamps, "--output", path.join(folder, "story.mp4"), "--fps", "30", "--page-turn", project.settings.transition, "--page-turn-duration", String(project.settings.transitionDuration), "--paper-style", project.settings.paper, "--sketch-speed", String(project.settings.sketchSpeed), "--progress-json", "--overwrite"];
  if (!project.settings.hand) args.push("--no-hand");
  if (!project.settings.highlight) args.push("--no-highlight");
  if (project.settings.textPen) args.push("--text-pen");
  if (project.settings.font === "handwritten") args.push("--storybook-font", path.join(process.cwd(), "public/fonts/caveat.ttf"));
  return args;
}
