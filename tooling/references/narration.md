# Narration

**This is the only place narration rules live.** Narration is everything the stage says about what
is happening in a side-by-side video, in three parts that work together:

- a **line** of text under the screens: "Open Settings"
- a small **header** above it: "Step 1", or "See it in action"
- a **glow** on the screen the line is about, so the viewer knows where to look

**Every multi-screen flow has all three,** following [the pattern](#the-pattern) below. When a run
teaches something new about narration, add it here, not to a skill or a flow README.

It shows only when a flow goes through `composePresentation` (two or more screens, or one screen
with a `none`/device frame that still wants a stage — see `compose.mjs --help`). A raw single-screen
recording that skips `composePresentation` entirely has no stage: the lines are still written to
its `.narration.json`, but nothing draws them.

## How it works

A step carries the line:

```json
{ "action": "click", "text": "Dashboard", "exact": true, "narration": "Open Settings" }
```

- It works on any step, including `wait` and `waitFor`. `"narration": ""` clears the line.
- `"narrationStyle": "aside"` sets the line's [tone](#tone); leave it off for a normal step line.
- `"narrationHeader"` puts a small label above the line: `"step"` numbers itself ("Step 1"), and
  any other string shows as written. See [Header](#header).
- `"narrationFocus": "all"` overrides which screen(s) glow — or name a specific screen. See
  [Focus](#focus).
- `record.mjs` logs when the step **starts** and writes each clip's lines to
  `artifacts/<clip>.narration.json` (`[{ "t": ms, "text": "…", "style"?, "header"?, "focus"? }]`,
  `t` on the clip's own clock).
- `compose.mjs` reads the file from each clip's `artifacts/` subfolder, merges every screen by
  time, and [schedules](#the-timing-model) the lines. A flow's `record.mjs` needs nothing extra,
  and a clip without narration leaves the stage exactly as it was.
- On the stage the line is soft yellow (`#f4d35e`) at 42px, so it reads as its own thing next to the
  white title. A new line rises in from below (672ms) while the old one rises out and fades (546ms),
  each travelling 28px. The old line clears out fast and the new one arrives gently, so the two are
  never both legible in the same spot. The look is `.narration-line` in `presentation/stage.html`;
  the two durations come from `presentation/narration.mjs`, which passes them to the stage.

## Layout

The stage has an explicit vertical budget, so narration always has a safe zone. On its 1800x950
canvas: a 140px header, then the row of screens, then a **fixed 240px narration zone** pinned to
the bottom of the recorded frame (`--header-h`, `--narration-h` at the top of
`presentation/stage.html`). The zone's height doesn't change with how many screens are on stage or
which frames wrap them — the row above it zooms down to fit instead (see `stage.html`'s
`buildStage`), so narration always has the same amount of room regardless of layout.

The header (30px), its gap and a one-line caption (53px) take about 90px, comfortably centered in
the 240px zone. Keep at least **26px** of clear space above and below the text if you ever change
`--narration-h`.

## The pattern

A tutorial flow tells one story, and the three parts change with where the viewer is in it. Decide
each beat's kind first; the kind decides its header, tone and focus.

| Kind of beat | Header | Tone | Focus | Where the line goes |
|---|---|---|---|---|
| **Setup step**: something the viewer does to set the thing up | `"step"` (auto-numbered "Step N") | `step` (yellow) | the screen that carries the step | on the beat's first step |
| **Result**: what the setup produced | none | `step` (yellow) | the screen where it appears | on the step *after* the action |
| **Demonstration**: steps that only show the setup worked | a section header, e.g. `"See it in action"`, on every line | `aside` (white) | the screen that carries it, or `"all"` | on the beat's first step |
| **Payoff**: what the viewer can now do | none | `step` (yellow) | `"none"` | on the flow's last step (usually its final `wait`) |

So the yellow lines carry the viewer through the setup, the numbers show how far along they are, and
the shift to white under a new header tells them the setup is done and they are now just watching.
The glow follows the story between the screens.

A worked example (steps are numbered in the order lines appear, across every screen — a flow that
sets up a sync between a desktop and a mobile app, then shows it working):

| Line | Kind | Header | Tone | Lit |
|---|---|---|---|---|
| Open Settings | setup | Step 1 | yellow | Desktop |
| Copy the sync key | setup | Step 2 | yellow | Desktop |
| Open the mobile app and paste the key | setup | Step 3 | yellow | Mobile |
| The account appears on mobile | result | none | yellow | Mobile |
| Go back to Desktop | demonstration | See it in action | white | Desktop |
| Change a setting | demonstration | See it in action | white | Desktop |
| Watch it update on Mobile | demonstration | See it in action | white | both |
| Now you're synced everywhere | payoff | none | yellow | none |

A flow with no demonstration (just setup and a result) has no white section. A flow with nothing to
number (a single action) needs no `"step"` headers, but should still give its lines a tone and a
focus.

Whether a beat is a demonstration or a numbered step depends on what the video *teaches*. If the
setup itself is the lesson, whatever comes after it (proving it worked) is an aside. If the
"payoff" action is itself the lesson — e.g. the flow's whole point is showing two things swapped
or synced — make those numbered steps instead (and light every screen involved), with only a
payoff line after.

## The timing model

A line has an **anchor**, a **hold** and a **schedule**. The flow's own steps and pacing are never
changed to make room for text: the presentation adapts to the flow.

- **Anchor: the step's start.** A line appears when its step starts, before the zoom-in and cursor
  move, so it leads the click by about a second. That suits a line saying what is about to happen
  ("Open Settings"). A line saying what *resulted* ("The setting appears on the other screen")
  goes on the step **after** the action, so it appears once the result is there.
- **Hold: rise-in time + reading time.** Reading time is `max(2.1s, characters ÷ 17 per second)`,
  and it starts once the line has finished rising in, so the animation never eats into it. The
  floor is generous on purpose: the old line starts fading the moment the next one begins, so a
  line is legible for less time than its hold, and viewers need room to breathe on a line of two
  or three words (a 0.5s floor left one on screen for about 0.2s, and 1.2s was still too quick).
  The next line may not replace this one until the hold has passed: "Swap back" holds 2.8s (0.67s
  + 2.1s), and so does "Paste the embed URL and set the size" (0.67s + its 2.1s of length).
  Because a floor this long makes lines wait for each other, a flow whose beats come closer than
  about 2.8s apart needs fewer, longer beats (rule 7).
- **Schedule.** A line due before the previous one has had its hold is pushed later, until it has.
  Every line is shown in order, none is dropped and none appears before its step started.
- **Limits, reported as warnings.** A line pushed too long after its step started no longer reads
  as leading the action. "Too long" is 1.5s, or a quarter of the time the line stays on screen if
  that is more: a line that stays up 8s can start 2s late, since it is describing a long beat, not
  one click. The last line must also have its hold before the video ends. `compose.mjs` prints
  these as `narration: …` warnings.

| Constant | Value | Where |
|---|---|---|
| `NARRATION_IN_MS` / `NARRATION_OUT_MS` | 672 / 546 | `presentation/narration.mjs` |
| `NARRATION_MIN_READ_MS` | 2100 | `presentation/narration.mjs` |
| `NARRATION_CHARS_PER_SEC` | 17 | `presentation/narration.mjs` |
| `NARRATION_MAX_DEFER_MS` / `NARRATION_DEFER_SHARE` | 1500 / 0.25 | `presentation/narration.mjs` |

## Tone

Two tones tell the viewer what kind of line they are reading:

| Style | Look | Use for |
|---|---|---|
| `step` (the default) | soft yellow, 42px, semi-bold | a step the viewer follows: the setup, and the closing payoff |
| `aside` | white at 82%, 42px, medium weight | supporting context: a demonstration that shows the setup worked |

Every line sets its own style. A style is never inherited from an earlier line, because every
screen's lines are merged by time and an inherited style would leak from one screen to another.
Use asides for one section of a flow at most; yellow is the flow's main voice.

## Header

A small label above the line, in tracked capitals, in the tone of its line (dim yellow over a step
line, dim white over an aside). It says where the viewer is in the flow.

- `"narrationHeader": "step"` is numbered for you, "Step 1", "Step 2", … in the order lines appear
  across **every screen**, so adding or moving a step renumbers the rest and nothing is numbered by
  hand.
- Any other string is shown as written: `"narrationHeader": "See it in action"`.
- A header shared by consecutive lines stays still while only the lines animate, so a section
  header is set on each of its lines and never flickers between them.
- A header that ends in a number ("Step 3") is a still prefix and a number that swaps on its own:
  going from Step 1 to Step 2, "Step" doesn't move while the 1 rises out and the 2 rises in. A
  header that changes any other way ("Step 5" to "See it in action") swaps whole, like a line.
- A line with no header keeps the same baseline as one with a header, so the text never jumps.
- Number **setup steps**, the things the viewer does. A line that is a result ("The item appears on
  the other screen") or a payoff gets no header. A demonstration that follows the setup gets a
  section header instead of numbers.

## Focus

The screen a line is about lights up, quietly: its label goes white (the others stay grey) with the
faintest yellow glow, and its frame gets a thin yellow rim and a very soft halo, fading between
screens as the lines change. Less is more here: the glow points, it doesn't shout, and it must
never compete with the screens. Keep it this subtle.

- **By default it is the screen of the step that carries the line** — each screen is named in the
  flow's `screens` config (`compose.mjs --help`), and a line on a step belonging to a screen lights
  that screen by default.
- `"narrationFocus"` overrides it: name any screen, `"all"` for a line about every screen ("Watch it
  update everywhere"), or `"none"` for a line about none of them, such as the closing payoff.
- The glow follows the line's schedule, not the step itself, so it moves when the line does.

## Rules

1. **One line per beat, not per click.** A beat is what a viewer would describe as one action. A
   double-click, a right-click and a Copy are one beat: "Copy the sync key". Put the line on the
   beat's first step.
2. **Short and plain.** About six words, at most ~40 characters, no full stop, no step numbers (the
   [header](#header) numbers them).
   Imperative ("Open Settings") or a plain statement of what appears ("The setting appears on the
   other screen"). Use the UI's own words: name the button, page or field as it actually reads.
3. **Cover the whole flow.** The first beat carries a line from the moment the flow starts acting
   (the opening `wait` that lets the page settle needs none), and the last line stays to the end.
   Clear a line only on purpose.
4. **One line, always.** Longer than ~60 characters wraps to two lines. The narration zone has room
   for that, but a caption that long is a paragraph, not a caption.
5. **Write it for someone watching every screen.** In a multi-screen flow every screen shares one
   line, so word each line for the whole video, not for its own screen: "Paste the sync key" says
   more than "Right-click the key field".
6. **An action gets its line at the start, a result gets it after.** Say what is about to happen on
   the step that does it, and what happened on the step after. Reusing the `wait` step after the
   action is the usual way to place a result line. When the action is the flow's last step, add
   `{ "action": "wait", "ms": 0, "narration": "…" }` after it: a zero-length step carries the line
   without lengthening the flow.
7. **Fix a warning in the text, never in the flow.** A pushed line means two beats sit too close.
   Merge them into one line (as "Paste the sync key and confirm" merges two beats into one), or
   move a line to a later step. Do not add `wait` steps or slow the flow to make room.
8. **A small push is fine.** The scheduler exists so a line 0.3s late costs nothing. It is also how a
   short line gets its time: the closing payoff starts 0.6s late so "Swap back" can be read. Trim
   the *next* line's start, never the flow. Only act on the warnings.
9. **Setup is precise, what follows can be casual.** While the flow is setting something up, lines
   name the UI exactly ("Open Settings"), because the viewer is following along. Once the setup is
   done and the flow moves on to showing that it works, the wording can loosen, and a long beat can
   start late.
10. **Mark the shift from setup to demonstration with a header.** When a flow goes from the setup
    steps to steps that only show it working, make the demonstration lines [asides](#tone) under a
    section header ("See it in action"). The header does the job of a lead-in line, so do not add
    one: it would only push the lines that follow. The flow's payoff line goes back to a normal
    step line with no header.
11. **Point at the right screen.** Leave the default focus when a line is about the screen whose
    step carries it. Override it for a line about every screen, or none.

## Procedure

1. **Plan** the beats when you plan the zoom stretches: they usually line up, since both follow the
   viewer's attention. Sort each beat into a kind from [the pattern](#the-pattern), and write the
   plan into the flow's README under a "Narration" heading (one row per line: text, kind, header,
   tone, focus) before you touch the scenarios. Then add `narration` (with `narrationHeader`,
   `narrationStyle` and `narrationFocus` as the kind needs) to each beat's first step, or to the step
   after it for a result.
2. **Preview the look** without recording, with sample lines in a JSON file:

   ```bash
   node .recordings/tooling/presentation/compose.mjs --preview --narration lines.json \
     --screens screens.json
   ```

3. **Verify** after a run. This prints the schedule: when each line appears, how long it stays up,
   how late the scheduler pushed it, which screen it lights, its header and any warnings:

   ```bash
   node .recordings/tooling/presentation/narration.mjs .recordings/flows/<name>/.output
   ```

   - the lines read as the story, with every screen interleaved correctly
   - the step numbers count up with no gaps, and each line lights the right screen
   - every line, the short ones included, stays up about 2.8s (the hold): grab frames every ~300ms
     across a short line and count
   - no `WARNING` lines
   - no stretch of the video runs without a line

   Then grab frames from the `-presentation.mp4` around a line change, every ~150ms (the ffmpeg
   command is in [`zoom.md`](./zoom.md#procedure); crop to the text with
   `-vf "crop=1500:180:210:820"`), to confirm the old line rises out as the new one rises in, and
   that each line fits on one line, the header is above it, and the right screen is lit. The times
   the script prints are clip time; the presentation can run up to a second off them (the stage
   starts its clip a moment after it opens), so sample a wider window than the printed time.

4. **Iterate without re-recording.** A change to how the stage looks or to the scheduler's constants
   doesn't need a 4-minute recording: rebuild the presentation from the clips you already have, with
   the same `screens` config as the flow's `record.mjs`:

   ```bash
   cd .recordings/flows/<name>/.output && node ../../../tooling/presentation/compose.mjs \
     --screens screens.json --out <name>-presentation.mp4 --header "<title>"
   ```

   It picks up the `.narration.json` files from each clip's `artifacts/` subfolder, and adds the
   music. Changing a line's text, header, style or focus *does* need a new recording, because
   those are read from the scenario when it runs.
