"""1920 × 1080 storybook geometry. All page drawing happens in local coordinates."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = ROOT / "assets" / "storybook_spread_bg.png"
FONT = ROOT / "assets" / "fonts" / "storybook.ttf"

@dataclass(frozen=True)
class Viewport:
    x: int
    y: int
    width: int = 870
    height: int = 1000

    @property
    def box(self):
        return (self.x, self.y, self.x + self.width, self.y + self.height)

    def map_point(self, point, source_size):
        scale = min(self.width / source_size[0], self.height / source_size[1])
        x = self.x + (self.width - source_size[0] * scale) / 2 + point[0] * scale
        y = self.y + (self.height - source_size[1] * scale) / 2 + point[1] * scale
        return (min(self.x + self.width - 1, max(self.x, x)), min(self.y + self.height - 1, max(self.y, y)))

    def fit(self, source: Image.Image, paper="#f8f5eb") -> Image.Image:
        image = ImageOps.contain(ImageOps.exif_transpose(source).convert("RGB"), (self.width, self.height), Image.Resampling.LANCZOS)
        page = Image.new("RGB", (self.width, self.height), paper)
        page.paste(image, ((self.width - image.width) // 2, (self.height - image.height) // 2))
        return page

WIDTH, HEIGHT = 1920, 1080
LEFT = Viewport(60, 40)
RIGHT = Viewport(990, 40)
PAPERS = {"ivory": "#f8f5eb", "white": "#fdfcf9", "warm": "#eee3ce"}

def make_background(paper="#f8f5eb") -> Image.Image:
    base = Image.new("RGB", (WIDTH, HEIGHT), paper)
    pixels = np.asarray(base).astype(np.int16)
    noise = np.random.default_rng(17).integers(-3, 4, (HEIGHT, WIDTH, 1), dtype=np.int16)
    image = Image.fromarray(np.clip(pixels + noise, 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(image)
    for inset in (12, 20, 28):
        draw.rounded_rectangle((inset, inset, WIDTH - inset - 1, HEIGHT - inset - 1), radius=48 - inset // 3, outline="#d4d1c6", width=2)
    draw.rounded_rectangle((49, 31, 940, 1049), radius=24, outline="#dfdccf", width=2)
    draw.rounded_rectangle((980, 31, 1871, 1049), radius=24, outline="#dfdccf", width=2)
    rgba = image.convert("RGBA")
    shade = Image.new("RGBA", image.size)
    sd = ImageDraw.Draw(shade)
    for x in range(905, 1006):
        opacity = round(48 * np.exp(-abs(x - 959) / 15))
        sd.line((x, 28, x, 1052), fill=(45, 42, 32, opacity))
    sd.line((960, 28, 960, 1052), fill=(80, 73, 57, 65), width=2)
    return Image.alpha_composite(rgba, shade).convert("RGB")

def save_background(path=BACKGROUND):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    make_background().save(path)
    return path

if __name__ == "__main__":
    print(save_background())
