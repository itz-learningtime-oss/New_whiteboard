"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Download, Package, MonitorPlay, Check, ArrowRight, Loader2, CheckCircle2, AlertCircle, Sparkles, BookOpen, Volume2, Clock3 } from "lucide-react";
import Modal from "./Modal";
import { StoryProject, formatTime, paragraphs, validateProject } from "@/lib/story";
import { recordStorybook } from "@/lib/canvas-storybook";

export default function ExportModal({ project, onClose }: { project: StoryProject; onClose: () => void }) {
  const [format, setFormat] = useState<"mp4" | "webm" | "kit">(project.mode === "storybook" ? "mp4" : "webm");
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState(""); const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const controller = useRef<AbortController | null>(null); const job = useRef<string | null>(null); const resultUrl = useRef<string | null>(null);
  const filename = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-storybook";
  const cancel = useCallback(async () => { controller.current?.abort(); if (job.current) { await fetch(`/api/render/${job.current}`, { method: "DELETE" }).catch(() => {}); job.current = null; } setBusy(false); }, []);
  useEffect(() => () => { controller.current?.abort(); if (resultUrl.current?.startsWith("blob:")) URL.revokeObjectURL(resultUrl.current); if (job.current) void fetch(`/api/render/${job.current}`, { method: "DELETE" }); }, []);
  const download = (url: string, name: string) => { const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); };
  const readApi = async (response: Response) => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error(`Server error (HTTP ${response.status}). The app server may need a restart.`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error && typeof data.error === "string" ? data.error : `Request failed (HTTP ${response.status}).`);
    return data;
  };
  const startExport = async () => {
    setError(""); setResult(null); setProgress(0); const abort = new AbortController(); controller.current = abort;
    try {
      validateProject(project);
      if (!project.script.trim()) throw new Error("Add your story before exporting.");
      if (format !== "webm" && !project.audioUrl) throw new Error("Add your narration before exporting, or choose a silent browser video.");
      setBusy(true); let url: string, name: string;
      if (format === "webm") {
        const blob = await recordStorybook(project, setProgress, abort.signal); url = URL.createObjectURL(blob); name = `${filename}.webm`;
      } else if (format === "kit") {
        const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(project), signal: abort.signal });
        if (!response.ok) { await readApi(response); throw new Error("Export failed."); }
        const blob = await response.blob(); url = URL.createObjectURL(blob); name = `${filename}-render-kit.zip`;
      } else {
        const response = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(project), signal: abort.signal });
        const data = await readApi(response); job.current = data.id;
        const started = Date.now(); let output: string | undefined;
        while (!abort.signal.aborted && Date.now() - started < 16 * 60 * 1000) {
          await new Promise<void>((resolve, reject) => { const onAbort = () => { clearTimeout(timer); reject(new DOMException("Export cancelled", "AbortError")); }; const timer = setTimeout(() => { abort.signal.removeEventListener("abort", onAbort); resolve(); }, 1200); abort.signal.addEventListener("abort", onAbort, { once: true }); });
          const statusResponse = await fetch(`/api/render/${data.id}`, { signal: abort.signal }); const status = await readApi(statusResponse);
          setProgress(status.progress / 100);
          if (status.status === "complete") { output = status.url; job.current = null; break; }
          if (["failed", "cancelled"].includes(status.status)) { job.current = null; throw new Error(status.error || "The render did not complete."); }
        }
        if (!output) throw new Error("The render timed out. Try the downloadable Python kit.");
        url = output; name = `${filename}.mp4`;
      }
      if (abort.signal.aborted) return;
      resultUrl.current = url; setResult({ url, filename: name }); setProgress(1); setBusy(false); download(url, name);
    } catch (err) { setBusy(false); if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
  };
  const formats = [
    { id: "mp4" as const, icon: Film, title: "Full HD video", extension: "MP4", description: "Beautiful, share-ready H.264 video with your narration.", detail: project.mode === "classic" ? "Classic uses browser export" : "Up to 14 min · 100 pages · 1920 × 1080 · 30 FPS", disabled: project.mode === "classic" },
    { id: "webm" as const, icon: MonitorPlay, title: "Browser video", extension: "WEBM", description: "Record your story right here. Keep this tab open.", detail: `Real-time export · about ${formatTime(project.duration)}`, disabled: false },
    { id: "kit" as const, icon: Package, title: "The complete render kit", extension: "ZIP", description: "Your media, timestamps, and Python engine. Ready to render offline.", detail: project.mode === "classic" ? "For storybook and whiteboard modes · use browser export for classic" : "Python + FFmpeg · all source included", disabled: project.mode === "classic" },
  ];
  return <Modal title={result ? "Your story is ready for the world." : "A little story, ready to share."} subtitle={result ? "Every page, every word, every little moment. All yours." : "Choose how you’d like to bring your storybook with you."} onClose={onClose} locked={busy}>
    <div className="modal-body export-modal-body">
      <div className="export-story-summary"><img src={project.images[0]} alt="Your story’s cover illustration" /><div><strong>{project.name}</strong><span><BookOpen size={12} /> {paragraphs(project.script).length} pages <i /><Clock3 size={12} /> {formatTime(project.duration)}</span></div><span className="export-summary-badge">16:9</span></div>
      {result ? <div className="export-success"><span><CheckCircle2 size={34} strokeWidth={1.5} /></span><h3>Made with your voice.<br />Ready to make someone’s day.</h3><p>Your download has started. If you need another copy, it’s right here.</p><button className="button primary" onClick={() => download(result.url, result.filename)}><Download size={16} /> Download again</button><button className="text-button" onClick={onClose}>Back to your story <ArrowRight size={14} /></button></div> : <>
        <div className="export-formats">{formats.map(item => <button key={item.id} disabled={busy || item.disabled} className={`export-format ${format === item.id ? "selected" : ""}`} onClick={() => { setFormat(item.id); setError(""); }}><span className="export-format-icon"><item.icon size={21} strokeWidth={1.5} /></span><div><strong>{item.title} <b>{item.extension}</b></strong><p>{item.description}</p><small>{item.detail}</small></div><span className="radio-circle">{format === item.id && <span />}</span></button>)}</div>
        {project.timingSource !== "word-level" && <div className="export-timing-note"><Clock3 size={14} /><span>This story uses estimated word timing. Import Whisper word timestamps in the editor for precise synchronization.</span></div>}
        {error && <div className="export-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
        {busy ? <div className="export-progress"><div><span><Loader2 className="spin" size={16} />{format === "kit" ? "Gathering every little detail…" : "Bringing your pages to life…"}</span>{format !== "kit" && <strong>{Math.round(progress * 100)}%</strong>}</div><div className={`export-progress-track ${format === "kit" ? "indeterminate" : ""}`}><span style={{ width: `${format === "kit" ? 40 : progress * 100}%` }} /></div><p>{format === "webm" ? "Keep this tab visible while your story records, including its audio." : format === "mp4" ? "Rendering at full 1920 × 1080 resolution and verifying the audio." : "Packing the illustrations, audio, fonts, and complete rendering engine."}</p><button className="text-button" onClick={() => void cancel()}>Cancel export</button></div> : <div className="export-bottom"><span><ShieldIcon /> Your story. No watermark.</span><button className="button primary" onClick={() => void startExport()}><Download size={16} />{format === "kit" ? "Download render kit" : "Create my video"}<ArrowRight size={14} /></button></div>}
      </>}
    </div>
  </Modal>;
}
function ShieldIcon() { return <Check size={13} />; }
