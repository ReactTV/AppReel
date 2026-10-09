# Changelog

## 0.2.1

### Recorder

- Pointer actions stay inside the recorded viewport by default; `scenario.recording.allowOffViewport`
  opts out. A target wholly inside the viewport is actionable at any size; a partly clipped one
  needs at least 28×28 CSS px visible.
- A `wait` with `holdZoomAfter` and `zoomFocus` starts a zoom stretch without a click, for
  framing playback or a reorder. It logs a focus-only entry (`focusOnly: true`) that the pacing
  check skips.
- `captureRecording` holds the last frame until capture stops by default (was opt-in via
  `holdLastFrame`). A flow ending on a still page no longer produces a clip shorter than its
  logs, which stalled the zoom render. Pass `holdLastFrame: false` to opt out.
- Inside a planned zoom stretch, a click whose target falls outside the stretch's crop (or within
  0.03 of its edge) fails the run, naming the target, the crop and the focus.
  `scenario.recording.allowOffCrop` opts out.
- `validateScenario` refuses zoom options that would silently misbehave: `holdZoomAfter` with
  `releaseZoomHold` on one click, a new `zoomFocus` inside a held stretch, zoom options on
  `waitFor`, and a zoom-starting `wait` without a focus or inside a hold.
- Optional steps whose target never appeared are marked `skipped` in `.steps.jsonl`.
- The zoom render times out with a one-line explanation when it stalls, and ffmpeg errors keep
  only the meaningful stderr lines instead of every progress update.
- The drawn cursor is installed in the top page only. Embedded iframes (video players) no longer
  each show a stray arrow at their top-left.

### Presentation

- Screens fill the room between the header and the narration: the row zooms up as well as down,
  keeping each frame's proportions. A lone 16:9 browser frame goes from about 896px to 1120px wide
  in the 1080p video. The header takes only the height of what it shows, so a video without a title
  or brand gets bigger screens, as does one without column labels. Labels stay 22px at any zoom.
- The narration zone is exactly its header and one caption line (103px, was 240px), pinned near
  the bottom of the frame, so the screens sit as close above it as they do below the title.
- Narration is one line, always: `validateScenario` refuses a step's `narration` over 70
  characters (`NARRATION_MAX_CHARS`), and the caption never wraps on stage.
- Replaces 0.2.0's stretching of an unlabeled screen's height, which letterboxed the clip instead
  of enlarging it.

### Pacing

- Reports optional steps that waited over 1s for a target that never appeared (`skipped`).
- A narration line on the step that starts a pause now carries the whole pause, as the docs
  always said; only the stretch before a pause's first line counts as dead air.
- Captures with no pointer step and no narration (the presentation's own stage recording) are
  skipped instead of reported as one long dead-air finding.

### Docs

- `effects.md`: crop bounds, the new pacing findings, and "Targeting tricky UI" (icon-only
  buttons, labels beside icons, stacked modals, optional confirms).
- `zoom.md`: the crop check and refused zoom combinations under rule 4; the measuring script
  takes screenshots.
- `create-flow`: the staged `record.mjs` template includes setup, `storageState`, tail padding,
  an outro and error handling; step 9 shows how to pull frames to check.

## 0.2.0

### Presentation

- When a screen's column `label` is empty (hidden above the frame), the device chrome's `.screen`
  region grows to fill the vertical band between the title header and narration footer instead of
  leaving a gap.
- Chrome frame tabs fall back to the URL host segment when `label` is empty but `url` is set.

## 0.1.9

### Pacing

- New `tooling/pacing.mjs <flow>/.output`: reports rushed exits (cursor leaves a click in under
  150ms), cursor jumps (under 500ms to a target), zoom pumps (1–2.5s between zoom regions) and dead
  air (over 2.5s of waits with no new narration line), naming the step each happened on.
- `record.mjs` writes `artifacts/<clip>.steps.jsonl`, every step's start and end, including
  unzoomed clicks and waits the click log never sees.
- **Changed defaults:** post-step `pause` 2500 → 350ms, cursor `moveDurationMs` 300 → 500ms, and
  `moveSteps` now derives from the move's duration (one per ~16ms) so the cursor glides at 60fps.
  Scenarios that don't set `moveDurationMs` get a slightly slower, smoother cursor; in multi-screen
  flows, recheck the sync waits on the next recording.

### Recorder and renderer

- `drag` step (`deltaX`/`deltaY`, `dragDurationMs`, `dragSteps`), with the cursor carried along.
- `releaseZoomHold` works on a `wait`, so a stretch can end after a `press` or `drag`.
- `waitFor` takes `last`, `nth` and `optional`, and names the step on a timeout.
- `level` locator option for headings.
- Glides ease between zoom levels too, instead of zooming out and straight back in.

### Docs

- `effects.md`: walkthrough / repeat / fill pacing tiers, and "Checking pacing".
- `zoom.md`: scene transitions glide or hold a ≥2.5s full-frame beat (never 1–2.5s); nav links
  between stretches take `"zoom": false`; new troubleshooting rows.
- `narration.md`: a result's line goes on the `wait` that releases the zoom.
- `create-flow` skill: the pacing check joins the definition of done; check `setup.mjs` helpers
  when the app's UI changes.

## 0.1.8

### Zoom renderer

- Ease-out quadratic zoom-in (replaces cosine) so motion does not read as frozen frames then a rush.
- Crop center tracks zoom toward `zoomFocus` (fixes edge-pin kink on off-center foci).
- Frame-aligned segment cuts (`frameAlignMs`) and `fps=` on plain segments before concat (smoother first zoom after heavy UI).
- `record.mjs`: capture timeline aligned to delivery FPS for zoom start.

### Delivery

- Default delivery FPS **30 → 60** for short UI motion (e.g. stinger transitions).

### Docs

- Expanded `tooling/references/zoom.md` (pipeline, first stretch, troubleshooting, fixed foci).
- `tooling/README.mdx`, `references/effects.md`, create/record-flow skills updated.
- Install scaffold `.appreel/README.md` and package README point at zoom reference.
