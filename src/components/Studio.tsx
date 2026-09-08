"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { BookOpen, Plus, FolderOpen, Images, Mic2, Film, FileText, Sparkles, ArrowUpRight, ArrowRight, ChevronRight, ChevronDown, Check, CheckCheck, Cloud, Download, Upload, ImagePlus, AudioLines, Pencil, RotateCcw, Trash2, HelpCircle, Play, X, Loader2, Clock3, WandSparkles, Search, PanelLeft, Settings2, Leaf, Headphones, FileUp, MoveRight, Save, CheckCircle2, AlertCircle, SlidersHorizontal, MoreHorizontal, CirclePlay, Volume2, LayoutGrid, PenTool, ShieldCheck } from "lucide-react";
import { DEFAULT_PROJECT, DEFAULT_SETTINGS, DEMO_SCRIPT, StoryProject, StorySettings, WordTiming, getScenes, paragraphs, formatTime, parseTimingFile, validateProject } from "@/lib/story";
import StoryPreview from "./StoryPreview";
import Modal from "./Modal";
import ExportModal from "./ExportModal";

type SavedProject = { id: string; name: string; content: StoryProject; updatedAt: string };
type MediaFile = { id: string; originalName: string; mimeType: string; size: number; url: string };
type ModalName = "help" | "media" | "audio" | "new" | "rename" | "export" | "delete" | "voice" | "diagnostics" | null;
const freshDemo = (): StoryProject => ({ ...DEFAULT_PROJECT, images: [...DEFAULT_PROJECT.images], imageNames: [...DEFAULT_PROJECT.imageNames], settings: { ...DEFAULT_SETTINGS }, words: [] });

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description?: string }) {
  return <div className="toggle-row"><div><span>{label}</span>{description && <small>{description}</small>}</div><button className={`toggle ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span /></button></div>;
}

export default function Studio() {
  const [project, setProject] = useState<StoryProject>(freshDemo);
  const projectRef = useRef(project);
  const [view, setView] = useState<"studio" | "projects">("studio");
  const [modal, setModal] = useState<ModalName>(null);
  const [tab, setTab] = useState<"content" | "appearance">("content");
  const [time, setTime] = useState(14);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"draft" | "dirty" | "saving" | "saved" | "error">("draft");
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [uploading, setUploading] = useState<"image" | "audio" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [useTemplate, setUseTemplate] = useState(true);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedProject | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false); const [ttsVoice, setTtsVoice] = useState("neerja"); const [ttsPreview, setTtsPreview] = useState<{ playing: boolean; voice: string }>({ playing: false, voice: "" }); const [diagResults, setDiagResults] = useState<Record<string, { ok: boolean; detail?: string }> | null>(null); const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const timingInput = useRef<HTMLInputElement>(null);
  const scenes = getScenes(project);
  const activeIndex = time >= (scenes.at(-1)?.end || 0) ? Math.max(0, scenes.length - 1) : Math.max(0, scenes.findIndex(s => time < s.end));
  const currentImage = scenes[activeIndex]?.image || project.images[0] || DEFAULT_PROJECT.images[0];
  const currentImageName = project.imageNames[activeIndex] || project.imageNames[0] || "Your illustration";
  const wordCount = project.script.trim().split(/\s+/).filter(Boolean).length;

  const notify = useCallback((message: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error }); toastTimer.current = setTimeout(() => setToast(null), error ? 6500 : 3800);
  }, []);
  const onPreviewError = useCallback((message: string) => notify(message, true), [notify]);
  const closeModal = useCallback(() => setModal(null), []);
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true); setProjectError("");
    try { const response = await fetch("/api/projects"); const data = await response.json(); if (!response.ok) throw new Error(data.error); setSavedProjects(data); }
    catch (error) { setProjectError(error instanceof Error ? error.message : "Unable to load projects."); }
    finally { setProjectsLoading(false); }
  }, []);
  const loadMedia = useCallback(async () => {
    setMediaLoading(true); setMediaError("");
    try { const response = await fetch("/api/media"); const data = await response.json(); if (!response.ok) throw new Error(data.error); setMediaFiles(data); }
    catch (error) { setMediaError(error instanceof Error ? error.message : "Unable to load media."); }
    finally { setMediaLoading(false); }
  }, []);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      try {
        const stored = localStorage.getItem("my-storybook-draft-v1");
        if (stored) { const draft = validateProject(JSON.parse(stored)); if (alive) { setProject(draft); setTime(Math.min(14, draft.duration * .4)); setSaveStatus(draft.id ? "saved" : "draft"); } }
        else { const response = await fetch("/audio/demo-timestamps.json"); if (response.ok) { const data = await response.json(); if (alive) setProject(p => ({ ...p, words: data.words, duration: data.duration, timingSource: "word-level" })); } }
      } catch { /* An unavailable draft never prevents opening the studio. */ }
      finally { if (alive) setInitialized(true); }
    };
    void initialize(); void loadProjects();
    return () => { alive = false; if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [loadProjects]);
  useEffect(() => { if (initialized) { try { localStorage.setItem("my-storybook-draft-v1", JSON.stringify(project)); } catch { /* PostgreSQL saving remains available when local storage is full. */ } } }, [project, initialized]);
  useEffect(() => { if (modal === "media" || modal === "audio") void loadMedia(); }, [modal, loadMedia]);
  useEffect(() => {
    const element = audio.current;
    if (element) element.muted = muted;
  }, [muted]);
  useEffect(() => {
    const element = audio.current;
    if (!playing) { element?.pause(); return; }
    if (project.audioUrl && element) {
      element.currentTime = Math.min(time, project.duration - .01);
      element.play().catch(() => { setPlaying(false); notify("The audio could not play. Try uploading the narration again.", true); });
      return () => element.pause();
    }
    const start = performance.now(), initialTime = time;
    const timer = window.setInterval(() => { const next = initialTime + (performance.now() - start) / 1000; if (next >= project.duration) { setTime(project.duration); setPlaying(false); } else setTime(next); }, 40);
    return () => clearInterval(timer);
    // Playback follows the audio element rather than restarting on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, project.audioUrl, project.duration, notify]);

  const update = useCallback((patch: Partial<StoryProject> | ((p: StoryProject) => StoryProject)) => {
    setProject(p => typeof patch === "function" ? patch(p) : { ...p, ...patch }); setSaveStatus("dirty");
  }, []);
  const setting = <K extends keyof StorySettings>(key: K, value: StorySettings[K]) => update(p => ({ ...p, settings: { ...p.settings, [key]: value } }));
  const generateTTS = async () => {
    if (ttsBusy) return; setTtsBusy(true);
    try {
      const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: project.script.trim(), voice: ttsVoice }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setPlaying(false); setTime(0);
      update({ audioUrl: data.audioUrl, audioName: `tts-${ttsVoice}.mp3`, words: data.words, duration: data.duration, timingSource: "word-level" });
      notify(`Voice generated! ${data.wordCount} words perfectly synchronized.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Voice generation failed.", true); }
    finally { setTtsBusy(false); }
  };
  const runDiagnostics = async () => {
    setDiagResults(null); openModal("diagnostics");
    try { const r = await fetch("/api/health"); const d = await r.json(); setDiagResults(d.checks); if (d.ok) notify("All systems healthy!"); else notify("Some checks need attention.", true); }
    catch { setDiagResults({ health: { ok: false, detail: "Health endpoint unreachable" } }); notify("Diagnostics failed.", true); }
  };
  const save = useCallback(async (quiet = false) => {
    if (saveStatus === "saving") return;
    const snapshot = project; setSaveStatus("saving");
    try {
      validateProject(snapshot);
      const response = await fetch(snapshot.id ? `/api/projects/${snapshot.id}` : "/api/projects", { method: snapshot.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const changed = JSON.stringify(projectRef.current) !== JSON.stringify(snapshot);
      setProject(p => ({ ...p, id: data.id })); setSaveStatus(changed ? "dirty" : "saved");
      void loadProjects(); if (!quiet) notify("Your story is saved. A little magic, safely kept.");
    } catch (error) { setSaveStatus("error"); notify(error instanceof Error ? error.message : "Unable to save your project.", true); }
  }, [project, saveStatus, loadProjects, notify]);
  useEffect(() => { if (project.id && saveStatus === "dirty") { const timer = setTimeout(() => void save(true), 2000); return () => clearTimeout(timer); } }, [project.id, saveStatus, save]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setNameInput(""); setUseTemplate(true); setPlaying(false); setModal("new"); }
      if (event.code === "Space" && !modal && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) { event.preventDefault(); setPlaying(v => !v); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [modal, save]);

  const seek = (next: number) => { const value = Math.max(0, Math.min(project.duration, next)); setTime(value); if (audio.current && project.audioUrl) audio.current.currentTime = value; };
  const togglePlay = () => { if (time >= project.duration - .05) seek(0); setPlaying(v => !v); };
  const openModal = (next: ModalName) => { setPlaying(false); setModal(next); setMobileMenu(false); };
  const selectMode = (mode: StoryProject["mode"]) => { update({ mode }); setView("studio"); setMobileMenu(false); };
  const changeScript = (script: string) => { setPlaying(false); update(p => ({ ...p, script, words: [], timingSource: "estimated", duration: p.audioUrl ? p.duration : Math.max(8, script.trim().split(/\s+/).length * .48) })); };
  const chooseImage = (url: string, name: string) => {
    update(p => { const images = [...p.images], imageNames = [...p.imageNames]; while (images.length <= activeIndex) { images.push(images[0] || DEFAULT_PROJECT.images[0]); imageNames.push(imageNames[0] || "Illustration"); } images[activeIndex] = url; imageNames[activeIndex] = name; return { ...p, images, imageNames }; });
    setModal(null); notify(`Illustration added to page ${activeIndex + 1}.`);
  };
  const chooseAudio = (url: string, name: string) => { setPlaying(false); setTime(0); update({ audioUrl: url, audioName: name, words: [], timingSource: "estimated" }); setModal(null); notify("Narration added. Import word timestamps for precise synchronization."); };
  const uploadFile = async (file: File, kind: "image" | "audio") => {
    if (uploading) return;
    setUploading(kind); setPlaying(false);
    try {
      if (kind === "image" && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP illustration.");
      if (kind === "audio" && !file.type.startsWith("audio/") && file.type !== "video/webm") throw new Error("Choose an audio file such as MP3 or WAV.");
      if (file.size > (kind === "image" ? 10 : 30) * 1024 * 1024) throw new Error(`Choose a file smaller than ${kind === "image" ? 10 : 30} MB.`);
      if (kind === "image") { const bitmap = await createImageBitmap(file); if (bitmap.width * bitmap.height > 30_000_000) { bitmap.close(); throw new Error("Resize your illustration to less than 30 megapixels."); } bitmap.close(); }
      if (kind === "audio") { const url = URL.createObjectURL(file); try { const probe = new Audio(url); const duration = await new Promise<number>((resolve, reject) => { probe.onloadedmetadata = () => resolve(probe.duration); probe.onerror = () => reject(new Error("This audio file cannot be decoded.")); }); if (!Number.isFinite(duration) || duration < 1 || duration > 600) throw new Error("Use a narration between 1 second and 10 minutes."); } finally { URL.revokeObjectURL(url); } }
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (kind === "image") chooseImage(data.url, file.name); else chooseAudio(data.url, file.name);
      void loadMedia();
    } catch (error) { notify(error instanceof Error ? error.message : "Upload failed. Please try again.", true); }
    finally { setUploading(null); if (imageInput.current) imageInput.current.value = ""; if (audioInput.current) audioInput.current.value = ""; }
  };
  const importText = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (file.size > 100_000) throw new Error("Use a story file smaller than 100 KB."); const text = await file.text(); if (!text.trim() || text.length > 20000) throw new Error("Add a story with 1–20,000 characters."); changeScript(text); setTime(0); notify("Story imported. Blank lines become new pages."); } catch (error) { notify((error as Error).message, true); }
    event.target.value = "";
  };
  const importTimings = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Choose a timestamp file smaller than 2 MB.");
      const parsed = parseTimingFile(await file.text(), file.name); const tokens = project.script.trim().split(/\s+/);
      const normal = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (parsed.words.length !== tokens.length || parsed.words.some((w, i) => normal(w.word) !== normal(tokens[i]))) throw new Error("These timestamps don’t match the story. Import the matching transcript first.");
      if (parsed.words.at(-1)!.end > project.duration + .1) throw new Error("These timestamps extend beyond your narration. Add the matching audio track first.");
      update({ words: parsed.words, timingSource: parsed.precise ? "word-level" : "estimated" }); notify(parsed.precise ? "Every word is now synchronized to your narration." : "SRT imported. Word timing is estimated within each subtitle cue.");
    } catch (error) { notify((error as Error).message, true); }
    event.target.value = "";
  };
  const addPage = () => {
    if (scenes.length >= 20) { notify("For the best experience, keep each project to 20 pages.", true); return; }
    const addition = "And so, a new chapter began. There were still so many wonderful things waiting to be discovered.";
    update(p => ({ ...p, script: `${p.script.trim()}\n\n${addition}`, images: [...p.images, p.images[0] || DEFAULT_PROJECT.images[0]], imageNames: [...p.imageNames, p.imageNames[0] || "Illustration"], words: [], timingSource: "estimated", duration: p.audioUrl ? p.duration : p.duration + 12 })); setPlaying(false); notify("A new page is ready. Edit its paragraph and add an illustration.");
  };
  const restoreDemo = async (name = DEFAULT_PROJECT.name) => {
    const demo = { ...freshDemo(), name };
    try { const response = await fetch("/audio/demo-timestamps.json"); if (response.ok) { const data = await response.json(); demo.words = data.words; demo.duration = data.duration; demo.timingSource = "word-level"; } } catch { /* Estimated demo timing is a safe fallback. */ }
    setProject(demo); setTime(14); setSaveStatus("draft"); setView("studio"); setPlaying(false); setModal(null);
  };
  const createProject = async () => {
    if (!nameInput.trim()) return;
    if (useTemplate) await restoreDemo(nameInput.trim());
    else { setProject({ ...freshDemo(), name: nameInput.trim(), script: "Once upon a time, a little idea grew into a wonderful story.", images: [DEFAULT_PROJECT.images[0]], imageNames: [DEFAULT_PROJECT.imageNames[0]], audioUrl: "", audioName: "", duration: 12, words: [], timingSource: "estimated" }); setTime(0); setSaveStatus("draft"); setView("studio"); setModal(null); }
    notify("Your new story is ready to make your own.");
  };
  const loadProject = (saved: SavedProject) => { setProject({ ...saved.content, id: saved.id }); setSaveStatus("saved"); setTime(Math.min(14, saved.content.duration * .4)); setPlaying(false); setView("studio"); notify(`Opened “${saved.name}”.`); };
  const deleteProject = async () => {
    if (!deleteTarget) return;
    try { const response = await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" }); if (!response.ok) { const data = await response.json(); throw new Error(data.error); } if (project.id === deleteTarget.id) { setProject(p => ({ ...p, id: undefined })); setSaveStatus("draft"); } setModal(null); setDeleteTarget(null); await loadProjects(); notify("Project deleted. Your uploaded media is still in the library."); } catch (error) { notify((error as Error).message, true); }
  };

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
      <a href="/" className="brand" aria-label="My Voice, My Story home"><span className="brand-symbol"><BookOpen size={33} strokeWidth={1.5} /><Sparkles size={12} /></span><span className="brand-wordmark">my voice,<br />my story<span>.</span></span></a>
      <button className="button primary new-project" onClick={() => { setNameInput(""); setUseTemplate(true); openModal("new"); }}><Plus size={17} /><span>New project</span><span className="shortcut">⌘ N</span></button>
      <div className="nav-section-label">MAKE SOMETHING WONDERFUL</div>
      <nav className="main-nav" aria-label="Studio navigation">
        <button title="Storybook studio" className={view === "studio" && project.mode === "storybook" ? "active" : ""} onClick={() => selectMode("storybook")}><BookOpen size={18} /><span>Storybook studio</span><b className="new-tag">NEW</b></button>
        <button title="Image to video" className={view === "studio" && project.mode === "whiteboard" ? "active" : ""} onClick={() => selectMode("whiteboard")}><ImagePlus size={18} /><span>Image to video</span></button>
        <button title="Script to video" className={view === "studio" && project.mode === "classic" ? "active" : ""} onClick={() => selectMode("classic")}><FileText size={18} /><span>Script to video</span></button>
      </nav>
      <div className="nav-section-label workspace-label">YOUR WORKSPACE</div>
      <nav className="main-nav" aria-label="Your workspace">
        <button title="My projects" className={view === "projects" ? "active" : ""} onClick={() => { setView("projects"); setPlaying(false); setMobileMenu(false); void loadProjects(); }}><FolderOpen size={18} /><span>My projects</span><b className="nav-count">{savedProjects.length}</b></button>
        <button title="Media library" onClick={() => openModal("media")}><Images size={18} /><span>Media library</span></button>
        <button title="Generate voice" onClick={() => openModal("voice")}><Mic2 size={18} /><span>Generate voice</span></button>
        <button title="Diagnostics" onClick={runDiagnostics}><Settings2 size={18} /><span>Diagnostics</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="inspiration-card"><div className="inspiration-art"><Leaf size={32} strokeWidth={1.1} /><Sparkles size={15} /></div><h3>A little inspiration?</h3><p>Your first story is just<br />a few small steps away.</p><button onClick={() => openModal("help")}>Let’s make a story <ArrowUpRight size={15} /></button></div><button className="help-link" onClick={() => openModal("help")}><HelpCircle size={17} /><span>Help & getting started</span><ArrowUpRight size={13} /></button><div className="workspace-profile"><span className="profile-avatar">YT</span><div><strong>Your creative space</strong><span>Personal workspace</span></div><ChevronDown size={13} /></div></div>
      <div className="sidebar-footnote">A little story. All yours.</div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(v => !v)}><PanelLeft size={20} /></button><button onClick={() => { setView("projects"); void loadProjects(); }}><LayoutGrid size={15} /><span>Workspace</span></button><ChevronRight size={13} /><span>{view === "projects" ? "My projects" : project.mode === "storybook" ? "Storybook studio" : project.mode === "whiteboard" ? "Image to video" : "Script to video"}</span></div><div className="topbar-right"><span className={`save-indicator ${saveStatus === "error" ? "is-error" : ""}`}>{saveStatus === "saving" ? <Loader2 size={14} className="spin" /> : saveStatus === "saved" ? <CheckCheck size={15} /> : <Cloud size={15} />}<span>{saveStatus === "saving" ? "Saving your story…" : saveStatus === "saved" ? "All changes saved" : saveStatus === "error" ? "Changes not saved" : saveStatus === "dirty" ? "Unsaved changes" : "Your draft, your possibilities"}</span></span><span className="topbar-divider" /><button className="icon-button" aria-label="Open studio guide" onClick={() => openModal("help")}><HelpCircle size={18} /></button><span className="topbar-avatar" title="Your personal workspace">Y</span></div></header>
      <main className="main-content">
        <div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> {view === "projects" ? "YOUR CREATIVE COLLECTION" : "A NEW WAY TO TELL YOUR STORY"}{view === "studio" && <Sparkles size={12} />}</div><h1>{view === "projects" ? "Little ideas. Wonderful stories." : project.mode === "storybook" ? <>Every story deserves a little <em>magic.</em></> : project.mode === "whiteboard" ? <>Your illustration, <em>brought to life.</em></> : <>Give your words a <em>world of their own.</em></>}</h1><p>{view === "projects" ? "Pick up where you left off, or begin something entirely new." : "Bring your illustrations, words, and voice together. One beautiful page at a time."}</p></div><button className="how-it-works" onClick={() => openModal("help")}><CirclePlay size={18} /> How it works <ArrowUpRight size={14} /></button></div>

        {view === "studio" ? <section className="editor-card" aria-label="Storybook editor">
          <div className="editor-toolbar"><div className="project-heading"><span className="project-icon"><BookOpen size={20} strokeWidth={1.5} /></span><div><button className="project-name" onClick={() => { setNameInput(project.name); openModal("rename"); }}>{project.name}<Pencil size={12} /></button><span className="project-subtitle">A story in the making <span>·</span> {scenes.length} pages</span></div></div><div className="editor-actions"><button className="button secondary save-button" onClick={() => void save()} disabled={saveStatus === "saving"}>{saveStatus === "saving" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}<span>Save project</span></button><button className="button primary export-button" onClick={() => openModal("export")}><Download size={16} /><span>Export video</span><ChevronDown size={13} /></button></div></div>
          <div className="editor-body">
            <div className="settings-pane"><div className="settings-tabs" role="tablist" aria-label="Editor settings"><button role="tab" aria-selected={tab === "content"} className={tab === "content" ? "active" : ""} onClick={() => setTab("content")}><FileText size={14} /> Your content</button><button role="tab" aria-selected={tab === "appearance"} className={tab === "appearance" ? "active" : ""} onClick={() => setTab("appearance")}><SlidersHorizontal size={14} /> Appearance</button></div>
              {tab === "content" ? <div className="settings-content">
                <section className="form-section illustration-section"><div className="field-heading"><label>Your illustration</label><span className="field-counter">Page {activeIndex + 1}</span></div><div className={`illustration-upload ${dragging ? "dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) void uploadFile(file, "image"); }}><img src={currentImage} alt={`Illustration for page ${activeIndex + 1}`} /><div className="illustration-file"><span className="file-type-label"><CheckCircle2 size={11} /> READY TO DRAW</span><strong title={currentImageName}>{currentImageName}</strong><button className="text-button" onClick={() => imageInput.current?.click()} disabled={!!uploading}>{uploading === "image" ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />}{uploading === "image" ? "Uploading…" : "Replace image"}</button></div><button className="image-library-button" title="Choose from media library" aria-label="Choose from media library" onClick={() => openModal("media")}><Images size={13} /></button></div><span className="field-hint">JPG, PNG or WebP <span>·</span> up to 10 MB</span></section>
                <section className="form-section story-section"><div className="field-heading"><label htmlFor="story-script">Your story</label><span className="field-counter">{scenes.length} paragraphs</span></div><div className="story-textarea-wrap"><textarea id="story-script" value={project.script} onChange={e => changeScript(e.target.value)} maxLength={20000} spellCheck={false} placeholder="Once upon a time… Separate paragraphs with a blank line to create new pages." /><span className="textarea-corner" /></div><div className="textarea-footer"><span>{wordCount} words</span><button className="text-button" onClick={() => textInput.current?.click()}><FileUp size={12} /> Import .txt</button></div></section>
                <section className="form-section audio-section"><div className="field-heading"><label>Your narration</label><span className="optional-tag">MAKE IT YOURS</span></div>{project.audioUrl ? <div className="audio-file"><div className="audio-art"><AudioLines size={23} strokeWidth={1.5} /></div><div className="audio-file-copy"><strong title={project.audioName}>{project.audioName}</strong><span>{formatTime(project.duration)} <i /> Audio track</span></div><button className="icon-button" aria-label="Remove narration" onClick={() => { setPlaying(false); update({ audioUrl: "", audioName: "", words: [], timingSource: "estimated" }); }}><X size={14} /></button></div> : <button className="audio-empty" onClick={() => audioInput.current?.click()}><Upload size={18} /><span>Add your narration<small>MP3, WAV, M4A · up to 30 MB</small></span></button>}<div className="audio-links"><button className="text-button" disabled={!!uploading} onClick={() => audioInput.current?.click()}>{uploading === "audio" ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}{uploading === "audio" ? "Uploading…" : "Upload audio"}</button><button className="text-button muted-text" onClick={() => timingInput.current?.click()}><Clock3 size={12} /> Add timestamps</button><button className="text-button" onClick={() => openModal("voice")}><Mic2 size={12} /> Generate voice</button></div></section>
                <div className="settings-divider" /><div className="magic-label"><Sparkles size={13} /> THE LITTLE DETAILS</div><div className="content-toggles"><Toggle checked={project.settings.highlight} onChange={() => setting("highlight", !project.settings.highlight)} label="Word-by-word highlight" /><Toggle checked={project.settings.hand} onChange={() => setting("hand", !project.settings.hand)} label="Show drawing hand" /></div><div className="page-turn-setting"><label htmlFor="page-turn"><BookOpen size={14} /> Page transition</label><div><select id="page-turn" value={project.settings.transition} onChange={e => setting("transition", e.target.value as StorySettings["transition"])}><option value="curl">Soft page curl</option><option value="fade">Gentle fade</option><option value="none">Instant turn</option></select><ChevronDown size={12} /></div></div><div className="sync-note"><span className="sync-note-icon"><AudioLines size={15} /></span><p>Your voice sets the pace.<br /><strong>We’ll take care of the magic.</strong></p></div>
              </div> : <div className="settings-content appearance-content"><div className="field-heading"><label htmlFor="font-select">The handwriting</label><PenTool size={14} /></div><select className="full-select" id="font-select" value={project.settings.font} onChange={e => setting("font", e.target.value as StorySettings["font"])}><option value="serif">Lora · A timeless storybook serif</option><option value="handwritten">Caveat · A personal, handwritten touch</option></select><div className={`font-preview ${project.settings.font}`}>Once upon a little moment…</div><div className="field-heading"><label>Paper & atmosphere</label></div><div className="paper-options">{(["ivory", "white", "warm"] as const).map(paper => <button key={paper} className={`paper-option ${paper} ${project.settings.paper === paper ? "selected" : ""}`} onClick={() => setting("paper", paper)} aria-label={`${paper} paper`} aria-pressed={project.settings.paper === paper}><span>{project.settings.paper === paper && <Check size={15} />}</span><small>{paper === "ivory" ? "Soft ivory" : paper === "white" ? "Clean white" : "Warm linen"}</small></button>)}</div><div className="settings-divider" /><Toggle checked={project.settings.highlight} onChange={() => setting("highlight", !project.settings.highlight)} label="Spoken word highlight" description="A little emphasis on every word." /><Toggle checked={project.settings.textPen} onChange={() => setting("textPen", !project.settings.textPen)} label="Handwriting pen cursor" description="Follow each word as it appears." /><Toggle checked={project.settings.hand} onChange={() => setting("hand", !project.settings.hand)} label="Illustration drawing hand" /><Toggle checked={project.settings.textShadow} onChange={() => setting("textShadow", !project.settings.textShadow)} label="Text shadow depth" /><Toggle checked={project.settings.glow} onChange={() => setting("glow", !project.settings.glow)} label="Word glow effect" /><div className="settings-divider" /><div className="field-heading"><label>Story theme</label></div><div className="theme-options">{(["classic", "night", "garden", "fairy"] as const).map(t => <button key={t} className={`theme-option ${project.settings.theme === t ? "selected" : ""}`} onClick={() => setting("theme", t)}><span className={`theme-swatch ${t}`} /><span>{t === "classic" ? "Timeless" : t === "night" ? "Midnight" : t === "garden" ? "Garden" : "Fairy Tale"}</span>{project.settings.theme === t && <Check size={12} />}</button>)}</div><div className="settings-divider" /><div className="field-heading"><label htmlFor="sketch-speed">Illustration reveal speed</label><span className="field-counter">{project.settings.sketchSpeed.toFixed(1)}×</span></div><input className="setting-range" id="sketch-speed" type="range" min={.5} max={3} step={.1} value={project.settings.sketchSpeed} onChange={e => setting("sketchSpeed", Number(e.target.value))} /><div className="range-labels"><span>Take it slow</span><span>A little quicker</span></div><div className="field-heading transition-duration-label"><label htmlFor="turn-duration">Page-turn duration</label><span className="field-counter">{project.settings.transitionDuration.toFixed(1)}s</span></div><input className="setting-range" id="turn-duration" type="range" min={1} max={1.5} step={.1} value={project.settings.transitionDuration} onChange={e => setting("transitionDuration", Number(e.target.value))} /><div className="layout-info"><BookOpen size={22} strokeWidth={1.3} /><div><strong>Two pages. One lovely story.</strong><span>1920 × 1080 · 870 × 1000 per page</span></div></div><button className="text-button reset-style" onClick={() => { update(p => ({ ...p, settings: { ...DEFAULT_SETTINGS } })); notify("The original storybook style is restored."); }}><RotateCcw size={12} /> Reset to the original style</button></div>}
            </div>
            <StoryPreview project={project} time={time} playing={playing} muted={muted} onTogglePlay={togglePlay} onSeek={seek} onMute={() => setMuted(v => !v)} onAddPage={addPage} onError={onPreviewError} />
          </div>
        </section> : <section className="projects-section"><div className="projects-toolbar"><h2>Your story shelf <span>{savedProjects.length}</span></h2><div><label className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a story…" aria-label="Search projects" /></label><button className="button primary" onClick={() => { setNameInput(""); setUseTemplate(true); openModal("new"); }}><Plus size={16} /> New story</button></div></div>{projectsLoading ? <div className="empty-state"><Loader2 size={27} className="spin" /><p>Finding your stories…</p></div> : projectError ? <div className="empty-state"><AlertCircle size={28} /><h3>Your shelf is taking a little longer.</h3><p>{projectError}</p><button className="button secondary" onClick={() => void loadProjects()}>Try again</button></div> : savedProjects.length === 0 ? <div className="empty-state"><span className="empty-state-icon"><BookOpen size={40} strokeWidth={1.2} /></span><h3>A whole shelf of possibilities.</h3><p>Your saved stories will feel right at home here.<br />Start with the example, or create something entirely yours.</p><button className="button primary" onClick={() => setView("studio")}>Make your first story <ArrowRight size={16} /></button></div> : <div className="project-grid">{savedProjects.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(p => <article className="saved-project-card" key={p.id}><button className="saved-project-cover" onClick={() => loadProject(p)}><img src={p.content.images[0] || DEFAULT_PROJECT.images[0]} alt={p.name} /><div><BookOpen size={25} /><span>Open story</span></div><span className="cover-pages">{paragraphs(p.content.script).length} pages</span></button><div className="saved-project-info"><div><button onClick={() => loadProject(p)}>{p.name}</button><span>{formatTime(p.content.duration)} <i /> Edited {new Date(p.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div><button className="icon-button" aria-label={`Delete ${p.name}`} onClick={() => { setDeleteTarget(p); openModal("delete"); }}><Trash2 size={15} /></button></div></article>)}{query && !savedProjects.some(p => p.name.toLowerCase().includes(query.toLowerCase())) && <div className="empty-state"><Search size={25} /><p>No stories match “{query}”. Try another title.</p></div>}</div>}</section>}
        <footer className="main-footer"><span><Leaf size={13} /> Made for your voice. Built for your imagination.</span><span><ShieldCheck size={13} /> Your stories stay yours.</span></footer>
      </main>
    </div>

    <audio ref={audio} src={project.audioUrl || undefined} preload="metadata" onTimeUpdate={() => { if (playing && audio.current) setTime(audio.current.currentTime); }} onEnded={() => { setPlaying(false); setTime(project.duration); }} onLoadedMetadata={() => { const duration = audio.current?.duration; if (duration && Number.isFinite(duration) && Math.abs(duration - projectRef.current.duration) > .15) setProject(p => ({ ...p, duration })); }} />
    <input hidden ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadFile(file, "image"); }} />
    <input hidden ref={audioInput} type="file" accept="audio/*" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadFile(file, "audio"); }} />
    <input hidden ref={textInput} type="file" accept=".txt,text/plain" onChange={importText} />
    <input hidden ref={timingInput} type="file" accept=".json,.srt" onChange={importTimings} />

    {modal === "export" && <ExportModal project={project} onClose={closeModal} />}
    {(modal === "new" || modal === "rename") && <Modal title={modal === "new" ? "Every story starts somewhere." : "Give your story a name."} subtitle={modal === "new" ? "A little idea is all you need. Make this one yours." : "The perfect title is a lovely place to begin."} onClose={closeModal}><form className="modal-body" onSubmit={e => { e.preventDefault(); if (!nameInput.trim()) return; if (modal === "new") void createProject(); else { update({ name: nameInput.trim() }); setModal(null); } }}><label className="modal-field-label" htmlFor="project-title">Story title</label><input id="project-title" className="modal-input" value={nameInput} onChange={e => setNameInput(e.target.value)} maxLength={160} placeholder="A name for your little story…" required autoFocus />{modal === "new" && <div className="template-choices"><button type="button" className={useTemplate ? "selected" : ""} onClick={() => setUseTemplate(true)}><BookOpen size={22} /><strong>A little inspiration</strong><span>Start with our illustrated example</span>{useTemplate && <CheckCircle2 size={16} />}</button><button type="button" className={!useTemplate ? "selected" : ""} onClick={() => setUseTemplate(false)}><FileText size={22} /><strong>A fresh page</strong><span>Bring your own words and voice</span>{!useTemplate && <CheckCircle2 size={16} />}</button></div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={closeModal}>Not just yet</button><button type="submit" className="button primary">{modal === "new" ? "Let’s begin" : "Save title"}<ArrowRight size={15} /></button></div></form></Modal>}
    {modal === "voice" && <Modal title="Give your story a voice." subtitle="Choose a neural voice and generate narration with exact word-level timing." onClose={closeModal}><div className="modal-body"><p className="voice-intro">Select a voice below, then generate. Word timestamps are captured directly from the voice engine, so every word stays perfectly synchronized.</p><div className="voice-options">{(["neerja", "brian"] as const).map(key => <button key={key} className={`voice-option ${ttsVoice === key ? "selected" : ""}`} onClick={() => setTtsVoice(key)}><div className="voice-card-header"><span className={`voice-avatar ${key}`}>{key === "neerja" ? "N" : "B"}</span><div><strong>{key === "neerja" ? "Neerja" : "Brian"} <small>{key === "neerja" ? "English Female, Indian" : "English Male, American"}</small></strong><span>{key === "neerja" ? "Warm, expressive · deep storytelling" : "Clear, deliberate · impactful narration"}</span></div>{ttsVoice === key && <CheckCircle2 size={18} />}</div><div className="voice-settings-preview"><span>Rate: {key === "neerja" ? "−8%" : "−12%"}</span><span>Pitch: −3Hz</span><span>Volume: +5%</span></div></button>)}</div><p className="voice-note">Voice generation uses Microsoft Edge TTS. Requires network. Your uploaded audio is never replaced unless you choose it.</p><div className="modal-actions"><button className="button secondary" onClick={closeModal}>Not now</button><button className="button primary" disabled={ttsBusy || !project.script.trim()} onClick={() => { void generateTTS(); }}>{ttsBusy ? <><Loader2 size={15} className="spin" /> Generating…</> : <><Mic2 size={15} /> Generate voice</>}</button></div></div></Modal>}
{modal === "diagnostics" && <Modal title="App health check." subtitle="Every subsystem, verified." onClose={closeModal}><div className="modal-body"><div className="diag-grid">{diagResults ? Object.entries(diagResults).map(([key, val]) => <div key={key} className={`diag-item ${val.ok ? "ok" : "fail"}`}><div className="diag-icon">{val.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</div><div><strong>{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</strong><span>{val.ok ? "Healthy" : val.detail || "Needs attention"}</span></div></div>) : <div className="diag-loading"><Loader2 size={24} className="spin" /><span>Running diagnostics…</span></div>}</div><div className="modal-actions"><button className="button secondary" onClick={closeModal}>Close</button><button className="button primary" onClick={() => void runDiagnostics()}><Settings2 size={15} /> Re-check</button></div></div></Modal>}
{modal === "help" && <Modal title="A little story. A little magic." subtitle="From an idea to a living storybook, in three simple steps." onClose={closeModal} wide><div className="modal-body help-modal-body"><div className="help-hero"><div className="help-book"><img src="/images/village-story.jpg" alt="A vintage illustration of Kael and Elara" /><div><span>Once upon<br />a little<br /><em>moment…</em></span><Leaf size={22} /></div></div><span className="help-sparkle one">✧</span><span className="help-sparkle two">✧</span></div><div className="help-steps"><article><span>01</span><div><h3>Set the scene</h3><p>Upload an illustration and write your story. A blank line between paragraphs begins a new page.</p></div></article><article><span>02</span><div><h3>Make it sound like you</h3><p>Add your narration. Import matching Whisper word-level JSON for precise timing, or an SRT file for estimated word timing.</p></div></article><article><span>03</span><div><h3>Let the pages come alive</h3><p>Play, adjust, and export a Full HD MP4. Or download a browser video or complete offline Python render kit.</p></div></article></div><div className="help-tip"><Sparkles size={16} /><p><strong>A small studio secret:</strong> use <kbd>space</kbd> to play or pause, and <kbd>⌘ / Ctrl + S</kbd> to save.</p></div><div className="modal-actions"><a href="https://github.com/itz-learningtime-oss/MY_VOICE_MY_story" target="_blank" rel="noreferrer" className="text-button">Built on the original project <ArrowUpRight size={13} /></a><button className="button primary" onClick={closeModal}>Let’s make something lovely <ArrowRight size={15} /></button></div></div></Modal>}
    {(modal === "media" || modal === "audio") && <Modal title={modal === "media" ? "A world of little possibilities." : "Your voice brings it to life."} subtitle={modal === "media" ? `Choose an illustration for page ${activeIndex + 1}, or bring something of your own.` : "Choose a narration track from your workspace."} onClose={closeModal} wide><div className="modal-body library-modal"><div className="library-toolbar"><span>{modal === "media" ? "YOUR ILLUSTRATION LIBRARY" : "YOUR AUDIO LIBRARY"}</span><button className="button secondary" disabled={!!uploading} onClick={() => modal === "media" ? imageInput.current?.click() : audioInput.current?.click()}>{uploading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} Upload {modal === "media" ? "image" : "audio"}</button></div>{mediaError && <div className="inline-error"><AlertCircle size={15} />{mediaError}<button onClick={() => void loadMedia()}>Retry</button></div>}{modal === "media" ? <div className="media-grid">{DEFAULT_PROJECT.images.map((url, i) => <button key={url} onClick={() => chooseImage(url, DEFAULT_PROJECT.imageNames[i])}><img src={url} alt={["Kael and Elara in the village", "A moment in the cottage garden", "Elara on her way home"][i]} /><span>{["A chance encounter", "A little perspective", "The way home"][i]}<small>STUDIO ILLUSTRATION</small></span>{currentImage === url && <b><Check size={14} /></b>}</button>)}{mediaFiles.filter(f => f.mimeType.startsWith("image/")).map(file => <button key={file.id} onClick={() => chooseImage(file.url, file.originalName)}><img src={file.url} alt={file.originalName} /><span>{file.originalName}<small>YOUR UPLOAD</small></span>{currentImage === file.url && <b><Check size={14} /></b>}</button>)}</div> : <div className="audio-library"><div className="audio-library-item"><span className="audio-art"><AudioLines size={24} /></span><div><strong>The little things</strong><span>Synthetic demo narration · English</span><audio controls src="/audio/the-little-things.mp3" preload="metadata" /></div><button className="button secondary" onClick={() => { chooseAudio(DEFAULT_PROJECT.audioUrl, DEFAULT_PROJECT.audioName); if (project.script === DEMO_SCRIPT) fetch("/audio/demo-timestamps.json").then(r => r.json()).then(data => update({ words: data.words, duration: data.duration, timingSource: "word-level" })).catch(() => {}); }}>Use track</button></div>{mediaFiles.filter(f => f.mimeType.startsWith("audio/") || f.mimeType === "video/webm").map(file => <div key={file.id} className="audio-library-item"><span className="audio-art"><Mic2 size={22} /></span><div><strong>{file.originalName}</strong><span>Your recording · {(file.size / 1024 / 1024).toFixed(1)} MB</span><audio controls src={file.url} preload="metadata" /></div><button className="button secondary" onClick={() => chooseAudio(file.url, file.originalName)}>Use track</button></div>)}</div>}{mediaLoading && <div className="library-loading"><Loader2 size={17} className="spin" /> Loading your uploads…</div>}<p className="library-note"><ShieldCheck size={14} /> Your uploaded files are kept in this workspace. No external AI service is required.</p></div></Modal>}
    {modal === "delete" && deleteTarget && <Modal title="Close this chapter?" subtitle={`“${deleteTarget.name}” will be permanently removed from your story shelf.`} onClose={closeModal}><div className="modal-body"><p className="delete-note">Your uploaded illustrations and audio will stay in your media library. This action cannot be undone.</p><div className="modal-actions"><button className="button secondary" onClick={closeModal}>Keep my story</button><button className="button danger" onClick={() => void deleteProject()}><Trash2 size={15} /> Delete project</button></div></div></Modal>}
    {toast && <div className={`toast ${toast.error ? "error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<span>{toast.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
  </div>;
}
