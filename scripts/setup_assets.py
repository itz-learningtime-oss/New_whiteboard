"""Download/generate every bundled asset the studio and renderer expect.

Run:  python scripts/setup_assets.py

- Fonts (OFL, from google/fonts): public/fonts/*.ttf + assets/fonts/storybook.ttf
- Demo illustrations: public/images/village-*.jpg + public/images/hand_marker.png
- Demo narration: public/audio/the-little-things.mp3 + public/audio/demo-timestamps.json
  (edge_tts word boundaries, so audio and timestamps always match)
- Renderer assets: assets/hand_marker.png, assets/storybook_spread_bg.png
"""
from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_IMAGES = ROOT / "public" / "images"
PUBLIC_AUDIO = ROOT / "public" / "audio"
PUBLIC_FONTS = ROOT / "public" / "fonts"
ASSETS = ROOT / "assets"
ASSETS_FONTS = ASSETS / "fonts"

FONTS = {
    "lora.ttf": "https://github.com/google/fonts/raw/main/ofl/lora/Lora%5Bwght%5D.ttf",
    "caveat.ttf": "https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
    "dm-sans.ttf": "https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf",
}


def fetch(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "whiteboard-setup/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response, open(dest, "wb") as fh:
        fh.write(response.read())


def setup_fonts() -> None:
    PUBLIC_FONTS.mkdir(parents=True, exist_ok=True)
    ASSETS_FONTS.mkdir(parents=True, exist_ok=True)
    for name, url in FONTS.items():
        dest = PUBLIC_FONTS / name
        if dest.exists() and dest.stat().st_size > 10_000:
            print(f"  font exists: {name}")
            continue
        fetch(url, dest)
        print(f"  downloaded: {name} ({dest.stat().st_size // 1024} KB)")
    storybook = ASSETS_FONTS / "storybook.ttf"
    if not storybook.exists():
        storybook.write_bytes((PUBLIC_FONTS / "caveat.ttf").read_bytes())
        print("  wrote assets/fonts/storybook.ttf (handwriting face)")


def demo_script() -> str:
    source = (ROOT / "src" / "lib" / "story.ts").read_text(encoding="utf-8")
    return re.search(r"export const DEMO_SCRIPT = `([\s\S]*?)`;", source).group(1)


def gradient(draw_image, top: tuple, bottom: tuple) -> None:
    from PIL import Image

    width, height = draw_image.size
    top_img = Image.new("RGB", (1, height), top).resize((width, height))
    bot_img = Image.new("RGB", (1, height), bottom).resize((width, height))
    from PIL import Image as I

    mask = I.new("L", (1, height))
    mask.putdata([round(255 * y / max(1, height - 1)) for y in range(height)])
    mask = mask.resize((width, height))
    draw_image.paste(I.composite(bot_img, top_img, mask), (0, 0))


def illustration(path: Path, kind: str) -> None:
    from PIL import Image, ImageDraw

    width, height = 870, 1000
    img = Image.new("RGB", (width, height), "#f8f5eb")
    if kind == "story":
        gradient(img, (126, 170, 214), (248, 236, 205))
    elif kind == "garden":
        gradient(img, (150, 200, 150), (250, 244, 214))
    else:
        gradient(img, (235, 150, 110), (250, 220, 170))
    art = ImageDraw.Draw(img, "RGBA")
    horizon = 640
    art.rectangle((0, horizon, width, height), fill=(122, 154, 107, 255))
    # sun
    sun = (680, 180) if kind != "sunset" else (435, 560)
    art.ellipse((sun[0] - 70, sun[1] - 70, sun[0] + 70, sun[1] + 70), fill=(255, 244, 200, 255))
    art.ellipse((sun[0] - 90, sun[1] - 90, sun[0] + 90, sun[1] + 90), outline=(255, 244, 200, 160), width=6)
    # cottages
    for i, x in enumerate((90, 420)):
        art.rectangle((x, horizon - 190, x + 220, horizon + 40), fill=(243, 235, 218, 255), outline=(120, 95, 70, 255), width=5)
        art.polygon(((x - 25, horizon - 190), (x + 110, horizon - 300), (x + 245, horizon - 190)), fill=(168, 120, 85, 255), outline=(120, 95, 70, 255))
        art.rectangle((x + 85, horizon - 110, x + 135, horizon + 40), fill=(120, 95, 70, 255))
        art.rectangle((x + 30, horizon - 160, x + 80, horizon - 110), fill=(150, 185, 215, 255), outline=(120, 95, 70, 255), width=4)
        art.rectangle((x + 140, horizon - 160, x + 190, horizon - 110), fill=(150, 185, 215, 255), outline=(120, 95, 70, 255), width=4)
        if i == 0:
            # two little figures on the path
            art.ellipse((300, horizon + 60, 330, horizon + 110), fill=(70, 90, 110, 255))
            art.rectangle((305, horizon + 110, 325, horizon + 170), fill=(70, 90, 110, 255))
            art.ellipse((345, horizon + 70, 368, horizon + 112), fill=(150, 110, 130, 255))
            art.rectangle((349, horizon + 112, 364, horizon + 168), fill=(150, 110, 130, 255))
    if kind == "garden":
        for x in range(60, width - 40, 90):
            art.line((x, horizon + 120, x, horizon - 40), fill=(90, 125, 75, 255), width=7)
            art.ellipse((x - 45, horizon - 130, x + 45, horizon - 40), fill=(125, 175, 105, 255), outline=(90, 125, 75, 255), width=4)
    if kind == "sunset":
        # path home
        art.polygon(((380, height), (490, height), (460, horizon + 40), (410, horizon + 40)), fill=(220, 200, 160, 255))
    # soft vignette border
    art.rectangle((8, 8, width - 8, height - 8), outline=(255, 255, 255, 200), width=10)
    img.save(path, "JPEG", quality=88)
    print(f"  painted: {path.name}")


def hand_marker(dest: Path) -> None:
    from PIL import Image, ImageDraw

    size = 220
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    art = ImageDraw.Draw(img)
    # simple diagonal marker pen
    art.line((60, 170, 150, 60), fill=(60, 60, 65, 255), width=34)
    art.line((60, 170, 150, 60), fill=(200, 200, 205, 255), width=20)
    art.polygon(((150, 60), (178, 78), (160, 108), (132, 90)), fill=(230, 180, 140, 255))
    art.ellipse((168, 66, 190, 88), fill=(80, 80, 85, 255))
    img.save(dest)
    print(f"  painted: {dest.name}")


def spread_background() -> None:
    dest = ASSETS / "storybook_spread_bg.png"
    if dest.exists():
        print("  background exists: storybook_spread_bg.png")
        return
    sys.path.insert(0, str(ROOT / "src"))
    from storybook_layout import make_background

    make_background().save(dest)
    print("  painted: storybook_spread_bg.png")


async def demo_narration() -> None:
    import edge_tts

    PUBLIC_AUDIO.mkdir(parents=True, exist_ok=True)
    mp3 = PUBLIC_AUDIO / "the-little-things.mp3"
    timestamps = PUBLIC_AUDIO / "demo-timestamps.json"
    text = demo_script()
    communicate = edge_tts.Communicate(text, "en-IN-NeerjaExpressiveNeural", rate="-8%", pitch="-3Hz", volume="+5%")
    bounds: list[tuple[str, str, float, float]] = []
    with open(mp3, "wb") as fh:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                fh.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                bounds.append((chunk["type"], chunk["text"], chunk["offset"] / 1e7, (chunk["offset"] + chunk["duration"]) / 1e7))
    if not bounds:
        raise RuntimeError("edge_tts returned no timing boundaries")
    words = distribute_bounds(bounds, text.split())
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(mp3)],
        capture_output=True, text=True, timeout=30,
    )
    duration = float(probe.stdout.strip()) if probe.returncode == 0 else words[-1]["end"] + 0.3
    # Re-encode to a clean MP3 (trims encoder delay so timestamps line up)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-c:a", "libmp3lame", "-b:a", "128k", str(mp3) + ".tmp.mp3"],
        check=True,
    )
    Path(str(mp3) + ".tmp.mp3").replace(mp3)
    offset = words[0]["start"]
    for word in words:
        word["start"] = round(word["start"] - offset, 3)
        word["end"] = round(word["end"] - offset, 3)
    duration = round(duration - offset, 3)
    script_tokens = text.split()
    if [normal(w["word"]) for w in words] != [normal(t) for t in script_tokens]:
        words = estimate_words(script_tokens, duration)
        print("  note: service text differed; used weighted word estimate")
    # Sentence-boundary chunks can overlap slightly; enforce clean ordering.
    for i in range(1, len(words)):
        if words[i]["start"] < words[i - 1]["end"]:
            words[i]["start"] = words[i - 1]["end"]
        if words[i]["end"] <= words[i]["start"]:
            words[i]["end"] = round(words[i]["start"] + 0.05, 3)
    timestamps.write_text(json.dumps({"words": words, "duration": duration, "source": "edge-tts boundaries; synthetic demo"}, indent=2))
    print(f"  narrated: the-little-things.mp3 ({duration:.1f}s, {len(words)} words)")


