"""Audio-clocked split-page storybooks built on the original SketchAnimator.

Word JSON is exact; words interpolated within SRT cues or untimed text are
explicitly marked estimated. Page turns never insert time or shift narration.
"""
from __future__ import annotations
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from .audio_manager import analyze_audio, plan_timing
from .contour_processor import ContourOptions, process_image
from .sketch_animator import AnimationOptions, SketchAnimator, load_hand
from .storybook_layout import WIDTH, HEIGHT, LEFT, RIGHT, FONT, BACKGROUND, PAPERS, make_background, save_background
from .page_flip import page_turn
from .subtitles import parse_srt
from .video_exporter import _encode_command, _stream_frames, verify_video

@dataclass(frozen=True)
class Word:
    word: str
    start: float
    end: float

@dataclass
class Spread:
    text: str
    words: list[Word]
    image_path: Path
    start: float
    end: float


def estimated_words(text: str, start: float, end: float) -> list[Word]:
    tokens = text.split()
    weights = [max(2, len(re.sub(r"\W", "", t))) + (3 if re.search(r'[.!?”]$', t) else 0) for t in tokens]
    total = sum(weights) or 1
    cursor = start
    words = []
    for token, weight in zip(tokens, weights):
        until = cursor + weight / total * (end - start)
        words.append(Word(token, cursor, until)); cursor = until
    return words


def load_word_timings(path: Path | None, script: str, duration: float) -> tuple[list[Word], str]:
    if path is None: return estimated_words(script, 0, duration), "estimated"
    path = Path(path)
    if path.suffix.lower() == ".srt":
        words = [w for cue in parse_srt(path) for w in estimated_words(re.sub(r"<[^>]+>", "", cue.text), cue.start, cue.end)]
        source = "srt-interpolated"
    else:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        raw = data if isinstance(data, list) else data.get("words") or [w for s in data.get("segments", []) for w in s.get("words", [])]
        words = [Word(str(w.get("word", w.get("text", ""))).strip(), float(w["start"]), float(w["end"])) for w in raw]
        declared_source = data.get("timing_source", data.get("source")) if isinstance(data, dict) else None
        source = declared_source if declared_source in {"estimated", "srt-interpolated"} else "word-level"
    if not words: raise ValueError("No word timestamps found. Export Whisper JSON with word_timestamps=True.")
    previous = -1.0
    for w in words:
        if not w.word or not all(math.isfinite(v) for v in (w.start, w.end)) or w.start < 0 or w.end <= w.start or w.end > duration + .1 or w.start < previous - .03:
            raise ValueError("Invalid, overlapping, or out-of-range word timestamps.")
        previous = w.end
    tokens = script.split()
    normalize = lambda s: re.sub(r"[^\w]", "", s, flags=re.UNICODE).casefold()
    if len(tokens) != len(words) or any(normalize(t) != normalize(w.word) for t, w in zip(tokens, words)):
        raise ValueError("Timestamp words do not match the script. Import the matching transcript or omit --timestamps for estimated timing.")
    return [Word(token, w.start, w.end) for token, w in zip(tokens, words)], source


def build_spreads(script: str, words: list[Word], images: list[Path]) -> list[Spread]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", script.strip()) if p.strip()]
    if not paragraphs: raise ValueError("The story is empty.")
    if len(images) not in (1, len(paragraphs)):
        raise ValueError("Supply one reusable image, or exactly one image per paragraph.")
    cursor = 0; spreads = []
    for i, text in enumerate(paragraphs):
        count = len(text.split()); group = words[cursor:cursor + count]; cursor += count
        if not group: raise ValueError("Each paragraph needs narration timestamps.")
        start = 0.0 if not spreads else spreads[-1].end
        spreads.append(Spread(text, group, images[min(i, len(images) - 1)], start, group[-1].end))
    return spreads


