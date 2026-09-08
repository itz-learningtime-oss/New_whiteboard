export type WordTiming = { word: string; start: number; end: number };
export type StorySettings = {
  highlight: boolean; hand: boolean; textPen: boolean; typing: boolean;
  font: "serif" | "handwritten"; paper: "ivory" | "white" | "warm";
  transition: "curl" | "fade" | "none"; transitionDuration: number; sketchSpeed: number;
  theme: "classic" | "night" | "garden" | "fairy"; textShadow: boolean; glow: boolean;
};
export type StoryProject = {
  id?: string; name: string; script: string; images: string[]; imageNames: string[];
  audioUrl: string; audioName: string; duration: number; words: WordTiming[];
  timingSource: "estimated" | "word-level"; settings: StorySettings;
  mode: "storybook" | "whiteboard" | "classic";
};
export type Scene = { text: string; title: string; image: string; start: number; end: number; words: WordTiming[] };

export const DEMO_SCRIPT = `Kael walked by, carrying a crate of supplies. He stopped when he saw Elara’s thoughtful face. “You know,” he said with a gentle smile, “the most wonderful things don’t always come with a price.” Elara looked down at the little golden coin in her palm. For the first time, she wondered what it was she was really looking for.

They wandered into the garden behind the old shop. Kael picked up a tiny seedling, its leaves reaching toward the afternoon sun. “This little plant needs patience, a little water, and someone who cares,” he said. “You can’t hurry the things that matter.” Elara carefully cradled the pot in her hands, feeling the quiet promise of something yet to grow.

As the sun painted the rooftops gold, Elara walked home with her new little plant. Her coin was still tucked safely in her pocket. But she carried something more valuable now: the understanding that joy could be found in the simplest things. And sometimes, the smallest moment could become the beginning of a very beautiful story.`;

export const DEFAULT_SETTINGS: StorySettings = { highlight: true, hand: true, textPen: false, typing: false, font: "serif", paper: "ivory", transition: "curl", transitionDuration: 1.2, sketchSpeed: 1.5, theme: "classic", textShadow: false, glow: false };
export const DEFAULT_PROJECT: StoryProject = {
  name: "The little things", script: DEMO_SCRIPT,
  images: ["/images/village-story.jpg", "/images/village-garden.jpg", "/images/village-sunset.jpg"],
  imageNames: ["village_illustration.jpg", "a_little_patience.jpg", "the_way_home.jpg"],
  audioUrl: "/audio/the-little-things.mp3", audioName: "the_little_things.mp3", duration: 84,
  words: [], timingSource: "estimated" as const, settings: { ...DEFAULT_SETTINGS }, mode: "storybook" as const,
};

