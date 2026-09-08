"""Bundle synthetic narration with real eSpeak audio-clock word boundaries.

SSML marks cover merged short words. Native word events cover sentence-leading
marks which eSpeak suppresses. Neither path interpolates or guesses timing.
"""
import ctypes as C
import ctypes.util
import html
import json
import re
import subprocess
import wave
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "src/lib/story.ts").read_text()
original = re.search(r"export const DEMO_SCRIPT = `([\s\S]*?)`;", source).group(1)
text = original.translate(str.maketrans({"“": '"', "”": '"', "’": "'"}))
originals = original.split(); tokens = text.split()
marked = "<speak>"; positions = []
for i, token in enumerate(tokens):
    marked += f'<mark name="w{i}"/>'
    start = len(marked); marked += html.escape(token)
    positions.append((start, len(marked))); marked += '<break time="10ms"/> '
marked += "</speak>"
class Id(C.Union):
    _fields_ = [("number", C.c_int), ("name", C.c_char_p), ("string", C.c_char * 8)]
class Event(C.Structure):
    _fields_ = [("type", C.c_int), ("unique_identifier", C.c_uint), ("text_position", C.c_int), ("length", C.c_int), ("audio_position", C.c_int), ("sample", C.c_int), ("user_data", C.c_void_p), ("id", Id)]
lib = C.CDLL(ctypes.util.find_library("espeak-ng") or ctypes.util.find_library("espeak"))
rate = lib.espeak_Initialize(2, 0, None, 0)
lib.espeak_SetVoiceByName(b"en-gb")
lib.espeak_SetParameter(1, 130, 0); lib.espeak_SetParameter(3, 43, 0)
samples = []; marks = {}; clause_ends = []; word_events = []
CALLBACK = C.CFUNCTYPE(C.c_int, C.POINTER(C.c_short), C.c_int, C.POINTER(Event))
@CALLBACK
def callback(wav, count, data):
    if wav and count: samples.append(C.string_at(wav, count * 2))
    i = 0
    while data and data[i].type:
        e = data[i]
        if e.type == 3 and e.id.name: marks[e.id.name.decode()] = e.audio_position / 1000
        if e.type == 5: clause_ends.append(e.audio_position / 1000)
        if e.type == 1: word_events.append((e.text_position - 1, e.audio_position / 1000))
        i += 1
    return 0
lib.espeak_SetSynthCallback(callback)
encoded = marked.encode()
lib.espeak_Synth(C.c_char_p(encoded), len(encoded) + 1, 0, 1, 0, 1 | 0x10 | 0x1000, None, None)
lib.espeak_Synchronize()
raw = b"".join(samples); duration = len(raw) / 2 / rate
assert duration > 10, "Narration generation failed"
starts = []
for i, (left, right) in enumerate(positions):
    if f"w{i}" in marks: starts.append(marks[f"w{i}"]); continue
    matching = [t for pos, t in word_events if left <= pos < right]
    if not matching: raise ValueError(f"Missing actual audio boundary for word {i}: {tokens[i]}")
    starts.append(min(matching))
words = []
for i, start in enumerate(starts):
    following = starts[i + 1] if i + 1 < len(starts) else duration - .03
    end = min([following, *[t for t in clause_ends if start + .05 < t < following]])
    assert end > start, (i, tokens[i], start, end)
    words.append({"word": originals[i], "start": round(start, 3), "end": round(end, 3)})
folder = ROOT / "public/audio"; folder.mkdir(parents=True, exist_ok=True)
with wave.open(str(folder / "demo.wav"), "wb") as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(raw)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(folder / "demo.wav"), "-c:a", "libmp3lame", "-b:a", "128k", str(folder / "the-little-things.mp3")], check=True)
(folder / "demo.wav").unlink()
(folder / "demo-timestamps.json").write_text(json.dumps({"words": words, "duration": duration, "source": "eSpeak audio-clock marks and word events; synthetic demo"}, indent=2))
print(f"Generated {duration:.2f}s narration, {len(words)} exact word boundaries")
lib.espeak_Terminate()
