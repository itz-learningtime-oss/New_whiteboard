"""Generate narration audio and exact word-level timestamps with Edge TTS.

Returns the decoded PCM duration, word boundaries, and output file path.
User narration is never synthesized or replaced. This module supplies a
drafting tool for creators who want a starting point.
"""
from __future__ import annotations
import asyncio
import json
import re
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

import edge_tts

VOICES: dict[str, dict[str, str]] = {
    "neerja": {
        "id": "en-IN-NeerjaExpressiveNeural",
        "label": "Neerja (English Female, Indian)",
        "description": "Warm, expressive narration with a gentle storytelling quality.",
        "rate": "-8%",
        "pitch": "-3Hz",
        "volume": "+5%",
    },
    "brian": {
        "id": "en-US-BrianNeural",
        "label": "Brian (English Male, American)",
        "description": "Clear, deliberate pacing with deep, impactful resonance.",
        "rate": "-12%",
        "pitch": "-3Hz",
        "volume": "+5%",
    },
}


@dataclass
class TTSResult:
    audio_path: Path
    duration: float
    words: list[dict]
    voice: str


async def _generate(text: str, voice_id: str, rate: str, pitch: str, volume: str, output: Path) -> tuple[list[dict], float]:
    words: list[dict] = []
    communicate = edge_tts.Communicate(text, voice_id, rate=rate, pitch=pitch, volume=volume)
    with open(output, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({
                    "word": chunk["text"],
                    "start": round(chunk["offset"] / 10_000_000, 3),
                    "end": round((chunk["offset"] + chunk["duration"]) / 10_000_000, 3),
                })
    if not words:
        raise ValueError("Edge TTS returned no word boundaries. The text may be empty or the service may be unavailable.")
    ffprobe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(output)],
        capture_output=True, text=True, timeout=30,
    )
    duration = float(ffprobe.stdout.strip()) if ffprobe.returncode == 0 else words[-1]["end"] + 0.1
    # Normalize timestamps so the first word starts at 0
    offset = words[0]["start"]
    for w in words:
        w["start"] = round(w["start"] - offset, 3)
        w["end"] = round(w["end"] - offset, 3)
    duration = round(duration - offset, 3) if duration > offset else round(duration, 3)
    return words, duration


def generate_tts(text: str, voice: str = "neerja", work_dir: Path | None = None) -> TTSResult:
    if not text or not text.strip():
        raise ValueError("Provide some text for the narration.")
    voice_cfg = VOICES.get(voice)
    if not voice_cfg:
        raise ValueError(f"Unknown voice: {voice}. Choose from: {', '.join(VOICES.keys())}")
    work = Path(tempfile.mkdtemp(prefix="tts-", dir=work_dir))
    mp3_path = work / "narration.mp3"
    loop = asyncio.new_event_loop()
    try:
        words, duration = loop.run_until_complete(
            _generate(text.strip(), voice_cfg["id"], voice_cfg["rate"], voice_cfg["pitch"], voice_cfg["volume"], mp3_path)
        )
    finally:
        loop.close()
    return TTSResult(audio_path=mp3_path, duration=duration, words=words, voice=voice)