export function paragraphs(script: string) { return script.trim().split(/\n\s*\n/).map(s => s.trim()).filter(Boolean); }
export function formatTime(seconds: number) { const s = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; }
export function estimateWords(script: string, duration: number): WordTiming[] {
  const tokens = script.trim().split(/\s+/).filter(Boolean);
  const weights = tokens.map(w => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length) + (/[.!?”]$/.test(w) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  return tokens.map((word, i) => { const start = cursor; cursor += weights[i] / total * duration; return { word, start, end: cursor }; });
}
const normal = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function alignedWords(project: StoryProject) {
  const tokens = project.script.trim().split(/\s+/).filter(Boolean);
  if (project.words.length === tokens.length && project.words.every((w, i) => normal(w.word) === normal(tokens[i]))) return project.words.map((w, i) => ({ ...w, word: tokens[i] }));
  return estimateWords(project.script, project.duration);
}
export function getScenes(project: StoryProject): Scene[] {
  const all = alignedWords(project); let cursor = 0;
  const titles = ["A chance encounter", "A little perspective", "The things that matter"];
  return paragraphs(project.script).map((text, i) => {
    const count = text.split(/\s+/).length; const words = all.slice(cursor, cursor + count); cursor += count;
    return { text, title: project.script === DEMO_SCRIPT ? titles[i] || `A new chapter` : text.split(/\s+/).slice(0, 4).join(" ").replace(/[.,!?”]$/, ""), image: project.images[i] || project.images[0] || DEFAULT_PROJECT.images[0], start: i === 0 ? 0 : words[0]?.start || 0, end: words.at(-1)?.end || project.duration, words };
  });
}

export function parseTimingFile(raw: string, filename: string): { words: WordTiming[]; precise: boolean } {
  let result: WordTiming[] = []; let precise = true;
  if (filename.toLowerCase().endsWith(".srt")) {
    precise = false;
    const stamp = (s: string) => { const [h, m, sec] = s.replace(",", ".").split(":").map(Number); return h * 3600 + m * 60 + sec; };
    for (const block of raw.replace(/\r/g, "").trim().split(/\n\s*\n/)) {
      const match = block.match(/(\d+:\d{2}:\d{2}[,.]\d+)\s*-->\s*(\d+:\d{2}:\d{2}[,.]\d+)[^\n]*\n([\s\S]+)/);
      if (match) { const start = stamp(match[1]); const end = stamp(match[2]); result.push(...estimateWords(match[3].replace(/<[^>]+>/g, ""), end - start).map(w => ({ ...w, start: w.start + start, end: w.end + start }))); }
    }
  } else {
    const json = JSON.parse(raw);
    if (["estimated", "srt-interpolated"].includes(json.timing_source || json.source)) precise = false;
    const list = Array.isArray(json) ? json : json.words || json.segments?.flatMap((s: { words?: WordTiming[] }) => s.words || []);
    if (!Array.isArray(list)) throw new Error("Use Whisper JSON with a words array, or an SRT file.");
    result = list.map((w: { word?: string; text?: string; start: number; end: number }) => ({ word: String(w.word || w.text || "").trim(), start: Number(w.start), end: Number(w.end) }));
  }
  if (!result.length || result.some((w, i) => !w.word || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end <= w.start || (i > 0 && w.start < result[i - 1].end - .03))) throw new Error("Timestamps must contain ordered, non-overlapping words with valid start and end times.");
  return { words: result, precise };
}

export function validateProject(value: unknown): StoryProject {
  if (!value || typeof value !== "object") throw new Error("Invalid project.");
  const p = value as StoryProject;
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 160) throw new Error("Give your project a name (up to 160 characters).");
  if (typeof p.script !== "string" || !p.script.trim() || p.script.length > 20000) throw new Error("Add a story of up to 20,000 characters.");
  if (!Array.isArray(p.images) || !Array.isArray(p.imageNames) || p.images.length > 100 || p.images.some(s => typeof s !== "string" || !/^\/(images\/[\w.-]+|api\/media\/[\w.-]+)$/.test(s))) throw new Error("Invalid illustration source.");
  if (typeof p.audioUrl !== "string" || (p.audioUrl && !/^\/(audio\/[\w.-]+|api\/media\/[\w.-]+)$/.test(p.audioUrl))) throw new Error("Invalid audio source.");
  if (!Number.isFinite(p.duration) || p.duration < 1 || p.duration > 1800) throw new Error("Audio must be between 1 second and 30 minutes.");
  if (!Array.isArray(p.words) || p.words.length > 10000 || p.words.some((w, i) => typeof w.word !== "string" || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end <= w.start || w.end > p.duration + .5 || (i > 0 && w.start < p.words[i - 1].end - .03))) throw new Error("Invalid word timestamps.");
  if (typeof p.audioName !== "string" || p.audioName.length > 200 || p.imageNames.some(name => typeof name !== "string" || name.length > 300)) throw new Error("Invalid media filename.");
  if (!["estimated", "word-level"].includes(p.timingSource)) throw new Error("Invalid timing source.");
  if (p.timingSource === "word-level") {
    const tokens = p.script.trim().split(/\s+/);
    if (p.words.length !== tokens.length || p.words.some((w, i) => normal(w.word) !== normal(tokens[i]))) throw new Error("Word timestamps must match your story. Import the matching transcript.");
  }
  if (!p.settings || [p.settings.highlight, p.settings.hand, p.settings.textPen].some(value => typeof value !== "boolean")) throw new Error("Invalid animation settings.");
  if (!p.settings || !["serif", "handwritten"].includes(p.settings.font) || !["ivory", "white", "warm"].includes(p.settings.paper) || !["curl", "fade", "none"].includes(p.settings.transition) || !Number.isFinite(p.settings.transitionDuration) || p.settings.transitionDuration < 1 || p.settings.transitionDuration > 1.5 || !Number.isFinite(p.settings.sketchSpeed) || p.settings.sketchSpeed < .5 || p.settings.sketchSpeed > 3 || !["classic", "night", "garden", "fairy"].includes(p.settings.theme)) throw new Error("Invalid appearance settings.");
  if (!["storybook", "whiteboard", "classic"].includes(p.mode)) throw new Error("Invalid video mode.");
  return { ...p, name: p.name.trim() };
}
