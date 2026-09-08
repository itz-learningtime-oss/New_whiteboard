"""Multi-Scene Panning Engine & Virtual Infinite Canvas for Whiteboard Animation.

Manages coordinate systems, camera trajectory, smooth panning, and viewport
rendering across an infinite whiteboard canvas (3840x1080 or larger):

┌──────────────────────────────┬──────────────────────────────┐
│ Scene 1 (X: 0 -> 1920)       │ Scene 2 (X: 1920 -> 3840)    │
│ [Draw Sketch 1] ───────────► │ [Camera Pans Right] ───────► │ [Draw Sketch 2]
└──────────────────────────────┴──────────────────────────────┘
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence
try:
    import numpy as np
except ImportError:
    np = None  # type: ignore


@dataclass(frozen=True)
class CameraPose:
    """Position and magnification of the camera in virtual canvas space."""
    x: float
    y: float
    zoom: float = 1.0


@dataclass(frozen=True)
class SceneOrigin:
    """Placement coordinates of a scene within the virtual infinite canvas."""
    index: int
    x: float
    y: float
    width: float
    height: float
    label: str = ""


def smoothstep(t: float) -> float:
    """Hermite smoothstep interpolation (zero first derivatives at endpoints)."""
    clamped = max(0.0, min(1.0, t))
    return clamped * clamped * (3.0 - 2.0 * clamped)


class CanvasCamera:
    """
    Virtual Infinite Canvas Camera orchestrator.

    Positions multiple sketch scenes in an unbounded coordinate plane (e.g., 3840x1080
    for 2 1080p scenes panning right, or Nx1080 for N scenes). Computes smooth continuous
    camera motion across scene boundaries and extracts 1920x1080 viewport frames.
    """

    def __init__(
        self,
        scene_count: int,
        durations: Sequence[float],
        transition_duration: float = 1.2,
        pan_mode: str = "pan_right",
        scene_width: int = 1920,
        scene_height: int = 1080,
    ):
        if scene_count <= 0:
            raise ValueError("Scene count must be at least 1.")
        if len(durations) != scene_count:
            raise ValueError("Durations length must match scene count.")

        self.scene_count = scene_count
        self.durations = list(durations)
        self.transition_duration = max(0.2, min(4.0, transition_duration))
        self.pan_mode = pan_mode
        self.scene_width = scene_width
        self.scene_height = scene_height

        # Calculate scene origins on the infinite plane
        self.origins: list[SceneOrigin] = []
        if pan_mode == "pan_down":
            for i in range(scene_count):
                self.origins.append(
                    SceneOrigin(i, 0, i * scene_height, scene_width, scene_height, f"Scene {i+1}")
                )
            self.virtual_width = scene_width
            self.virtual_height = max(scene_height, scene_count * scene_height)
        elif pan_mode == "grid":
            cols = math.ceil(math.sqrt(scene_count))
            rows = math.ceil(scene_count / cols)
            for i in range(scene_count):
                col = i % cols
                row = i // cols
                self.origins.append(
                    SceneOrigin(i, col * scene_width, row * scene_height, scene_width, scene_height, f"Scene {i+1}")
                )
            self.virtual_width = cols * scene_width
            self.virtual_height = rows * scene_height
        else:  # Default: pan_right (horizontal strip: X: 0 -> 1920 -> 3840 ...)
            for i in range(scene_count):
                self.origins.append(
                    SceneOrigin(i, i * scene_width, 0, scene_width, scene_height, f"Scene {i+1}")
                )
            self.virtual_width = max(scene_width, scene_count * scene_width)
            self.virtual_height = scene_height

        # Calculate timing segments
        self.timeline_segments: list[dict] = []
        cur_time = 0.0
        for i in range(scene_count):
            draw_dur = max(0.1, self.durations[i])
            self.timeline_segments.append({
                "type": "draw",
                "scene_index": i,
                "start": cur_time,
                "end": cur_time + draw_dur,
                "duration": draw_dur,
            })
            cur_time += draw_dur

            # Camera pan between scenes
            if i < scene_count - 1:
                pan_dur = self.transition_duration
                self.timeline_segments.append({
                    "type": "pan",
                    "from_scene": i,
                    "to_scene": i + 1,
                    "start": cur_time,
                    "end": cur_time + pan_dur,
                    "duration": pan_dur,
                })
                cur_time += pan_dur

        self.total_duration = cur_time

    def pose_at_time(self, time: float) -> CameraPose:
        """Computes camera viewport position (top-left) in virtual canvas coords."""
        t = max(0.0, min(self.total_duration, time))

        for seg in self.timeline_segments:
            if seg["start"] <= t <= seg["end"] or seg == self.timeline_segments[-1]:
                if seg["type"] == "draw":
                    orig = self.origins[seg["scene_index"]]
                    return CameraPose(x=float(orig.x), y=float(orig.y), zoom=1.0)
                else:
                    # Camera is panning from from_scene to to_scene
                    prog = (t - seg["start"]) / max(0.001, seg["duration"])
                    eased = smoothstep(prog)
                    from_orig = self.origins[seg["from_scene"]]
                    to_orig = self.origins[seg["to_scene"]]
                    cur_x = from_orig.x + (to_orig.x - from_orig.x) * eased
                    cur_y = from_orig.y + (to_orig.y - from_orig.y) * eased
                    return CameraPose(x=float(cur_x), y=float(cur_y), zoom=1.0)

        last_orig = self.origins[-1]
        return CameraPose(x=float(last_orig.x), y=float(last_orig.y), zoom=1.0)

    def active_scene_info(self, time: float) -> dict:
        """Returns metadata about the active scene, pan progress, and status."""
        t = max(0.0, min(self.total_duration, time))
        for seg in self.timeline_segments:
            if seg["start"] <= t <= seg["end"] or seg == self.timeline_segments[-1]:
                if seg["type"] == "draw":
                    prog = (t - seg["start"]) / max(0.001, seg["duration"])
                    return {
                        "active_scene": seg["scene_index"],
                        "is_panning": False,
                        "pan_progress": 0.0,
                        "draw_progress": prog,
                    }
                else:
                    prog = (t - seg["start"]) / max(0.001, seg["duration"])
                    return {
                        "active_scene": seg["to_scene"],
                        "from_scene": seg["from_scene"],
                        "is_panning": True,
                        "pan_progress": prog,
                        "draw_progress": 1.0,
                    }

        return {
            "active_scene": self.scene_count - 1,
            "is_panning": False,
            "pan_progress": 1.0,
            "draw_progress": 1.0,
        }

    def render_viewport(
        self,
        virtual_canvas: np.ndarray,
        pose: CameraPose,
        out_width: int = 1920,
        out_height: int = 1080,
    ) -> np.ndarray:
        """
        Crops and renders the 1920x1080 camera view from the virtual infinite canvas.
        Handles boundary clipping and floating point camera translations cleanly.
        """
        h, w = virtual_canvas.shape[:2]
        cam_x = int(round(pose.x))
        cam_y = int(round(pose.y))

        # Destination frame initialized with background paper color
        out_frame = np.full((out_height, out_width, 3), 255, dtype=np.uint8)

        src_x1 = max(0, min(w, cam_x))
        src_y1 = max(0, min(h, cam_y))
        src_x2 = max(0, min(w, cam_x + out_width))
        src_y2 = max(0, min(h, cam_y + out_height))

        dst_x1 = max(0, -cam_x)
        dst_y1 = max(0, -cam_y)
        dst_x2 = dst_x1 + (src_x2 - src_x1)
        dst_y2 = dst_y1 + (src_y2 - src_y1)

        if src_x2 > src_x1 and src_y2 > src_y1 and dst_x2 > dst_x1 and dst_y2 > dst_y1:
            out_frame[dst_y1:dst_y2, dst_x1:dst_x2] = virtual_canvas[src_y1:src_y2, src_x1:src_x2]

        return out_frame