class StorybookEngine:
    def __init__(self, images: list[Path], script: str, duration: float, timestamps: Path | None = None,
                 *, hand=True, text_pen=False, highlight=True, font_path=FONT,
                 paper="ivory", transition="curl", transition_duration=1.2, sketch_speed=1.5):
        if not 1 <= transition_duration <= 1.5: raise ValueError("Page turns must last 1.0–1.5 seconds.")
        if transition not in {"curl", "fade", "none"}: raise ValueError("Unknown page transition.")
        if not .5 <= sketch_speed <= 3: raise ValueError("Sketch speed must be 0.5–3.")
        self.duration = duration
        self.words, self.timing_source = load_word_timings(timestamps, script, duration)
        self.spreads = build_spreads(script, self.words, images)
        self.paper = PAPERS.get(paper, PAPERS["ivory"])
        if not BACKGROUND.exists(): save_background()
        self.background = Image.open(BACKGROUND).convert("RGB") if paper == "ivory" else make_background(self.paper)
        self.highlight, self.text_pen = highlight, text_pen
        self.transition, self.turn_duration, self.sketch_speed = transition, transition_duration, sketch_speed
        self.font_path = Path(font_path)
        if not self.font_path.is_file(): raise ValueError(f"Storybook font not found: {self.font_path}")
        self.label_font = ImageFont.truetype(str(self.font_path), 23)
        self.marker = None
        if hand:
            marker = load_hand(Path(__file__).resolve().parents[1] / "assets" / "hand_marker.png")
            self.marker = marker.resize((200, round(200 * marker.height / marker.width)), Image.Resampling.LANCZOS)
        self.animators = {}; self.colors = {}; self.layouts = {}
        for i, spread in enumerate(self.spreads):
            source = Image.open(spread.image_path)
            self.colors[i] = LEFT.fit(source, self.paper)
            try:
                drawing = process_image(spread.image_path, ContourOptions(width=870, height=1000, margin=0, processing_limit=900, min_length=9, color_mode="monochrome"))
                self.animators[i] = SketchAnimator(drawing, AnimationOptions(paper=self.paper, ink="#696655", hand=False, pen_width=2.4))
            except ValueError as error:
                if "No drawable contours" not in str(error): raise
                self.animators[i] = None
            self.layouts[i] = self._layout_words(spread.words)

    def _layout_words(self, words: list[Word]):
        draw = ImageDraw.Draw(Image.new("RGB", (870, 1000)))
        for size in range(44, 23, -2):
            font = ImageFont.truetype(str(self.font_path), size)
            x, y = 76.0, 172.0; placements = []; leading = round(size * 1.62)
            space = draw.textlength(" ", font=font)
            for word in words:
                width = draw.textlength(word.word, font=font)
                if width > 720: raise ValueError("A word is too long to fit. Add a space or a line break.")
                if x + width > 796 and x > 76: x = 76; y += leading
                placements.append((word, x, y, width)); x += width + space
            if y + leading < 915: return font, placements
        raise ValueError("This paragraph is too long for a spread. Split it using a blank line.")

    def spread_frame(self, index: int, time: float) -> np.ndarray:
        spread = self.spreads[index]
        progress = float(np.clip((time - spread.start) / max(.001, spread.end - spread.start) * self.sketch_speed, 0, 1))
        outline = min(1.0, progress / .52)
        animator = self.animators[index]
        if animator:
            page = Image.fromarray(animator.frame(outline))
            color_amount = float(np.clip((progress - .32) / .55, 0, 1))
            page = Image.blend(page, self.colors[index], color_amount)
            if self.marker is not None and animator.tip and 0 < progress < .7:
                x, y = animator.tip
                # Both the marker and its anchor are clipped by this 870×1000 page.
                x = min(869, max(0, x)); y = min(999, max(0, y))
                page.paste(self.marker, (round(x - self.marker.width * .279), round(y - self.marker.height * .278)), self.marker)
        else:
            page = Image.blend(Image.new("RGB", (870, 1000), self.paper), self.colors[index], progress)
        frame = self.background.copy()
        frame.paste(page, (LEFT.x, LEFT.y))
        # Drawing into a separate right-page surface makes overflow impossible.
        text_page = self.background.crop(RIGHT.box)
        draw = ImageDraw.Draw(text_page)
        draw.text((790, 70), "ITZ LEARNING TIME", font=self.label_font, anchor="ra", fill="#8e8c7d", stroke_width=0)
        font, placements = self.layouts[index]
        for word, x, y, width in placements:
            if time < word.start: continue
            active = word.start <= time < word.end
            if active and self.highlight:
                draw.rounded_rectangle((x - 6, y + 1, x + width + 6, y + font.size + 12), radius=6, fill="#e9dabc")
                draw.line((x, y + font.size + 10, x + width, y + font.size + 10), fill="#a3814c", width=2)
            draw.text((x, y), word.word, font=font, fill="#3f4437" if active else "#505143")
            if active and self.text_pen:
                letter_progress = min(1, (time - word.start) / max(.01, word.end - word.start))
                tip = x + width * letter_progress
                draw.line((tip, y + font.size + 6, tip + 24, y + font.size - 27), fill="#8e6f3d", width=6)
        draw.text((785, 935), str(index + 1), font=self.label_font, fill="#90907e", anchor="ra")
        frame.paste(text_page, (RIGHT.x, RIGHT.y))
        return np.asarray(frame)

    def frame(self, time: float) -> np.ndarray:
        time = min(self.duration, max(0, time))
        index = next((i for i, s in enumerate(self.spreads) if time < s.end), len(self.spreads) - 1)
        current = self.spread_frame(index, time)
        if index > 0 and time < self.spreads[index].start + self.turn_duration and self.transition != "none":
            boundary = self.spreads[index].start
            previous = self.spread_frame(index - 1, boundary)
            return page_turn(previous, current, (time - boundary) / self.turn_duration, self.transition)
        return current


