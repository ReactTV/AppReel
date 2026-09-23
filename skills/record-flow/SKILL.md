---
name: record-flow
description: >-
  Re-records an existing recording flow (a scripted, cursor-and-zoom video of
  a web app under `.recordings/flows/<name>/`) and hands back the finished
  video. Use when the user asks to record, re-record, regenerate, or refresh
  a flow's video, or invokes /record-flow. To make a new flow or change what
  an existing one does, use `create-flow` instead.
---

# Record flow

A **flow** is a folder at `.recordings/flows/<name>/` holding everything needed to reproduce one
video: scenario JSON, an optional `setup.mjs`, a `record.mjs`, a `README.md`, and a gitignored
`.output/`. Every flow records the same way, so this skill needs no per-flow knowledge beyond
that flow's README.

## 1. Pick the flow

If the user named one, use it. Otherwise list `.recordings/flows/` and ask which.

## 2. Check what it needs

Read the flow's `README.md` — its **Needs** section says what must be true before recording
(dev server, which auth session, required app state). Confirm each:

- The dev server it names is answering (usually already running).
- Any listed `.recordings/auth/<account>.auth.json` exists. If it's missing or the run later
  fails to sign in, the session needs regenerating — that's a `create-flow` task
  (`.recordings/tooling/references/auth.md`).
- Recorder prerequisites (Playwright's Chromium, ffmpeg):

  ```bash
  node .recordings/tooling/record.mjs --check-prereqs
  ```

App state the flow's `setup.mjs` resets is handled by `record.mjs`. Anything else the README
lists is on the user — ask rather than guess.

## 3. Record

```bash
node .recordings/flows/<name>/record.mjs
```

Output filenames are fixed, so **re-running overwrites that flow's previous videos** in `.output/`.
If the user wants to keep the last take, copy it out first.

## 4. Hand back

Give the user the path(s) under `.recordings/flows/<name>/.output/`. The finished video is
`<name>-presentation.mp4` for a staged (one or more screens through the presentation stage) flow,
or `<name>.mp4` for a raw single-screen one. Both are already in the postable format (H.264,
30 fps, plays everywhere; a staged presentation is 1920x1080) and carry the house music, so no
export step is needed. The other clips (one per screen, e.g. `-desktop`, `-mobile`) and the
`artifacts/` subfolder (`*.clicks.jsonl`, `*.zooms.json`, `*.narration.json`) are intermediates.

If compositing printed `narration:` warnings, pass them on: each means a narration line had to be
pushed later than its step, or ran out of time at the end. Fixing one is a `create-flow` task (it
is a change to the flow's narration text).

## When it fails

- **A locator times out / a step can't find its target** — the UI changed since the scenario
  was written. Fix the scenario with `create-flow`; don't retry blindly.
- **`setup.mjs` times out** waiting for something to appear while seeding state — a URL or
  request sometimes doesn't resolve in time. It has been transient before: retry once. If it
  fails a second time, report it.
- **A step can't find its target and the screen shows an unexpected confirmation dialog, or the
  app is already in a state the video didn't create** — leftover state from an earlier run, not a
  UI change. A flow that changes persistent state (creates something, schedules something) can
  leave it behind, and once enough time passes the leftover state can look different (a
  time-based label reading differently, a scheduled thing having gone live) and start blocking in
  ways that look unrelated. Look at the actual app state before editing the scenario, then fix
  the flow's cleanup (`setup.mjs`) so it recognizes what the last run left, whatever day it is.
- **Sign-in fails or lands signed out** — the saved session expired. Regenerate it (`create-flow`).
- **Anything in `.recordings/tooling/`** — that's the shared vendored recorder. Report what
  broke; don't patch it as part of recording a video.

Never delete a flow folder or an auth file after recording — they're the reproducible source.
`.auth.json` files must never be committed; check before any `git add .`.
