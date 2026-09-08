"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, Maximize2, Minimize2, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Plus, Check, BookOpen, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { StoryProject, getScenes, formatTime } from "@/lib/story";
import { prepareStory, renderStorybook } from "@/lib/canvas-storybook";

type Props = { project: StoryProject; time: number; playing: boolean; muted: boolean; onTogglePlay: () => void; onSeek: (time: number) => void; onMute: () => void; onAddPage: () => void; onError: (message: string) => void };
export default function StoryPreview({ project, time, playing, muted, onTogglePlay, onSeek, onMute, onAddPage, onError }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null); const stage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false); const [slow, setSlow] = useState(false); const [expanded, setExpanded] = useState(false);
  const scenes = getScenes(project);
  const active = Math.max(0, scenes.findIndex(s => time < s.end));
  const index = time >= (scenes.at(-1)?.end || 0) ? Math.max(0, scenes.length - 1) : active;
  const imageKey = project.images.join("|");
  useEffect(() => {
    let cancelled = false;
    setReady(false); setSlow(false);
    const slowTimer = setTimeout(() => { if (!cancelled) setSlow(true); }, 12000);
    prepareStory(project).then(() => { if (!cancelled) { clearTimeout(slowTimer); setReady(true); } }).catch(error => { if (!cancelled) { clearTimeout(slowTimer); setReady(true); onError(error.message); } });
    return () => { cancelled = true; clearTimeout(slowTimer); };
    // Artwork is cached; changing the story text does not require reloading it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey, project.settings.font]);
  useEffect(() => { if (ready && canvas.current) renderStorybook(canvas.current, project, time); }, [ready, project, time]);
  useEffect(() => { const change = () => setExpanded(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", change); return () => document.removeEventListener("fullscreenchange", change); }, []);
  const fullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); } catch { onError("Full-screen preview is unavailable in this browser."); } };
  return <div className="preview-pane" ref={stage}>
    <div className="preview-heading"><span><Eye size={14} /> LIVE PREVIEW</span><div><span className="resolution-badge">16:9 <i /> 1920 × 1080</span><button className="icon-button" aria-label={expanded ? "Exit full screen" : "Full-screen preview"} onClick={fullscreen}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div></div>
    <div className={`book-platform ${project.mode !== "storybook" ? "single-canvas" : ""}`}>
      <div className="storybook-frame">
        <canvas ref={canvas} width={1920} height={1080} aria-label={`Storybook page ${index + 1}: ${scenes[index]?.text || "Add your story"}`} />
        {!ready && <div className="preview-loading"><Loader2 className="spin" size={24} /><span>Opening your storybook…</span>{slow && <small style={{ opacity: .7 }}>Large illustrations can take a moment on the first open.</small>}</div>}
      </div>
      <div className="preview-caption"><span className="tiny-dot" /> Illustration and words, in perfect company.</div>
    </div>
    <div className="playback-controls">
      <div className="scrubber"><input type="range" min={0} max={project.duration} step={.05} value={Math.min(time, project.duration)} onChange={event => onSeek(Number(event.target.value))} aria-label="Story playback position" style={{ "--progress": `${time / project.duration * 100}%` } as React.CSSProperties} />{scenes.slice(1).map((s, i) => <span key={i} className="scene-tick" style={{ left: `${s.start / project.duration * 100}%` }} />)}</div>
      <div className="transport-row"><div className="transport-left"><button className="icon-button skip" aria-label="Previous page" onClick={() => onSeek(scenes[Math.max(0, index - 1)]?.start || 0)}><SkipBack size={16} /></button><button className="play-button" aria-label={playing ? "Pause story" : "Play story"} onClick={onTogglePlay}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button className="icon-button skip" aria-label="Next page" onClick={() => onSeek(scenes[Math.min(scenes.length - 1, index + 1)]?.start || 0)}><SkipForward size={16} /></button><span className="timecode">{formatTime(time)} <span>/ {formatTime(project.duration)}</span></span></div><div className="transport-right"><span>Page {index + 1} <span>of {scenes.length || 1}</span></span><button className="icon-button" onClick={onMute} aria-label={muted ? "Unmute narration" : "Mute narration"}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button></div></div>
    </div>
    <div className="scene-strip"><div className="scene-strip-label"><span><BookOpen size={13} /> Your story, page by page <b>{scenes.length}</b></span><div><button className="icon-button" aria-label="Scroll pages left" onClick={e => e.currentTarget.closest(".scene-strip")?.querySelector(".scene-cards")?.scrollBy({ left: -220, behavior: "smooth" })}><ChevronLeft size={13} /></button><button className="icon-button" aria-label="Scroll pages right" onClick={e => e.currentTarget.closest(".scene-strip")?.querySelector(".scene-cards")?.scrollBy({ left: 220, behavior: "smooth" })}><ChevronRight size={13} /></button></div></div>
      <div className="scene-cards">{scenes.map((scene, i) => <button key={i} className={`scene-card ${i === index ? "selected" : ""}`} onClick={() => onSeek(scene.start + .02)} aria-label={`Go to page ${i + 1}: ${scene.title}`} aria-current={i === index ? "page" : undefined}><div className="mini-book"><img src={scene.image} alt="" /><div><i /><i /><i /><i /><i /></div><span>{String(i + 1).padStart(2, "0")}</span></div><div className="scene-card-copy"><strong>{scene.title}</strong><span>{formatTime(scene.end - scene.start)}</span></div>{i === index && <span className="scene-selected"><Check size={9} /></span>}</button>)}<button className="add-page" onClick={onAddPage} aria-label="Add a storybook page"><Plus size={19} /></button></div>
    </div>
    <div className="preview-status"><span><span className="tiny-dot" /> {project.timingSource === "word-level" ? "Word-level audio sync is ready" : "Auto-timed · import timestamps for precise sync"}</span><span>1080p <i /> 30 FPS</span></div>
  </div>;
}
