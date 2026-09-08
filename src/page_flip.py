"""Horizontal page curl using OpenCV remapping, with no added audio time.

FFmpeg's standard xfade has rectcrop, not pagecurl. The CPU curl here works on
ordinary FFmpeg builds. xfade_filter() is available for pre-rendered clips.
"""
from __future__ import annotations
import cv2
import numpy as np


def xfade_filter(offset: float, duration: float = 1.2) -> str:
    if not 1 <= duration <= 1.5 or offset < 0:
        raise ValueError("Page turns last 1.0–1.5 seconds; offset must be non-negative.")
    return f"xfade=transition=rectcrop:duration={duration:g}:offset={offset:g}"


def page_turn(previous: np.ndarray, following: np.ndarray, progress: float, style="curl") -> np.ndarray:
    if previous.shape != following.shape:
        raise ValueError("Both spreads must have the same dimensions.")
    p = float(np.clip(progress, 0, 1))
    if p <= 0: return previous.copy()
    if p >= 1 or style == "none": return following.copy()
    if style == "fade": return cv2.addWeighted(previous, 1 - p, following, p, 0)
    h, w = previous.shape[:2]
    eased = p * p * (3 - 2 * p)
    edge = int(w * (1 - eased))
    curl_width = max(1, int(w * .11 * np.sin(np.pi * p)))
    output = following.copy()
    output[:, :edge] = previous[:, :edge]
    # Mirror/compress the old page around the moving spine. Vertical curvature
    # bends the corner; a paper-colored back and shaded edge sell the turn.
    right = min(w, edge + curl_width)
    if right > edge:
        xx, yy = np.meshgrid(np.arange(right - edge), np.arange(h))
        phase = xx / max(1, curl_width)
        map_x = np.clip(edge - xx * 1.4, 0, w - 1).astype(np.float32)
        map_y = np.clip(yy + np.sin(phase * np.pi) * (yy / h - .5) * 65, 0, h - 1).astype(np.float32)
        curled = cv2.remap(previous, map_x, map_y, cv2.INTER_LINEAR).astype(np.float32)
        brightness = (.88 + .12 * np.cos(phase * np.pi))[..., None]
        output[:, edge:right] = np.clip((curled * .14 + np.array([248, 245, 235]) * .86) * brightness, 0, 255).astype(np.uint8)
    shadow_end = min(w, right + 38)
    for x in range(right, shadow_end):
        output[:, x] = (output[:, x].astype(np.float32) * (1 - .16 * (1 - (x - right) / 38))).astype(np.uint8)
    return output
