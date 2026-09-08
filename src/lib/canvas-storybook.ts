import { StoryProject, Scene, getScenes } from "./story";

const W = 1920, H = 1080;
const PAPER = { ivory: "#f8f5eb", white: "#fdfcf9", warm: "#eee3ce" };
const THEMES: Record<string, { accent: string; glow: string; shadow: string; ink: string; scriptBorder: string }> = {
  classic: { accent: "#a8b997", glow: "#e9dabc", shadow: "#d9d1b8", ink: "#3f4437", scriptBorder: "#dfdccf" },
  night: { accent: "#6b82a8", glow: "#2a3650", shadow: "#283550", ink: "#c7d2e2", scriptBorder: "#333f56" },
  garden: { accent: "#9dbd7c", glow: "#f4f8e4", shadow: "#d4dfc0", ink: "#4a5e38", scriptBorder: "#c9d7b8" },
  fairy: { accent: "#c4a1d6", glow: "#f0e4fa", shadow: "#dccae8", ink: "#5c3d6e", scriptBorder: "#e0d4ea" },
};
type Point = { x: number; y: number };
type Artwork = { image: HTMLImageElement; paths: Point[][]; total: number };
const artworks = new Map<string, Artwork>();
const loading = new Map<string, Promise<void>>();
let marker: HTMLImageElement | undefined;

function traceImage(image: HTMLImageElement): Artwork {
  const canvas = document.createElement("canvas");
  const scale = Math.min(280 / image.naturalWidth, 320 / image.naturalHeight);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height); const width = canvas.width, height = canvas.height;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114;
  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const gx = -gray[i - width - 1] + gray[i - width + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + width - 1] + gray[i + width + 1];
    const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
    if (Math.abs(gx) + Math.abs(gy) > 145) edges[i] = 1;
  }
  const paths: Point[][] = []; let total = 0;
  const directions = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    if (!edges[y * width + x]) continue;
    const path: Point[] = []; let px = x, py = y;
    while (edges[py * width + px] && path.length < 300) {
      edges[py * width + px] = 0; path.push({ x: px / width, y: py / height });
      const neighbor = directions.find(([dx, dy]) => px + dx > 0 && px + dx < width - 1 && py + dy > 0 && py + dy < height - 1 && edges[(py + dy) * width + px + dx]);
      if (!neighbor) break; px += neighbor[0]; py += neighbor[1];
    }
    if (path.length > 3) { paths.push(path); total += path.length; }
  }
  return { image, paths, total };
}

export async function loadArtwork(url: string) {
  if (artworks.has(url)) return;
  if (loading.has(url)) return loading.get(url);
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("This illustration took too long to load.")), 15000);
    const image = new Image();
    image.onload = () => { clearTimeout(timer); try { artworks.set(url, traceImage(image)); resolve(); } catch (error) { reject(error); } };
    image.onerror = () => { clearTimeout(timer); reject(new Error("This illustration could not be loaded.")); };
    image.src = url;
  });
  loading.set(url, promise);
  try { await promise; } finally { loading.delete(url); }
}

