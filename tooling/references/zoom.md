# Zoom and glide

**This is the only place zoom and glide rules live.** Read it before writing a scenario's steps.
When a run teaches something new about zoom, add it here, not to a skill, a flow README or
[`effects.md`](./effects.md), which only point back. A flow's own README records that flow's zoom
plan (which stretches, which foci), never the general rules.

Zoom is planned from the page layout before the first run, not tuned after it: [the model](#the-model),
[the rules](#rules), [the procedure](#procedure), then the [options and defaults](#reference-options-and-defaults)
the rules are built from.

## The model

- A zoom is a **crop**, by default **1.5x**: two thirds of the viewport on each axis, centered on
  a focus `(cx, cy)` (0 to 1, normalized to the viewport). The crop can't leave the frame, so a
  focus only has an effect between **0.33 and 0.67** on each axis at 1.5x. `0.33` means the crop
  touches the left/top edge; anything lower is the same crop.
- **Zoom level** (`zoomScale`) is set per scenario or per stretch, from just above 1 to 4. A crop at
  scale `s` is `1/s` of the viewport on each axis, and a focus has an effect between `0.5/s` and
  `1 - 0.5/s`: at 2x the crop is half the viewport and the range is `0.25..0.75`; at 1.25x it is 80%
  and `0.4..0.6`. Go above 1.5x when the stretch's targets are small and close together (a lone
  form field in the middle of an empty page); stay at or below it when they are spread out.
- The UI is laid out in fixed CSS pixels, so the same normalized crop frames more or less of it at
  different viewports. Every focus in this doc is calibrated for a **1920x1080** viewport, which is
  why every desktop scenario sets exactly that (phone scenarios are the exception). It is also the
  recorder's default, but write it out anyway.
- A **stretch** is one zoom-in → zoom-out cycle: a run of consecutive steps that share one crop.
  Plan in stretches, not clicks.
- Every zoom-in and zoom-out costs ~0.6s. Out-then-in between two stretches is 1.2s of the viewer
  looking at the whole page, and reads as pumping when both stretches are in the same area.
- A **glide** is what the renderer does when two stretches are less than 1s apart: the crop slides
  from one focus to the next instead of zooming out and in. It is a fallback for moving between
  *different* areas, not a tool for staying in one. The slide starts a beat (400ms) after the click
  that ends the first stretch, so the order the viewer sees is: zoom in, cursor arrives, click,
  then the view moves.

## Rules

1. **One stretch per screen area.** A stretch continues while the next target, including anything it
   opens (menu, popover, dialog, the page a link loads), fits in the same crop. Start a new one only
   when it can't fit or the scene changes.
2. **Test fit, not distance.** Measure the normalized box of every element the stretch touches plus
   the popups they open. If the union is at most ~0.6 wide and ~0.6 tall at 1.5x (the margin keeps
   targets off the crop edge; in general ~`0.9/s` at scale `s`, so ~0.45 at 2x), it is one stretch,
   however many "beats" the steps feel like: name field → URL → width → height → OK, or sidebar item
   → the page it opens → the URL on that page → its context menu. The focus is the center of the
   union, clamped to the scale's range (`0.33..0.67` at 1.5x). A union much smaller than the crop is
   the sign to raise the stretch's `zoomScale`.
3. **Split only when it doesn't fit,** at a natural boundary: a dialog opens, the page changes, or
   attention moves to another region. Then choose the transition:
   - the next stretch follows directly from the last (menu → the dialog it opens): let it **glide**,
     which happens on its own when the gap is under 1s.
   - a new scene (a different page, after a load): put a `wait` of ~600ms between them so the gap is
     over 1s and the view zooms fully out and back in.

   Never leave a gap of 1 to ~3s between two stretches in the same area. If they fit in one crop,
   rule 2 already says to merge them.
4. **The focus goes on the first step only.** First step: `holdZoomAfter: true` and `zoomFocus`.
   Middle steps: neither, they inherit. Last step: `releaseZoomHold: true`. A different `zoomFocus`
   mid-stretch is a new stretch, so make it one deliberately or don't. The only link between a focus
   and its step's own target is that the target must sit inside the crop (at least ~0.03 from the
   crop edge), or the cursor arrives off screen. Older flows repeat `holdZoomAfter` and `zoomFocus` on
   every step of a stretch; that is harmless, but write them once.
5. **Don't hold across waiting.** Release before a wait longer than ~2.5s (a load, a process, "watch
   the other screen") and start a new stretch after it. A click that only triggers something you
   watch elsewhere takes `"zoom": false`.
