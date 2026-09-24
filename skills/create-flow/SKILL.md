---
name: create-flow
description: >-
  Creates a new recording flow (a scripted video of a web app with cursor,
  zoom, on-screen narration and music) under `.appreel/flows/<name>/`, or
  edits an existing one — scenarios, setup, record script, README, sign-in
  session. Use when the user wants to make a new tutorial/demo/marketing video
  flow, change what a flow does, fix a flow whose UI targets broke, or invokes
  /create-flow. To just re-run an existing flow, use `record-flow`.
---

# Create flow

Tooling lives in `.appreel/tooling/` (shared, vendored). Read
[`tooling/README.mdx`](../../tooling/README.mdx) first — it's
the canonical reference for prerequisites, scenario JSON, and output quality. This skill is the
authoring workflow on top of it. Once a flow exists, recording it is `record-flow`'s job.

## What every flow gets right

Every flow should look and behave like its video. What that means, each with the one file that
holds its rules (this skill never restates them; when a run teaches something new, edit that
file):

| The video has | Rules |
|---|---|
| A **1920x1080** desktop viewport (phone scenarios excepted), so every zoom focus is calibrated | [`zoom.md`](../../tooling/references/zoom.md) |
| **Steady zoom**: one crop per screen area, no in-and-out pumping, a glide only between areas too far apart for one crop | [`zoom.md`](../../tooling/references/zoom.md) |
| **Narration** under the screens (multi-screen flows only): a yellow line per beat; an auto-numbered "Step N" header over the setup; a white "See it in action" section for the demonstration; a yellow payoff line at the end | [`narration.md`](../../tooling/references/narration.md) |
| A **glow** on the screen each line is about, moving between screens as the story does | [`narration.md`](../../tooling/references/narration.md#focus) |
| Quiet **background music**, added automatically | [tooling README](../../tooling/README.mdx#music) |
| **Viewer-paced** steps: nothing dead, values nobody reads entered fast, waits only as long as the page needs | [`effects.md`](../../tooling/references/effects.md#pacing) |
| Every screen **stays in sync**, and clips of equal length | the flow's README ([`zoom.md`](../../tooling/references/zoom.md#procedure) step 5) |

The [definition of done](#9-verify-with-a-real-run) is one checklist over all of it. Once this
project has a flow you're happy with, treat its folder as the model to copy for the next one —
this skill doesn't hard-code an example, since every project's first flow looks different.

## The folder contract

Every flow is `.appreel/flows/<name>/` (kebab-case, named for what the video shows):

| File | Purpose |
|---|---|
| `<screen-name>.scenario.json` | Start URL + every step. One per screen (see [Pick the shape](#1-pick-the-shape)), or just `main.scenario.json` for a single raw recording. |
| `setup.mjs` | Optional. Flow-specific state reset your project needs before recording (see [Reset app state](#6-reset-app-state)). Exports one async function. |
| `record.mjs` | Always. Runs setup, records every screen, composites them if there's more than one (or one with a frame). **This is the only thing `record-flow` runs.** |
| `README.md` | Always. The flow's plan (screens, zoom, narration, sync), what it needs, how to re-run. |
| `.output/` | Generated videos, plus an `artifacts/` subfolder for the click/zoom/narration logs each run writes. Gitignored; the recorder creates it. |

Sign-in sessions are **not** per flow — they live in `.appreel/auth/<account>.auth.json`
(gitignored) and are shared.

## Creating a flow

### 1. Pick the shape

Ask the user, don't assume — the right shape depends entirely on what the video needs to show:

1. **How many screens does this video need to show at once?** One, or more than one (e.g. a
   change on one device reflected on another).
2. **For each screen, should it have a device frame, or be shown as-is?** Options: `desktop`
   (monitor mockup), `mobile` (phone mockup), `mac` or `windows` (app window chrome), `chrome`
   (browser window chrome), `custom` (bring your own — see below), or `none` (no frame at all).

This gives three shapes in practice:

- **One screen, `none`, recorded raw** — skip the presentation stage entirely: `record.mjs` calls
  `recordWalkthrough()` directly and the output is exactly the scenario's own recording, no
  header, no reserved space, no narration. The simplest option, and a reasonable default if the
  user has no strong preference.
- **One screen, any other frame (or `none` but the user still wants a title/narration)** — goes
  through the presentation stage (`composePresentation`) with a single entry in `screens`. Gets a
  title and the project's brand (`.appreel/brand/`, or a plain `wordmark`); no narration glow
  target beyond that one screen, but narration lines still work.
- **Two or more screens** — always goes through the presentation stage. Every screen needs a
  `name` (used for narration focus — see [narration.md](../../tooling/references/narration.md#focus)),
  a `label`, and a `frame`. Only this shape gets the full narration treatment (header, glow moving
  between screens). A screen with nothing worth showing until partway through (a viewer of
  something the other screen hasn't created yet) takes `enterAtMs` and joins the stage then,
  instead of filling its opening seconds with an unrelated page — see `compose.mjs --help`.

**`custom` frames:** this package ships no default look for `custom` — it's a bare wrapper with
a marked slot for the video (`data-video-slot`) plus a `style.css` you (or this skill) write for
that specific project. If the user wants a distinctive frame (their own app's chrome, an
OBS-style window, anything not in the built-in list), write the `template.html` + `style.css` for
it as part of authoring the flow, save it under the flow's own folder (e.g.
`.appreel/flows/<name>/frames/<frame-name>/`), and reference it from `screens` as
`{ "frame": "custom", "customFrame": "./frames/<frame-name>" }`. Run
`node .appreel/tooling/presentation/compose.mjs --help` for the exact contract.

### 2. Prerequisites

```bash
node .appreel/tooling/record.mjs --check-prereqs
```

Your project's dev server must be running, at whatever URL the scenario's `start` points to.

### 3. Get a signed-in session, if needed

`record.mjs` never takes credentials. Write a one-off Playwright script following
[`tooling/references/auth.md`](../../tooling/references/auth.md)
and save the `storageState` to `.appreel/auth/<account>.auth.json`. **Never commit it** — it
can impersonate whoever signed in. If a suitable session already exists in `.appreel/auth/`,
reuse it. Anonymous scenarios skip this step.

### 4. Plan the video

Before writing a single step, put the plan in the flow's `README.md`. It is the flow's spec, and
later edits start from it:

1. **The story.** What does the viewer end up able to do? List the setup steps, the result they
   produce, any demonstration that shows it working, and the payoff. This is the shape narration
   follows ([the pattern](../../tooling/references/narration.md#the-pattern)) — only needed for a
   multi-screen or staged flow.
2. **The zoom plan.** One line per stretch: which steps, one focus, why. Measure the real page
   first ([`zoom.md`](../../tooling/references/zoom.md#procedure)).
3. **The narration plan** (multi-screen/staged flows only). One row per line: its text, kind
   (setup, result, demonstration, payoff), header, tone and which screen it's about. Beats and
   stretches usually line up.

### 5. Write the scenario(s)

Step and effects reference:
[`tooling/references/effects.md`](../../tooling/references/effects.md).

- **Viewport:** every desktop scenario sets `"viewport": { "width": 1920, "height": 1080 }`. Write
  it out even though it is the recorder's default; only phone scenarios (`"device": "phone"`) use
  another size.
- **Locators:** prefer `role`/`text`/`label` over CSS selectors; they survive UI changes better.
- **Captions off:** `"effects": { "captions": false }`. The on-page captions stay off; if the flow
  is staged, the text viewers read is the presentation's narration instead.
- **Zoom:** hold, focus and release each stretch as planned
  ([`zoom.md`](../../tooling/references/zoom.md)). If your project has recurring UI (a settings
  modal that's always centered, say), add its calibrated focus to
  [zoom.md's fixed-foci table](../../tooling/references/zoom.md#fixed-foci) once you know it.
- **Narration:** add `narration` (and `narrationHeader`, `narrationStyle`, `narrationFocus`) to the
  steps the plan says
  ([`narration.md`](../../tooling/references/narration.md)). `narrationFocus` names a screen (see
  its `name` in `screens`), or `"all"`/`"none"`. It must never change a step's own timing: fix a
  narration warning in the text, not by adding waits.
- **Pacing:** nothing dead, values nobody reads entered fast
  ([`effects.md`](../../tooling/references/effects.md#pacing)).

Once this project has an earlier flow, copy the shape of its scenario(s) rather than starting
from nothing.

### 6. Reset app state

If recording this flow leaves your app in a different state than it started (content created, a
setting changed, something scheduled), write a `setup.mjs` that resets it before recording:

```js
export async function setup() {
  // whatever your project needs reset before this flow records cleanly
}
```

Call it from `record.mjs` before recording starts. If more than one flow needs the same reset,
factor it into a shared helper under `.appreel/shared/` and import it from each flow's
`setup.mjs` — this package ships no reset logic of its own, since it's entirely specific to your
app's data model.

A flow that leaves state behind (something scheduled for a specific time, say) must clean up in a
way that still works **on a different day** — match on what stays the same (an identifying name
or slug), not on a time-derived label that reads differently once that time has passed.

### 7. Write `record.mjs`

**Staged (one screen with a frame, or multiple screens):**

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareRecording, captureRecording, createRecordingSyncBarrier } from "../../tooling/record.mjs";
import { composePresentation } from "../../tooling/presentation/compose.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readScenario = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.scenario.json`), "utf8"));

const screens = [
  { name: "desktop", label: "Desktop", frame: "desktop", scenario: readScenario("desktop") },
  { name: "mobile", label: "Mobile", frame: "mobile", scenario: readScenario("mobile") },
  // add as many as the flow needs
];

// prepareRecording for everyone first, then captureRecording for everyone via
// Promise.all, so every screencast starts within the same tick regardless of
// each screen's own setup time (session restore vs. an anonymous page load).
const prepared = await Promise.all(
  screens.map((screen) =>
    prepareRecording({
      scenario: screen.scenario,
      out: path.join(__dirname, ".output", `<name>-${screen.name}.mp4`),
    }),
  ),
);
// The barrier makes every screen wait for the others to finish their own
// steps before any of them starts its tail padding, so they end together too.
const sync = createRecordingSyncBarrier(prepared.length);
const recorded = await Promise.all(prepared.map((p) => captureRecording(p, { sync })));

const result = await composePresentation({
  screens: screens.map((screen, i) => ({
    name: screen.name,
    label: screen.label,
    frame: screen.frame,
    clip: recorded[i].out,
  })),
  header: "Add Your First Piece Of Content", // short, title case; renders top-center
  out: path.join(__dirname, ".output", "<name>-presentation.mp4"),
});
console.log("Done:", result.out);
```

Don't simplify away `createRecordingSyncBarrier`: a signed-in session restore takes much longer
than an anonymous page load, and recording each screen independently drifts by seconds once
composited — the barrier holds every screen's capture at the starting line until all are ready.

To tune the header text or stage design without recording, preview it in a browser:

```bash
node .appreel/tooling/presentation/compose.mjs --preview --header "<title>" --screens screens.json
```

Passing a `screens.json` with real clip paths fills the screens; edits to `stage.html` show on
refresh. Add `--narration lines.json` to preview narration
([`narration.md`](../../tooling/references/narration.md#procedure)).

**Raw (one screen, `none`, no stage):**

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

A raw recording gets the music from `recordWalkthrough` as well. Never edit
`.appreel/tooling/record.mjs` for one flow's needs — it's shared.

### 8. Write the `README.md`

```markdown
# <name>

<One or two sentences: what the video shows.>

- `<screen-name>.scenario.json` — <what this screen does>   (one per screen)
- `setup.mjs` — <what state it resets>   (omit if none)
- `record.mjs` — <what it runs>

## Screens   (staged flows only)

<One row per screen: name, frame, label.>

## Zoom plan

<One line per stretch: which steps, its focus, why. Rules live in `tooling/references/zoom.md`.>

## Narration   (staged flows only)

<One row per line: text, kind (setup / result / demonstration / payoff), header, tone, which
screen it's about. Rules live in `tooling/references/narration.md`.>

## Sync   (multi-screen flows only)

<Which `wait` steps line the screens up, and what to expect in the click logs: e.g. "the mobile
side's confirmation lands ~1.7s after the desktop click". All clips should end within ~0.4s of
each other.>

## Needs

- Dev server running at <url>
- <auth session path, if any>
- <required app state / account>

## Re-run

    node .appreel/flows/<name>/record.mjs

<Which output file is the finished video.>
```

The **Needs** list is what `record-flow` checks before recording, so be complete. Write the **Zoom
plan** and **Narration** before the scenario's steps, not after, and keep them current when the
steps change.

### 9. Verify with a real run

Run `node .appreel/flows/<name>/record.mjs`. Then check the whole video against this list. It
is the definition of done, and it points to where each item's details live:

1. **Viewport.** Desktop scenarios say 1920x1080.
2. **Zoom.** The checklist in [`zoom.md`](../../tooling/references/zoom.md#procedure), for every
   clip, and a frame from inside each stretch showing one steady crop.
3. **Narration** (staged flows only).
   `node .appreel/tooling/presentation/narration.mjs .appreel/flows/<name>/.output`
   reads as the story, the steps count up with no gaps, each line lights the right screen, and
   there are no warnings. Then frames from the presentation confirm the header sits above the line,
   yellow and white are where the plan says, and every line fits on one line
   ([`narration.md`](../../tooling/references/narration.md#procedure)).
4. **The flow itself is unchanged by the text.** No wait was added or slowed to fit a line.
5. **Sync** (multi-screen flows only). The beats land where the README's Sync section says and the
   clips are within ~0.4s of each other. Re-check it after any change to a step's timing.
6. **Music.** The finished video has one AAC track at about -26 LUFS, and the intermediate clips
   are silent:

   ```bash
   V=.appreel/flows/<name>/.output/<name>-presentation.mp4   # or <name>.mp4 for a raw flow
   ffprobe -v error -show_entries stream=codec_name -of csv=p=0 $V   # h264, aac
   ffmpeg -hide_banner -nostats -i $V -vn -af ebur128 -f null - 2>&1 | grep -A6 Summary | grep "I:"
   ```

7. **README.** The screens list, zoom plan, narration plan, sync notes and Needs match what the
   scenarios now do.

Judge the video, not the logs: the times in the click and narration logs run a few hundred
milliseconds ahead of what the video shows. Fix what is wrong in the scenario and re-run until every
item holds. To iterate on how the stage looks, rebuild only the presentation
([`narration.md`](../../tooling/references/narration.md#procedure), step 4). Report the output path.
Don't commit unless asked.

## Editing an existing flow

Same files, same rules. After changing a scenario, do a real run (step 9) — a locator that looks
right in JSON often isn't. If a flow's needs changed (new account, new required state), update its
README **Needs** in the same change.

Every flow in `.appreel/flows/` meets the [north star](#what-every-flow-gets-right), so keep it
that way: when you change a scenario, update the README plans that describe it and run the whole
step 9 list again, not just the part you touched (a change to one step's timing shifts the
narration schedule, the zoom regions and the sync).