/** A gentle paper placeholder so one missing file never blocks the whole book. */
async function ensurePlaceholder(url: string) {
  if (artworks.has(url)) return;
  const canvas = document.createElement("canvas"); canvas.width = 280; canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f1ead9"; ctx.fillRect(0, 0, 280, 320);
  ctx.strokeStyle = "#c9bfa8"; ctx.lineWidth = 3; ctx.strokeRect(14, 14, 252, 292);
  ctx.fillStyle = "#a08c5f"; ctx.font = "44px Georgia"; ctx.textAlign = "center";
  ctx.fillText("✧", 140, 130);
  ctx.fillStyle = "#8a7f63"; ctx.font = "17px Georgia";
  ctx.fillText("illustration", 140, 175); ctx.fillText("on its way", 140, 200);
  const image = new Image();
  image.src = canvas.toDataURL("image/png");
  try { await image.decode(); } catch { /* A blank placeholder is still better than a stuck book. */ }
  artworks.set(url, { image, paths: [], total: 0 });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out.")), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

export async function prepareStory(project: StoryProject) {
  const urls = [...new Set(getScenes(project).map(s => s.image))];
  // One broken illustration must never wedge the preview: fall back to a placeholder.
  await Promise.all(urls.map(async url => {
    try { await withTimeout(loadArtwork(url), 15000); }
    catch { await ensurePlaceholder(url); }
  }));
  try {
    await withTimeout(Promise.all([document.fonts.load("400 44px Lora"), document.fonts.load("400 52px Caveat")]), 8000);
  } catch { /* System serif/handwriting fallbacks keep the story readable. */ }
  if (!marker) await new Promise<void>(resolve => { const img = new Image(); const done = () => resolve(); const timer = setTimeout(done, 8000); img.onload = () => { marker = img; clearTimeout(timer); resolve(); }; img.onerror = () => { clearTimeout(timer); resolve(); }; img.src = "/images/hand_marker.png"; });
}
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill?: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.8; ctx.stroke(); }
}
function drawBackground(ctx: CanvasRenderingContext2D, paper: string, theme?: string) {
  const themeColors = THEMES[theme || "classic"];
  ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
  for (const inset of [10, 19, 28]) rounded(ctx, inset, inset, W - 2 * inset, H - 2 * inset, 45 - inset / 3, undefined, theme ? themeColors.shadow : "#d4d0c4");
  rounded(ctx, 49, 31, 891, 1018, 25, undefined, themeColors.scriptBorder); rounded(ctx, 980, 31, 891, 1018, 25, undefined, themeColors.scriptBorder);
  ctx.fillStyle = theme ? `${themeColors.ink}0d` : "rgba(100,85,55,.055)";
  for (let i = 0; i < 5200; i++) { const x = (i * 197 + 13) % W; const y = (i * 139 + 31) % H; ctx.fillRect(x, y, 1.4, 1.4); }
}
function drawArt(ctx: CanvasRenderingContext2D, scene: Scene, project: StoryProject, time: number, full = false) {
  const tc = THEMES[project.settings.theme || "classic"];
  const art = artworks.get(scene.image); if (!art) return;
  const { image, paths, total } = art;
  const zone = full ? { x: 60, y: 40, w: 1800, h: 1000 } : { x: 60, y: 40, w: 870, h: 1000 };
  const scale = Math.min(zone.w / image.naturalWidth, zone.h / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale, x = zone.x + (zone.w - w) / 2, y = zone.y + (zone.h - h) / 2;
  const p = project.mode === "classic" ? 1 : Math.min(1, Math.max(0, (time - scene.start) / Math.max(.01, scene.end - scene.start) * project.settings.sketchSpeed));
  ctx.save(); ctx.beginPath(); ctx.rect(zone.x, zone.y, zone.w, zone.h); ctx.clip();
  ctx.globalAlpha = .08; ctx.drawImage(image, x, y, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = tc.ink; ctx.lineWidth = 1.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
  let budget = total * Math.min(1, p / .52), tip: Point | undefined;
  if (p < .9) for (const path of paths) {
    if (budget <= 0) break;
    ctx.beginPath();
    const count = Math.min(path.length, Math.ceil(budget));
    for (let i = 0; i < count; i++) { const point = path[i]; if (!i) ctx.moveTo(x + point.x * w, y + point.y * h); else ctx.lineTo(x + point.x * w, y + point.y * h); tip = { x: x + point.x * w, y: y + point.y * h }; }
    ctx.stroke(); budget -= path.length;
  }
  ctx.globalAlpha = Math.min(1, Math.max(0, (p - .22) / .56)); ctx.drawImage(image, x, y, w, h); ctx.globalAlpha = 1;
  if (project.settings.hand && marker && tip && p > 0 && p < .7) { const mw = 195, mh = mw * marker.naturalHeight / marker.naturalWidth; ctx.drawImage(marker, tip.x - mw * .279, tip.y - mh * .278, mw, mh); }
  ctx.restore();
}
function textLayout(ctx: CanvasRenderingContext2D, scene: Scene, project: StoryProject) {
  const handwritten = project.settings.font === "handwritten";
  let size = handwritten ? 56 : 44;
  let positions: { word: Scene["words"][number]; x: number; y: number; width: number }[] = [];
  for (; size >= 22; size -= 2) {
    ctx.font = `400 ${size}px ${handwritten ? "Caveat" : "Lora"}`;
    const leading = size * (handwritten ? 1.35 : 1.63), space = ctx.measureText(" ").width;
    let x = 1066, y = 214; positions = [];
    for (const word of scene.words) {
      const width = ctx.measureText(word.word).width;
      if (x + width > 1786 && x > 1066) { x = 1066; y += leading; }
      positions.push({ word, x, y, width }); x += width + space;
    }
    if (y + leading < 958) break;
  }
  return { size, positions };
}
function drawSpread(ctx: CanvasRenderingContext2D, project: StoryProject, scene: Scene, index: number, time: number, ghost: boolean) {
  const paper = PAPER[project.settings.paper]; const tc = THEMES[project.settings.theme || "classic"];
  drawBackground(ctx, paper, project.settings.theme);
  drawArt(ctx, scene, project, time, project.mode !== "storybook");
  if (project.mode !== "storybook") {
    if (project.mode === "classic") { const current = scene.words.filter(w => w.start <= time).slice(-10).map(w => w.word).join(" "); ctx.font = "38px Lora"; ctx.textAlign = "center"; rounded(ctx, 260, 903, 1400, 95, 15, "rgba(35,43,34,.85)"); ctx.fillStyle = "#fff"; ctx.fillText(current, 960, 964, 1300); ctx.textAlign = "left"; }
    return;
  }
  // Gutter shadow stays outside both drawing viewports.
  const gutter = ctx.createLinearGradient(920, 0, 1000, 0); gutter.addColorStop(0, "rgba(60,52,35,0)"); gutter.addColorStop(.48, "rgba(60,52,35,.18)"); gutter.addColorStop(.55, "rgba(60,52,35,.23)"); gutter.addColorStop(1, "rgba(60,52,35,0)"); ctx.fillStyle = gutter; ctx.fillRect(920, 28, 80, 1024);
  ctx.save(); ctx.beginPath(); ctx.rect(990, 40, 870, 1000); ctx.clip(); ctx.textBaseline = "top";
  ctx.fillStyle = tc.ink; ctx.font = "21px Lora"; ctx.textAlign = "right"; ctx.globalAlpha = .5;
  const label = "I T Z  L E A R N I N G  T I M E"; ctx.fillText(label, 1790, 114); ctx.textAlign = "left"; ctx.globalAlpha = 1;
  const { size, positions } = textLayout(ctx, scene, project);
  for (const item of positions) {
    const { word, x, y, width } = item; const spoken = time >= word.start, active = spoken && time < word.end;
    if (!spoken && !ghost) continue;
    if (active && project.settings.highlight) { rounded(ctx, x - 5, y - 3, width + 10, size + 14, 5, tc.glow); ctx.fillStyle = tc.accent; ctx.fillRect(x, y + size + 6, width, 1.5); }
    ctx.fillStyle = spoken ? tc.ink : `${tc.ink}88`;
    // Optional text shadow for depth
    if (project.settings.textShadow && active) { ctx.shadowColor = tc.shadow; ctx.shadowBlur = 6; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1; }
    ctx.fillText(word.word, x, y);
    if (project.settings.textShadow) { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
    // Glow effect on active word
    if (active && project.settings.glow) { ctx.save(); ctx.globalAlpha = .25; ctx.shadowColor = tc.glow; ctx.shadowBlur = 12; ctx.fillText(word.word, x, y); ctx.restore(); }
    if (active && project.settings.textPen) { const fraction = Math.min(1, (time - word.start) / Math.max(.01, word.end - word.start)); const px = x + width * fraction; ctx.strokeStyle = tc.accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(px, y + size + 10); ctx.lineTo(px + 23, y + size - 22); ctx.stroke(); }
  }
  ctx.font = "italic 26px Lora"; ctx.fillStyle = `${tc.ink}88`; ctx.textAlign = "right"; ctx.fillText(String(index + 1), 1795, 980); ctx.restore();
}
export function renderStorybook(canvas: HTMLCanvasElement, project: StoryProject, time: number, options: { ghost?: boolean; transitions?: boolean } = {}) {
  const ctx = canvas.getContext("2d")!; const scenes = getScenes(project); if (!scenes.length) { drawBackground(ctx, PAPER[project.settings.paper]); return; }
  const index = Math.max(0, scenes.findIndex(s => time < s.end)); const i = time >= scenes.at(-1)!.end ? scenes.length - 1 : index; const scene = scenes[i];
  ctx.clearRect(0, 0, W, H); drawSpread(ctx, project, scene, i, time, options.ghost ?? true);
  const boundary = i > 0 ? scenes[i - 1].end : 0;
  if (i > 0 && options.transitions !== false && project.settings.transition !== "none" && time < boundary + project.settings.transitionDuration) {
    const p = Math.max(0, Math.min(1, (time - boundary) / project.settings.transitionDuration));
    const old = document.createElement("canvas"); old.width = W; old.height = H; drawSpread(old.getContext("2d")!, project, scenes[i - 1], i - 1, boundary, options.ghost ?? true);
    if (project.settings.transition === "fade") { ctx.globalAlpha = 1 - p; ctx.drawImage(old, 0, 0); ctx.globalAlpha = 1; }
    else {
      const eased = p * p * (3 - 2 * p), edge = Math.round(W * (1 - eased));
      if (edge > 0) ctx.drawImage(old, 0, 0, edge, H, 0, 0, edge, H);
      const curlWidth = W * .09 * Math.sin(Math.PI * p);
      const fold = ctx.createLinearGradient(edge, 0, edge + Math.max(1, curlWidth), 0); fold.addColorStop(0, "#d7d0bd"); fold.addColorStop(.5, "#fbf8ef"); fold.addColorStop(1, "#e9e3d5"); ctx.fillStyle = fold; ctx.fillRect(edge, 24, curlWidth, H - 48);
      const shadow = ctx.createLinearGradient(edge + curlWidth, 0, edge + curlWidth + 45, 0); shadow.addColorStop(0, "rgba(47,38,23,.16)"); shadow.addColorStop(1, "transparent"); ctx.fillStyle = shadow; ctx.fillRect(edge + curlWidth, 24, 45, H - 48);
    }
  }
}

export async function recordStorybook(project: StoryProject, onProgress: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
  if (!window.MediaRecorder) throw new Error("Your browser does not support video recording. Choose the Python render kit instead.");
  await prepareStory(project);
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  renderStorybook(canvas, project, 0, { ghost: false });
  const stream = canvas.captureStream(30); let context: AudioContext | undefined; let source: AudioBufferSourceNode | undefined;
  if (project.audioUrl) {
    context = new AudioContext(); await context.resume();
    try { const response = await fetch(project.audioUrl); if (!response.ok) throw new Error("Audio is unavailable."); const buffer = await context.decodeAudioData(await response.arrayBuffer()); source = context.createBufferSource(); source.buffer = buffer; const dest = context.createMediaStreamDestination(); source.connect(dest); dest.stream.getAudioTracks().forEach(track => stream.addTrack(track)); }
    catch (error) { await context.close(); stream.getTracks().forEach(t => t.stop()); throw error; }
  }
  const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) { await context?.close(); throw new Error("WebM recording is unavailable. Choose MP4 or the Python kit."); }
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 }); const chunks: BlobPart[] = []; let frame = 0; let cancelled = false; let failure: Error | undefined;
    const cleanup = () => { cancelAnimationFrame(frame); try { source?.stop(); } catch { /* The source may not have started if export was cancelled during setup. */ } stream.getTracks().forEach(t => t.stop()); if (context && context.state !== "closed") void context.close(); signal?.removeEventListener("abort", abort); };
    const abort = () => { cancelled = true; if (recorder.state !== "inactive") recorder.stop(); else { cleanup(); reject(new Error("Export cancelled.")); } };
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { cleanup(); if (cancelled || failure) reject(failure || new Error("Export cancelled.")); else resolve(new Blob(chunks, { type: "video/webm" })); };
    recorder.onerror = () => { failure = new Error("The browser could not encode the video."); if (recorder.state !== "inactive") recorder.stop(); else { cleanup(); reject(failure); } };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    recorder.start(1000); const started = performance.now(); const audioStarted = context?.currentTime || 0; source?.start();
    const tick = () => {
      const elapsed = context ? context.currentTime - audioStarted : (performance.now() - started) / 1000;
      renderStorybook(canvas, project, Math.min(project.duration, elapsed), { ghost: false }); onProgress(Math.min(1, elapsed / project.duration));
      if (elapsed >= project.duration) { recorder.stop(); return; } frame = requestAnimationFrame(tick);
    }; frame = requestAnimationFrame(tick);
  });
}
