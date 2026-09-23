# dual-screen-demo

Two screens, recorded concurrently, composited side by side — desktop and mobile device frames,
narration, and the focus glow. Types a message on the desktop screen and shows it appear live on
the mobile screen, both polling the same throwaway demo server
(`examples/server.mjs`) so the sync is real, not staged.

This is the shape to copy for anything that needs to show "change something here, see it reflected
there": a settings sync, a live preview, a broadcaster/viewer relationship, anything spanning more
than one screen.

- `desktop.scenario.json` — types the message, narrated as the setup step
- `mobile.scenario.json` — just watches (no cursor), narrated as the result once the message
  should have arrived
- `record.mjs` — starts the demo server, records both screens with a sync barrier, composites
  them, stops the server

## Needs

- Prerequisites: `node ../../tooling/record.mjs --check-prereqs`
- Nothing else — no dev server, no auth, no app-specific setup

## Re-run

    node examples/dual-screen-demo/record.mjs

Output: `.output/dual-screen-demo-presentation.mp4` (the intermediate per-screen clips are also
left in `.output/` alongside it).

## Adapting this for your own flow

Point both scenarios' `url` at your real dev server instead of a throwaway demo server (drop the
`startDemoServer()` call and the URL override entirely — a real project's two screens both just
load the same known URL, or two different URLs if that's what the flow needs), swap `frame` for
whatever device types fit (`desktop | mobile | mac | windows | chrome | custom | none` — see
`node ../../tooling/presentation/compose.mjs --help`), and write real narration for your own
story. See [`create-flow`'s SKILL.md](../../skills/create-flow/SKILL.md) for the full authoring
workflow.