def normal(s: str) -> str:
    return re.sub(r"[^\w]", "", s.lower(), flags=re.UNICODE)


def estimate_words(tokens: list[str], duration: float) -> list[dict]:
    weights = [max(2, len(normal(t))) + (3 if re.search(r"[.!?\u201d]$", t) else 0) for t in tokens]
    total = sum(weights) or 1
    cursor, out = 0.0, []
    for token, weight in zip(tokens, weights):
        nxt = cursor + weight / total * duration
        out.append({"word": token, "start": round(cursor, 3), "end": round(nxt, 3)})
        cursor = nxt
    return out


def distribute_bounds(bounds: list[tuple[str, str, float, float]], script_tokens: list[str]) -> list[dict]:
    words: list[dict] = []
    for kind, btext, start, end in bounds:
        if end <= start:
            continue
        if kind == "WordBoundary":
            words.append({"word": btext, "start": round(start, 3), "end": round(end, 3)})
            continue
        parts = btext.split()
        if not parts:
            continue
        weights = [max(2, len(normal(p))) + (3 if re.search(r"[.!?\u201d]$", p) else 0) for p in parts]
        total = sum(weights) or 1
        cursor = start
        for part, weight in zip(parts, weights):
            nxt = cursor + weight / total * (end - start)
            words.append({"word": part, "start": round(cursor, 3), "end": round(nxt, 3)})
            cursor = nxt
    if [normal(w["word"]) for w in words] != [normal(t) for t in script_tokens]:
        span = (bounds[0][2], bounds[-1][3])
        return estimate_words(script_tokens, span[1] - span[0])
    return words


def main() -> None:
    PUBLIC_IMAGES.mkdir(parents=True, exist_ok=True)
    print("fonts…")
    setup_fonts()
    print("illustrations…")
    illustration(PUBLIC_IMAGES / "village-story.jpg", "story")
    illustration(PUBLIC_IMAGES / "village-garden.jpg", "garden")
    illustration(PUBLIC_IMAGES / "village-sunset.jpg", "sunset")
    hand_marker(ASSETS / "hand_marker.png")
    hand_marker(PUBLIC_IMAGES / "hand_marker.png")
    spread_background()
    print("demo narration (needs network)…")
    try:
        asyncio.run(demo_narration())
    except Exception as error:
        print(f"  skipped narration: {error}")
    print("done.")


if __name__ == "__main__":
    main()