6. **Planned stretches don't use auto-continuity.** [Auto-merge](#auto-continuity) joins clicks by
   pointer distance and its focus follows the pointer, so the union isn't guaranteed to fit. It is
   what a scenario with no hold options gets, which makes it the right draft run. Once a stretch has
   a hold, it needs nothing else, and `zoomBreak` only matters in a draft.
7. **Large targets get no zoom.** Zoom is for legibility. A click on something already big and clear
   at full frame (a CAM tile, about 15% of the viewport or more in both directions) takes
   `"zoom": false`; zooming in on it only adds a zoom-in/out for nothing. The next small target
   (the sidebar's Add content button) then gets its own zoom.
8. **Some stretches are fixed.** Once you've calibrated a focus for a piece of UI that appears in
   more than one flow (a settings modal, a dialog that always centers itself), record it in the
   [table below](#fixed-foci) and use it exactly as written every time, instead of recomputing a
   new one per flow.

```json
{ "action": "click", "text": "Open settings",
  "holdZoomAfter": true, "zoomFocus": { "cx": 0.5, "cy": 0.2 } },
{ "action": "type", "selector": "[placeholder=\"Name\"]", "text": "…" },
{ "action": "click", "role": "button", "name": "Save", "releaseZoomHold": true }
```

### Fixed foci

Calibrated at 1920x1080, in normalized coordinates. Recheck one if that page's layout changes.
Empty until your project has flows to calibrate from — fill it in as you go, one row per piece of
recurring UI:

| Layout | Focus | Frames |
|---|---|---|
| *(e.g. a settings modal that always centers itself)* | `0.5, 0.5` | *(the whole modal)* |

A stretch inside a centered dialog or modal frames the dialog itself when it fits the crop, rather
than the center of the targets in it.

## Procedure

1. **Plan.** List the stretches: which steps, one focus, one line on why. Keep the list in the
   flow's README under a "Zoom plan" heading so later edits start from it.
2. **Measure.** For each stretch, get the normalized boxes of its targets. Either run a draft
   scenario with no hold options and read each click's `cx`/`cy` from `artifacts/*.clicks.jsonl`
   (pointer positions, nothing set by you yet), or measure directly. Popups a step opens aren't in the click
   log, so include them by hand. To measure directly, drive the page with a scratch script in
   `.scratchpad/`:

   ```js
   import { chromium } from "playwright";
   const browser = await chromium.launch();
   const ctx = await browser.newContext({
     viewport: { width: 1920, height: 1080 },
     storageState: ".appreel/auth/<account>.auth.json", // omit when anonymous
   });
   const page = await ctx.newPage();
   await page.goto(START_URL);
   const { width: w, height: h } = page.viewportSize();
   const box = async (name, loc) => {
     const r = await loc.first().boundingBox();
     console.log(name, { x: [r.x / w, (r.x + r.width) / w], y: [r.y / h, (r.y + r.height) / h] });
   };
   // perform the flow's steps, calling box() at each state you need to frame
   ```

3. **Write.** First step of each stretch gets the focus and hold, last gets the release (rule 4).
4. **Run and verify.**

   Run it for every screen's clip in a multi-screen flow (e.g. `<name>-desktop`, `<name>-mobile`):

   ```bash
   cd .appreel/flows/<name>/.output && node -e '
   const z = JSON.parse(require("fs").readFileSync("artifacts/<name>-desktop.zooms.json", "utf8")).suggestions;
   z.forEach((s, i) => console.log(i, s.start, s.end, s.focus.cx.toFixed(2), s.focus.cy.toFixed(2),
     i ? "gap " + (s.start - z[i - 1].end) : ""));'
   ```

   - one region per planned stretch, no more (a hold can show up as two or three regions with the
     same start and focus; the renderer merges them, so count them once)
   - every gap under 1s is a deliberate glide between different areas
   - no gap of 1 to ~3s between regions in the same area
   - no region runs across a wait where nothing happens
   - every focus is within its scale's range (`0.33..0.67` at the default 1.5x), and every region's
     `scale` is the one planned

   Then confirm the crop itself. Grab frames inside a stretch and check they show the same crop with
   every target in view:

   ```bash
   ffmpeg -ss 8.0 -i <name>-desktop.mp4 -frames:v 1 -vf scale=720:-1 frame.png
   ```

   To check a glide's order, grab a frame every 60ms around the click that starts it, with the
   timestamp drawn on (`-vf "scale=480:-1,drawtext=text=32.06:fontcolor=yellow:fontsize=20"`), and
   tile them. The crop should hold still until the click ring has appeared. Video time runs a few
   hundred ms behind the times in `.clicks.jsonl`, so read the video, not the log, when judging it.

5. **Recheck the sync waits.** Holding a zoom removes the zoom-out and zoom-in sleeps, so steps
   finish sooner. In a multi-screen flow that shifts every later beat: re-read every screen's
   `.clicks.jsonl` files and adjust the waits documented in the flow's README until the beats and
   clip lengths line
   up again.

## Worked example

A first pass with the zoom planned per click typically needs hand-fixing at least once or twice —
these are real lessons from doing that:

| Before | After |
|---|---|
| A sidebar-item click zoomed there, then glided to a copy field, held there for the copy | one stretch from the click through the copy: the sidebar item, field and context menu all fit |
| A settings dialog: a name-field zoom, small glide, then a separate zoom on the confirm button | one stretch from the name field through the confirm click: the whole dialog |
| A list-tile click zoomed in on a tile already a fifth of the screen, then glided to a modal | `"zoom": false` on the tile (rule 7); the modal gets its own zoom |
| The glide into a modal started before the click that opened it was visible | the renderer starts every glide 400ms after the click (`ZOOM_GLIDE_HOLD_MS`), not at it |
| A 5s pause between typing a value and the page reacting to it | the recorder looked ahead for a button that only appears once the value is valid; it no longer looks ahead inside a held stretch |
| A modal at 1440x810 cropped itself and the sidebar together | the scenario moved to 1920x1080, where a fixed `0.5, 0.2` frames it (rule 8) |

Both merges were rule 2: the union of targets fit in one crop, so there was nothing to glide
between. The one glide left, from the Add Source menu (bottom left) into its dialog, is rule 3: the
two areas are too far apart for one crop.

## Reference: options and defaults

Zoom on or off for a whole scenario is `effects.zoom` in [`effects.md`](./effects.md). Everything
else is here.

| Option | Where | Effect |
|---|---|---|
| `holdZoomAfter: true` | step | Keep the crop after this click instead of zooming out |
| `releaseZoomHold: true` | step | Zoom out after this step. Works whether or not a hold is active |
| `zoomFocus: { cx, cy }` | step | Frame this point instead of following the pointer. Stays active until the hold is released |
| `zoomScale` | step or scenario | Zoom level, above 1 up to 4 (default 1.5). On a step, it sets the stretch that step starts, and the steps it holds through inherit it; on the scenario, it is the default for every stretch. Regions at different levels never glide into each other: the first zooms out before the next zooms in |
| `zoom: false` | step | No zoom for this click at all |
| `zoomBreak: true` / `zoomContinuity: false` | step | Stop [auto-merge](#auto-continuity) joining this click to the next. Does **not** release a hold |
| `zoomInMs` / `zoomOutMs` | step or scenario | Zoom-in / zoom-out duration (default 600) |
| `zoomContinuity: false` | scenario | Every click gets its own zoom |
| `zoomMergeDist` / `zoomMergeGapMs` | scenario | Auto-merge limits (default 0.35 and 2500) |

`goto` clears any held zoom. `press` breaks auto-continuity (a keyboard shortcut is a new context).
A step's own `zoomInMs` is skipped when a hold is already active, since there is nothing to zoom into.

### Auto-continuity

A click with no hold options still merges with the next one. The recorder looks ahead to the next
click, skipping `wait` and `waitFor`, and keeps the zoom held when the next target is within
**`zoomMergeDist`** (default 0.35, normalized to the viewport diagonal) and the `wait` steps between
the two sum to at most **`zoomMergeGapMs`** (default 2500). The merged region's focus follows the
pointer, which is why it suits a draft run and not a planned stretch (rule 6).

That look-ahead waits up to 5s for the next step's target to be visible, so on a click that is not
already inside a held stretch, a next target that only appears *because of this step* stalls the
video for the full 5s. Setting `holdZoomAfter` or `releaseZoomHold` on the step skips the look-ahead.
Inside a held stretch it is skipped automatically.

Auto-continuity and a manual hold both mark the click log with `holdZoom`, so `suggest-zooms.mjs`
renders one region either way. Spatial merging also applies when re-rendering an older
`.clicks.jsonl` that lacks the flag.

### Gliding

When one zoom region ends less than **1 second** before the next begins, the renderer stays zoomed
and slides the crop from the first region's focus to the next one's, over about as long as the
zoom-out plus zoom-in it replaces, and done by the time the next region would have been fully in.
It starts `ZOOM_GLIDE_HOLD_MS` (400ms) after the previous region's last click rather than at it:
frames reach the video a few hundred ms after the click that made them, so a slide timed to the
click itself would start before the viewer has seen it land. The threshold is `ZOOM_GLIDE_GAP_MS`
in `render-auto-zoom.mjs`. Regions further apart zoom fully out in between. Nothing in the scenario
switches this on: to keep a step out of it, give it `"zoom": false` or leave more than a second
before the next zoom.
