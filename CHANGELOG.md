# Changelog

## Unreleased

### Recorder

- Pointer actions stay inside the recorded viewport by default; `scenario.recording.allowOffViewport`
  opts out. A target wholly inside the viewport is actionable at any size; a partly clipped one
  needs at least 28×28 CSS px visible.
- A `wait` with `holdZoomAfter` and `zoomFocus` starts a zoom stretch without a click, for
  framing playback or a reorder. It logs a focus-only entry (`focusOnly: true`) that the pacing
  check skips.
- The drawn cursor is installed in the top page only. Embedded iframes (video players) no longer
  each show a stray arrow at their top-left.

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
