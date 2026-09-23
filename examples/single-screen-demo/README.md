# single-screen-demo

The simplest possible flow: types a message into a text input on one page, no device frame, no
narration, no stage. Proves the recorder works end to end with zero project-specific setup — it
records `examples/index.html`, served by a throwaway local server (`examples/server.mjs`), not a
real app.

- `main.scenario.json` — start URL (placeholder, overwritten by `record.mjs`) + the steps
- `record.mjs` — starts the demo server, records, stops the server

## Needs

- Prerequisites: `node ../../tooling/record.mjs --check-prereqs`
- Nothing else — no dev server, no auth, no app-specific setup

## Re-run

    node examples/single-screen-demo/record.mjs

Output: `.output/single-screen-demo.mp4`.

## Adapting this for your own flow

Copy the shape, not the content: point `main.scenario.json`'s `url` at your actual dev server
(no server-starting dance needed — that's only here because this demo has no real app to point
at), and write steps against your own UI. See
[`create-flow`'s SKILL.md](../../skills/create-flow/SKILL.md) for the full authoring workflow.