def export_storybook(images: list[Path], text: Path, audio: Path, output: Path, *, timestamps=None,
                     fps=30, overwrite=False, progress: Callable[[float, str], None] | None = None, **settings) -> dict:
    report = progress or (lambda *_: None)
    output = Path(output).resolve()
    if output.suffix.lower() != ".mp4": raise ValueError("Storybook output must be an .mp4 file.")
    inputs = {Path(p).resolve() for p in [*images, text, audio, settings.get("font_path", FONT)]}
    if timestamps is not None: inputs.add(Path(timestamps).resolve())
    destinations = {output, output.with_suffix(".manifest.json")}
    if destinations & inputs: raise ValueError("Output or manifest must not overwrite an input.")
    if not overwrite and any(p.exists() for p in destinations): raise FileExistsError("Output or manifest exists. Use --overwrite.")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"): raise RuntimeError("Install FFmpeg and FFprobe first.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="storybook-", dir=output.parent) as temporary:
        work = Path(temporary)
        report(.01, "Analyzing narration")
        info = analyze_audio(audio, work)
        timing = plan_timing(info.sample_frames, info.sample_rate, fps)
        engine = StorybookEngine(images, Path(text).read_text(encoding="utf-8-sig"), info.duration, timestamps, **settings)
        report(.07, "Tracing illustrations and laying out words")
        pending = work / "storybook.mp4"
        command = _encode_command(shutil.which("ffmpeg"), WIDTH, HEIGHT, fps, info.pcm_path, timing.frame_count, info.sample_frames + timing.audio_padding_samples, timing.video_duration, 21, "veryfast", pending)
        frames = (engine.frame(i / fps) for i in range(timing.frame_count))
        _stream_frames(command, frames, timing.frame_count, fps, work / "ffmpeg.log", report, .08, .86, "Rendering storybook")
        verified = verify_video(pending, WIDTH, HEIGHT, timing.frame_count, fps, info.duration)
        os.replace(pending, output)
        manifest = {**verified, "output": str(output), "mode": "storybook", "width": WIDTH, "height": HEIGHT, "fps": fps, "audio_duration": info.duration, "video_duration": timing.video_duration, "pages": len(engine.spreads), "timing_source": engine.timing_source, "left_viewport": LEFT.box, "right_viewport": RIGHT.box, "transition": engine.transition, "transition_duration": engine.turn_duration}
        output.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2))
        report(1, "Storybook verified and ready")
        return manifest
