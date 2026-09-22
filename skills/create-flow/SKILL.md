---
name: create-flow
description: >-
  Creates a new recording flow (a scripted video of the React.tv app with
  cursor, zoom, on-screen narration and music) under `.recordings/flows/<name>/`,
  or edits an existing one — scenarios, setup, record script, README, sign-in
  session. Use when the user wants to make a new tutorial/demo/marketing video
  flow, change what a flow does, fix a flow whose UI targets broke, or invokes
  /create-flow. To just re-run an existing flow, use `record-flow`.
---

# Create flow

Tooling lives in `.recordings/tooling/` (shared, vendored). Read
[`tooling/README.mdx`](../../tooling/README.mdx) first — it's
the canonical reference for prerequisites, scenario JSON, and output quality. This skill is the
authoring workflow on top of it. Once a flow exists, recording it is `record-flow`'s job.

## The north star

**`embed-channel-in-obs` is the model.** Every flow should look and behave like its video, and its
folder is the one to copy. What that means, each with the one file that holds its rules (this skill
never restates them; when a run teaches something new, edit that file):

| The video has | Rules |
|---|---|
| A **1920x1080** desktop viewport (phone scenarios excepted), so every zoom focus is calibrated | [`zoom.md`](../../tooling/references/zoom.md) |
| **Steady zoom**: one crop per screen area, no in-and-out pumping, a glide only between areas too far apart for one crop, the same fixed zoom for the Add content modal every time | [`zoom.md`](../../tooling/references/zoom.md) |
| **Narration** under the devices: a yellow line per beat; an auto-numbered "Step N" header over the setup; a white "See it in action" section for the demonstration; a yellow payoff line at the end | [`narration.md`](../../tooling/references/narration.md) |
| A **glow** on the monitor each line is about, moving between screens as the story does | [`narration.md`](../../tooling/references/narration.md#focus) |
| Quiet **background music**, added automatically | [tooling README](../../tooling/README.mdx#music) |
| **Viewer-paced** steps: nothing dead, values nobody reads entered fast, waits only as long as the page needs | [`effects.md`](../../tooling/references/effects.md#pacing) |
| Two sides that **stay in sync**, and clips of equal length | the flow's README ([`zoom.md`](../../tooling/references/zoom.md#procedure) step 5) |

The [definition of done](#9-verify-with-a-real-run) is one checklist over all of it.

## The folder contract

Every flow is `.recordings/flows/<name>/` (kebab-case, named for what the video shows):

| File | Purpose |
|---|---|
| `<role>.scenario.json` | Start URL + every step. One per screen: `broadcaster`, `viewer`, or just `main` for single-screen. |
| `setup.mjs` | Optional. Only for flow-specific state the shared reset (`.recordings/shared/reset-channel-state.mjs`) doesn't cover. Exports one async function. |
| `record.mjs` | Always. Runs setup, records, composes if side-by-side. **This is the only thing `record-flow` runs.** |
| `README.md` | Always. The flow's plan (zoom, narration, sync), what it needs, how to re-run. |
| `.output/` | Generated videos, plus an `artifacts/` subfolder for the click/zoom/narration logs each run writes. Gitignored; the recorder creates it. |

Sign-in sessions are **not** per flow — they live in `.recordings/auth/<account>.auth.json`
(gitignored) and are shared.

## Creating a flow

### 1. Pick the shape

- **Side-by-side** — the norm: "broadcaster changes something, here's what the viewer (or OBS)
  sees". Two scenarios recorded in sync, then composited onto the stage: a monitor on the left and
  a phone or a second monitor (`rightFrame: "window"`, for a desktop app) on the right. Only this
  shape gets narration, the header and the glow.
- **Single screen** — a plain walkthrough: one scenario, one recording. It gets zoom and music but
  has no stage, so no narration. If the video needs to explain itself, make it side-by-side.

### 2. Prerequisites

```bash
node .recordings/tooling/record.mjs --check-prereqs
```

The dev server must be running (`npm run dev`, `localhost:3000`).

### 3. Get a signed-in session, if needed

`record.mjs` never takes credentials. Write a one-off Playwright script following
[`tooling/references/auth.md`](../../tooling/references/auth.md)
and save the `storageState` to `.recordings/auth/<account>.auth.json`. **Never commit it** — it
can impersonate whoever signed in. If a suitable session already exists in `.recordings/auth/`,
reuse it. Anonymous scenarios (e.g. a viewer) skip this step.

### 4. Plan the video

Before writing a single step, put the plan in the flow's `README.md`. It is the flow's spec, and
later edits start from it:

1. **The story.** What does the viewer end up able to do? List the setup steps, the result they
   produce, any demonstration that shows it working, and the payoff. This is the shape narration
   follows ([the pattern](../../tooling/references/narration.md#the-pattern)).
2. **The zoom plan.** One line per stretch: which steps, one focus, why. Measure the real page
   first ([`zoom.md`](../../tooling/references/zoom.md#procedure)).
3. **The narration plan.** One row per line: its text, kind (setup, result, demonstration,
   payoff), header, tone and monitor. Beats and stretches usually line up.

### 5. Write the scenario(s)

Step and effects reference:
[`tooling/references/effects.md`](../../tooling/references/effects.md).

- **Viewport:** every desktop scenario sets `"viewport": { "width": 1920, "height": 1080 }`. Write
  it out even though it is the recorder's default; only phone scenarios (`"device": "phone"`) use
  another size.
- **Locators:** prefer `role`/`text`/`label` over CSS selectors; they survive UI changes better.
- **Captions off:** `"effects": { "captions": false }`. The on-page captions stay off; the text
  viewers read is the presentation's narration.
- **Zoom:** hold, focus and release each stretch as planned, and use the fixed focus wherever the
  Add content modal appears ([`zoom.md`](../../tooling/references/zoom.md)).
- **Narration:** add `narration` (and `narrationHeader`, `narrationStyle`, `narrationFocus`) to the
  steps the plan says
  ([`narration.md`](../../tooling/references/narration.md)). It must never change a step's own
  timing: fix a narration warning in the text, not by adding waits.
- **Pacing:** nothing dead, values nobody reads entered fast
  ([`effects.md`](../../tooling/references/effects.md#pacing)).
- **Content videos:** when a flow needs a video to add or play, pick from
  [`stock-videos.md`](../../stock-videos.md) and never use the same one twice in one recording.

Copy the shape of a working scenario: `.recordings/flows/embed-channel-in-obs/` for a desktop side
and a desktop-app side, `.recordings/flows/broadcaster-first-content/` for a signed-in desktop one
and an anonymous phone one (`"device": "phone"`).

### 6. Reset app state

Every signed-in flow starts by calling the shared reset from its `record.mjs`:

```js
import { resetChannelState } from "../../shared/reset-channel-state.mjs";

await resetChannelState(); // empties Feed 1 and Feed 2 default queues
```

It takes `{ feeds, channelSlug, account }` (defaults: `[1, 2]`, `content-creator-television`,
`broadcaster`). Only add a flow-specific `setup.mjs` for state it doesn't cover, and if a second
flow needs the same thing, extend the shared reset instead.

A flow that leaves state behind (a scheduled queue, a fallback, a slot assignment) must clean it up
in a way that still works **on a different day**. Anything scheduled for a time goes live once that
time passes, and the Queues tab names it differently by then (a queue for "Sep 22 noon" is listed
as just "@ 12:00 PM" on Sep 22). Match on what stays the same, and delete leftovers *before*
changing slots: a live queue makes the cam "actively playing", and every slot change then asks for
confirmation.

### 7. Write `record.mjs`

**Side-by-side:** copy the closest of `.recordings/flows/embed-channel-in-obs/record.mjs` (a desktop
side and a desktop-app side, with `rightFrame: "window"`) and
`.recordings/flows/broadcaster-first-content/record.mjs` (a desktop side and a phone), and adapt.
Don't simplify away the structure: both sides must go through `prepareRecording()` first, then
`captureRecording()` together behind a `createRecordingSyncBarrier`, because a signed-in session
restore takes much longer than an anonymous page load and recording each side independently
drifts by seconds once composited. Write-up:
[`dual-screen-recording-poc.ai.mdx`](../../../docs/MARKETING/TUTORIAL_VIDEOS/dual-screen-recording-poc.ai.mdx#follow-up-wall-clock-sync-between-the-two-recordings).
Give every side-by-side flow a `header` option on `composePresentation` — a short one-line title
for what the video shows (e.g. `"Add Your First Piece of Content"`). It renders top-center under
the React.tv branding, above the labels, always in title case (the stage enforces it; write it
that way in `record.mjs` too); omit it and only the branding shows. Labels are the
`labelLeft`/`labelRight` options ("Broadcaster", "OBS", "Viewer"): they name the monitors the
narration's glow lights. Narration and music need nothing in `record.mjs`: `composePresentation`
reads the narration files beside the clips and adds the music, so never pass `music: false`. Layout
is plain CSS in
[`tooling/presentation/stage.html`](../../tooling/presentation/stage.html) (rationale:
[`dual-screen-recording-poc.ai.mdx`](../../../docs/MARKETING/TUTORIAL_VIDEOS/dual-screen-recording-poc.ai.mdx#follow-up-device-frame-presentation-layer)).

To tune the header text or stage design without recording, preview it in a browser:

```bash
node .recordings/tooling/presentation/compose.mjs --preview --header "<title>" \
  [--desktop <flow>/.output/<name>-desktop.mp4 --mobile <flow>/.output/<name>-mobile.mp4]
```

Passing existing clips fills the device screens; edits to `stage.html` show on refresh. Add
`--narration lines.json` to preview narration
([`narration.md`](../../tooling/references/narration.md#procedure)).

**Single screen:**

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { recordWalkthrough } from "../../tooling/record.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(
  fs.readFileSync(path.join(__dirname, "main.scenario.json"), "utf8"),
);
const authPath = path.join(__dirname, "..", "..", "auth", "<account>.auth.json");

const result = await recordWalkthrough({
  scenario,
  out: path.join(__dirname, ".output", "<name>.mp4"),
  storageState: authPath, // drop this line for an anonymous scenario
});
console.log("Done:", result.out);
```

A single-screen video gets the music from `recordWalkthrough` as well. Never edit
`.recordings/tooling/record.mjs` for one flow's needs — it's shared.

### 8. Write the `README.md`

```markdown
# <name>

<One or two sentences: what the video shows.>

- `<role>.scenario.json` — <what this side does>
- `setup.mjs` — <what state it resets>   (omit if none)
- `record.mjs` — <what it runs>

## Zoom plan

<One line per stretch: which steps, its focus, why. Rules live in `tooling/references/zoom.md`.>

## Narration

<One row per line: text, kind (setup / result / demonstration / payoff), header, tone, monitor.
Rules live in `tooling/references/narration.md`.>

## Sync   (side-by-side flows)

<Which `wait` steps line the two sides up, and what to expect in the click logs: e.g. "Add Source
lands ~1.7s after the Copy click". Both clips should end within ~0.4s of each other.>

## Needs

- Dev server running (`npm run dev`, `localhost:3000`)
- <auth session path, if any>
- <required app state / account / channel>

## Re-run

    node .recordings/flows/<name>/record.mjs

<Which output file is the finished video.>
```

The **Needs** list is what `record-flow` checks before recording, so be complete. Write the **Zoom
plan** and **Narration** before the scenario's steps, not after, and keep them current when the
steps change.

### 9. Verify with a real run

Run `node .recordings/flows/<name>/record.mjs`. If `setup.mjs`'s seeding step times out on "Add to
Queue", retry once; it has been transient. Then check the whole video against this list. It is the
definition of done, and it points to where each item's details live:

1. **Viewport.** Desktop scenarios say 1920x1080.
2. **Zoom.** The checklist in [`zoom.md`](../../tooling/references/zoom.md#procedure), for both
   clips, and a frame from inside each stretch showing one steady crop.
3. **Narration.** `node .recordings/tooling/presentation/narration.mjs .recordings/flows/<name>/.output`
   reads as the story, the steps count up with no gaps, each line lights the right monitor, and
   there are no warnings. Then frames from the presentation confirm the header sits above the line,
   yellow and white are where the plan says, and every line fits on one line
   ([`narration.md`](../../tooling/references/narration.md#procedure)).
4. **The flow itself is unchanged by the text.** No wait was added or slowed to fit a line.
5. **Sync.** The beats land where the README's Sync section says and the clips are within ~0.4s of
   each other. Re-check it after any change to a step's timing.
6. **Music.** The finished video has one AAC track at about -26 LUFS, and the intermediate clips
   are silent:

   ```bash
   V=.recordings/flows/<name>/.output/<name>-presentation.mp4
   ffprobe -v error -show_entries stream=codec_name -of csv=p=0 $V   # h264, aac
   ffmpeg -hide_banner -nostats -i $V -vn -af ebur128 -f null - 2>&1 | grep -A6 Summary | grep "I:"
   ```

7. **README.** The zoom plan, narration plan, sync notes and Needs match what the scenarios now do.

Judge the video, not the logs: the times in the click and narration logs run a few hundred
milliseconds ahead of what the video shows. Fix what is wrong in the scenario and re-run until every
item holds. To iterate on how the stage looks, rebuild only the presentation
([`narration.md`](../../tooling/references/narration.md#procedure), step 4). Report the output path.
Don't commit unless asked.

## Editing an existing flow

Same files, same rules. After changing a scenario, do a real run (step 9) — a locator that looks
right in JSON often isn't. If a flow's needs changed (new account, new required state), update its
README **Needs** in the same change.

Every flow in `.recordings/flows/` meets the north star, so keep it that way: when you change a
scenario, update the README plans that describe it and run the whole step 9 list again, not just the
part you touched (a change to one step's timing shifts the narration schedule, the zoom regions and
the sync).
