# My Voice, My Story

A full-stack storybook studio built with Next.js App Router, React, PostgreSQL, and Drizzle. Based on [itz-learningtime-oss/MY_VOICE_MY_story](https://github.com/itz-learningtime-oss/MY_VOICE_MY_story), with a new **Dynamic Split-Page Storybook Mode**.

## Web studio

- Editable multi-paragraph stories and per-page illustration uploads.
- Narration uploads and real audio-clock playback, seek, mute, and scene navigation.
- Actual image-edge tracing, progressive color reveal, and word highlighting.
- Local serif/handwritten fonts, paper styles, drawing hand and text pen controls.
- Whisper JSON / SRT imports, with transcript validation. Untimed scripts and SRT-interpolated words are explicitly labeled estimated.
- Persistent projects and media metadata in PostgreSQL via Drizzle. Project drafts are additionally cached in local storage.
- Full HD server-rendered H.264/AAC MP4, audio-backed browser WebM, or a complete portable Python render kit.
- Original image-to-whiteboard renderer and a browser classic-video mode remain available.

### Run on your PC (Windows)

1. Make sure PostgreSQL is running (service `postgresql-x64-17`).
2. Create the database once (in `psql` or pgAdmin): `CREATE DATABASE whiteboard;`
3. Copy `.env.example` to `.env` and put your postgres password in `DATABASE_URL`.
4. Install dependencies with `npm install`.
5. Apply the schema with `npx drizzle-kit push`.
6. Restore bundled fonts/images/demo audio with `python scripts/setup_assets.py`.
7. Start the app with `start.bat` (serves on http://localhost:3010).

For MP4 rendering and voice generation, install Python dependencies
(`python -m pip install -r requirements.txt`) and FFmpeg/FFprobe.
Browser WebM exports do not need Python.

### Run (generic)

1. Set `DATABASE_URL` in `.env`.
2. Install dependencies with `npm install`.
3. Apply the schema with `npx drizzle-kit push`.
4. Run `npm run dev` (or `npx next dev -p 3010`).

For MP4 rendering, install Python 3.10+, the dependencies below, and FFmpeg/FFprobe. Browser WebM exports do not need Python.

Uploaded files and render jobs live under `.data/`; mount this directory on persistent storage in production. This is a single-workspace studio, not a multi-tenant authenticated service. Add authentication and per-user authorization before exposing private media on a public multi-user deployment. Online rendering is capped at two concurrent jobs, three minutes, and twenty pages. Offline kits support longer workflows.

## Dynamic split-page Python mode

```bash
python -m pip install -r requirements.txt
python main.py --mode storybook \
  --image illustration.jpg --text script.txt --audio narration.mp3 \
  --timestamps whisper-words.json --output storybook.mp4
```

Use `--images first.jpg second.jpg third.jpg` for one image per paragraph, or `--image-dir illustrations`. A single image can be reused across all paragraphs. Separate paragraphs with a blank line.

### Layout and drawing

- Total canvas: **1920 × 1080**, 16:9.
- Left viewport: **(60, 40)–(930, 1040)**; 870 × 1000 pixels.
- Right viewport: **(990, 40)–(1860, 1040)**; 870 × 1000 pixels.
- `src/storybook_layout.py` supplies contain-fit mapping and a textured spread with rounded borders and a shaded central spine. The generated asset is `assets/storybook_spread_bg.png`.
- `src/storybook_engine.py` uses the upstream `SketchAnimator` for original-image contours, then reveals colors. Both the hand overlay and illustration are clipped to the local left surface.
- PIL measures, wraps, and renders words onto a separate right-page surface. Text automatically reduces its font size to fit. Extremely long paragraphs produce a clear error asking you to split them, never silent text loss.
- `src/page_flip.py` provides an OpenCV horizontal curl with a mirrored page back and moving shadow. It also provides an FFmpeg `rectcrop` xfade filter expression. Standard FFmpeg does not have a `pagecurl` xfade transition.

### Timing is explicit

Whisper JSON supports a top-level `words` array, a flat array, or `segments[].words`. Each entry contains `word`, `start`, and `end` in seconds. Timestamp words must match the script; invalid ranges, overlap, and mismatches are rejected.

True word-level JSON drives exact word appearance and highlighting on the original audio clock. SRT cue boundaries are honored, but word positions within multi-word cues are interpolated and therefore **estimated**. Untimed text is weighted across the audio duration and is also estimated; no forced-alignment model is silently assumed.

Page turns begin when a paragraph completes and run over the existing audio timeline for **1.0–1.5 seconds**. The incoming page uses the original absolute word timestamps throughout the transition. No transition inserts time or shifts narration. For an unobstructed turn, include at least the transition duration of natural silence between paragraphs.

### Additional flags

- `--page-turn curl|fade|none`
- `--page-turn-duration 1.2`
- `--paper-style ivory|white|warm`
- `--storybook-font assets/fonts/storybook.ttf`
- `--text-pen`
- `--no-highlight`
- `--no-hand`
- `--sketch-speed 1.5`
- `--fps 24|25|30|60`
- `--progress-json`
- `--overwrite`

The encoder streams frames to FFmpeg, preserves decoded PCM sample timing, verifies dimensions, frame count, H.264 video, AAC audio, and duration with FFprobe, and atomically publishes the result. It also writes a `.manifest.json` beside the MP4.

## Verification

```bash
python -m unittest discover -s tests -p 'test_storybook.py' -v
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

The Python test suite includes a real 1920 × 1080, 24 FPS, two-page MP4 export and verifies both video and audio streams, plus viewport isolation, timestamp formats, invalid inputs, and transition endpoints.

The included narration is explicitly a **synthetic eSpeak demo**, generated with SSML audio-clock marks. Your uploaded narration is never replaced or synthesized. Illustrations are generated for this studio. Fonts are local, open-source OFL fonts. See `UPSTREAM-LICENSE.txt`, `assets/LICENSE.md`, and `assets/fonts/` for licenses.
