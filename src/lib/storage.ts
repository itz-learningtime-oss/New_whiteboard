import path from "node:path";
import { mkdir } from "node:fs/promises";
export const MEDIA_DIR = path.join(process.cwd(), ".data", "media");
export const RENDER_DIR = path.join(process.cwd(), ".data", "renders");
export async function prepareStorage() { await Promise.all([mkdir(MEDIA_DIR, { recursive: true }), mkdir(RENDER_DIR, { recursive: true })]); }
export function localAsset(url: string): string {
  if (/^\/api\/media\/[a-f0-9-]+\.(png|jpg|webp|mp3|wav|ogg|m4a|webm)$/.test(url)) return path.join(MEDIA_DIR, path.basename(url));
  if (/^\/(images|audio)\/[\w-]+\.(jpg|png|mp3|wav)$/.test(url)) return path.join(process.cwd(), "public", url);
  throw new Error("Unrecognized asset. Upload the file again.");
}
