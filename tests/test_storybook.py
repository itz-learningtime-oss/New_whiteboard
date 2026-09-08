"""Geometry, timing, isolation, page-turn, and real H.264/AAC integration tests."""
import json
import tempfile
import unittest
import wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from src.storybook_layout import WIDTH, HEIGHT, LEFT, RIGHT, make_background
from src.storybook_engine import StorybookEngine, load_word_timings, export_storybook
from src.page_flip import page_turn, xfade_filter

class StorybookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="storybook-tests-")
        cls.root = Path(cls.temp.name)
        cls.image = cls.root / "illustration.png"
        image = Image.new("RGB", (500, 650), "#f8f5eb")
        draw = ImageDraw.Draw(image)
        draw.rectangle((60, 220, 440, 570), fill="#a8b997", outline="#374d35", width=5)
        draw.polygon(((35, 225), (250, 60), (465, 225)), fill="#bc9a71", outline="#655642", width=5)
        draw.rectangle((210, 390, 300, 570), fill="#7d9169", outline="#374d35", width=5)
        draw.ellipse((340, 280, 405, 350), fill="#eadb95", outline="#6b6240", width=4)
        image.save(cls.image)
        cls.script = "Hello little world.\n\nA new day."
        cls.text = cls.root / "script.txt"; cls.text.write_text(cls.script)
        cls.words = [{"word": w, "start": s, "end": e} for w, s, e in [
            ("Hello", .1, .5), ("little", .5, .9), ("world.", .9, 1.3),
            ("A", 2.5, 2.7), ("new", 2.7, 3.1), ("day.", 3.1, 3.8)]]
        cls.timings = cls.root / "words.json"; cls.timings.write_text(json.dumps({"segments": [{"words": cls.words}]}))
        cls.audio = cls.root / "audio.wav"
        sample_rate = 48000
        t = np.arange(sample_rate * 4) / sample_rate
        tone = (np.sin(t * 2 * np.pi * 330) * 1600).astype(np.int16)
        with wave.open(str(cls.audio), "wb") as audio:
            audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(sample_rate); audio.writeframes(tone.tobytes())
        cls.engine = StorybookEngine([cls.image], cls.script, 4, cls.timings, hand=True, text_pen=True)

    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()

    def test_exact_geometry(self):
        self.assertEqual((WIDTH, HEIGHT), (1920, 1080))
        self.assertEqual(LEFT.box, (60, 40, 930, 1040))
        self.assertEqual(RIGHT.box, (990, 40, 1860, 1040))
        for point in [(0, 0), (1600, 900), (-500, 7000)]:
            x, y = LEFT.map_point(point, (1600, 900))
            self.assertTrue(60 <= x < 930 and 40 <= y < 1040)

    def test_fits_portrait_and_landscape_without_distortion(self):
        for dimensions in [(200, 100), (100, 400)]:
            fitted = LEFT.fit(Image.new("RGB", dimensions, "red"))
            self.assertEqual(fitted.size, (870, 1000))

    def test_word_timestamps_preserved(self):
        words, source = load_word_timings(self.timings, self.script, 4)
        self.assertEqual(source, "word-level")
        self.assertEqual([w.start for w in words], [w["start"] for w in self.words])
        self.assertEqual([w.end for w in words], [w["end"] for w in self.words])
        self.assertEqual(self.engine.spreads[1].start, 1.3)
        self.assertEqual(self.engine.spreads[1].words[0].start, 2.5)

    def test_srt_is_explicitly_estimated(self):
        path = self.root / "subtitles.srt"
        path.write_text("1\n00:00:00,000 --> 00:00:01,300\n<i>Hello</i> little world.\n\n2\n00:00:02,500 --> 00:00:03,800\nA new day.\n")
        words, source = load_word_timings(path, self.script, 4)
        self.assertEqual(source, "srt-interpolated")
        self.assertEqual(len(words), 6)
        self.assertEqual(words[3].start, 2.5)

    def test_mismatched_transcript_rejected(self):
        with self.assertRaisesRegex(ValueError, "do not match"):
            load_word_timings(self.timings, "A different script.", 4)

    def test_invalid_word_times_rejected(self):
        path = self.root / "bad.json"
        path.write_text(json.dumps({"words": [{"word": "Hello", "start": 1, "end": .5}]}))
        with self.assertRaises(ValueError): load_word_timings(path, "Hello", 4)

    def test_page_drawing_and_hand_are_isolated(self):
        background = np.asarray(self.engine.background)
        mask = np.ones((HEIGHT, WIDTH), dtype=bool)
        mask[40:1040, 60:930] = False; mask[40:1040, 990:1860] = False
        for time in [0, .3, .8, 1.3]:
            frame = self.engine.spread_frame(0, time)
            self.assertEqual(frame.shape, (1080, 1920, 3))
            np.testing.assert_array_equal(frame[mask], background[mask])
        # Text on the right cannot be affected by the left-page hand setting.
        other = StorybookEngine([self.image], self.script, 4, self.timings, hand=False, text_pen=True)
        np.testing.assert_array_equal(self.engine.spread_frame(0, .5)[40:1040, 990:1860], other.spread_frame(0, .5)[40:1040, 990:1860])

    def test_turn_endpoints_and_xfade(self):
        a = np.zeros((100, 200, 3), np.uint8); b = np.full_like(a, 240)
        np.testing.assert_array_equal(page_turn(a, b, 0), a)
        np.testing.assert_array_equal(page_turn(a, b, 1), b)
        self.assertEqual(page_turn(a, b, .5).shape, a.shape)
        self.assertIn("rectcrop", xfade_filter(3, 1.2))
        with self.assertRaises(ValueError): xfade_filter(0, 2)

    def test_export_preserves_estimated_source_label(self):
        path = self.root / "estimated.json"
        path.write_text(json.dumps({"words": self.words, "timing_source": "estimated"}))
        _, source = load_word_timings(path, self.script, 4)
        self.assertEqual(source, "estimated")

    def test_manifest_cannot_overwrite_input_timestamps(self):
        path = self.root / "protected.manifest.json"
        original = json.dumps({"words": self.words})
        path.write_text(original)
        with self.assertRaisesRegex(ValueError, "overwrite an input"):
            export_storybook([self.image], self.text, self.audio, self.root / "protected.mp4", timestamps=path, hand=False)
        self.assertEqual(path.read_text(), original)

    def test_end_to_end_render_has_verified_video_and_audio(self):
        output = self.root / "storybook.mp4"
        manifest = export_storybook([self.image], self.text, self.audio, output, timestamps=self.timings, fps=24, hand=False)
        self.assertTrue(output.is_file())
        self.assertEqual(manifest["width"], 1920)
        self.assertEqual(manifest["height"], 1080)
        self.assertEqual(manifest["frame_count"], 96)
        self.assertEqual(manifest["video_codec"], "h264")
        self.assertEqual(manifest["audio_codec"], "aac")
        self.assertAlmostEqual(manifest["audio_duration"], 4, places=3)
        self.assertEqual(manifest["pages"], 2)
        self.assertEqual(manifest["timing_source"], "word-level")

if __name__ == "__main__": unittest.main(verbosity=2)
