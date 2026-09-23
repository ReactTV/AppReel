# Examples

Two runnable, self-contained flows showing the two basic shapes — not installed by
`npx @reacttv/appreel install` (that would clutter a real project's `.appreel/flows/` with demo
content unrelated to its actual app). These live only here, in the package repo, for anyone who
clones it to see the tool work end to end and to copy the shape from.

Both record `index.html`, a trivial page served by `server.mjs` — a zero-dependency `node:http`
server holding one piece of state, so two separately-recorded screens can look synced without a
real backend. See `server.mjs`'s comment for why a plain browser trick (`BroadcastChannel`,
`localStorage`) doesn't work here: each screen records in its own Playwright browser context, and
contexts are storage-isolated from each other by design.

| Flow | Shows |
| --- | --- |
| [`single-screen-demo/`](./single-screen-demo/) | The simplest shape: one scenario, no stage, no narration |
| [`dual-screen-demo/`](./dual-screen-demo/) | Two screens composited together, with narration, the focus glow, and genuine live sync |

## Run them

```bash
node examples/single-screen-demo/record.mjs
node examples/dual-screen-demo/record.mjs
```

Needs the usual prerequisites (`node tooling/record.mjs --check-prereqs`) — nothing else, no dev
server or app-specific setup, since both spin up their own throwaway demo server.
