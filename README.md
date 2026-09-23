# AppReel

Takes a scripted tour of your web app and hands you back a video.

AppReel drives a real browser through a JSON-scripted walkthrough of your app — animated
cursor, click highlighting, auto-zoom on each click, narration, background music — and renders
it to an MP4 you can drop straight into a README, a launch post, or a tutorial. No manual screen
recording, no re-recording by hand every time the UI changes.

Built for and battle-tested on [react.tv](https://react.tv).

> **Status:** early scaffold, not yet a working install — file layout and initial commit only.

## Install

```bash
npx @reacttv/appreel install
```

Copies the recorder tooling and the `create-flow` / `record-flow` skills into `.appreel/` in
your project.

## Prerequisites

- [Playwright](https://playwright.dev) with Chromium installed (`npx playwright install
  chromium`)
- `ffmpeg` on `PATH`
- A local dev server to record against

Check with:

```bash
node .appreel/tooling/record.mjs --check-prereqs
```

## License

Apache License 2.0 with the [Commons Clause](https://commonsclause.com/) condition — free to
use, modify, and redistribute (including forks under a new name) for any purpose, including
commercial use of what you make with it. The one thing it doesn't permit is selling AppReel
itself. See [LICENSE](./LICENSE).

The core recorder (`tooling/record.mjs` and friends) is vendored from
[`akunzai/agent-skills`](https://github.com/akunzai/agent-skills) under MIT — see
[NOTICE.md](./NOTICE.md).
