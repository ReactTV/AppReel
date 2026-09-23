# AppReel

Takes a scripted tour of your web app and hands you back a video.

AppReel drives a real browser through a JSON-scripted walkthrough of your app — animated
cursor, click highlighting, auto-zoom on each click, narration, background music — and renders
it to an MP4 you can drop straight into a README, a launch post, or a tutorial. No manual screen
recording, no re-recording by hand every time the UI changes.

Built for and battle-tested on [react.tv](https://react.tv).

## Install

```bash
npx @reacttv/appreel install
```

Copies the recorder tooling and the `create-flow` / `record-flow` skills into `.appreel/` in
your project, and scaffolds the folders your project adds its own content to (`music/`, `auth/`,
`shared/`, `frames/`, `flows/`).

## Commands

AppReel is copied into your project, not installed as a runtime dependency (the same pattern as
`shadcn add` or `convex ai-files install`), so updates don't happen automatically just because
you bumped the npm package — nothing here runs on its own, you always trigger it:

| Command | Does |
| --- | --- |
| `npx @reacttv/appreel install` | First-time setup (see above). Safe to re-run — never overwrites anything you've added |
| `npx @reacttv/appreel update` | Refreshes `tooling/` and `skills/` to match the installed npm package. Touches nothing else — not `flows/`, `music/`, `auth/`, `shared/`, `frames/`, or `.appreel/README.md` |
| `npx @reacttv/appreel status` | Is `.appreel/` installed, is it up to date with `node_modules`, and are prerequisites (ffmpeg, Playwright) satisfied |
| `npx @reacttv/appreel uninstall` | Removes `tooling/` and `skills/` only — never touches anything you own |
| `npx @reacttv/appreel help` | Lists these commands |
| `npx @reacttv/appreel version` | Prints the installed AppReel version |

## Prerequisites

- [Playwright](https://playwright.dev) with Chromium installed (`npx playwright install
  chromium`)
- `ffmpeg` on `PATH`
- A local dev server to record against

Check with `npx @reacttv/appreel status` (or directly:
`node .appreel/tooling/record.mjs --check-prereqs`).

## Using `create-flow` / `record-flow` with your coding agent

Install only copies the skill files into `.appreel/skills/` — it doesn't touch anything outside
that folder, so it never edits files it doesn't own (`AGENTS.md`, `.claude/`, or anything else
already in your project). Wiring them up for your agent is one extra step, your choice how:

**Claude Code** reads skills only from `.claude/skills/`, so symlink them in (this mirrors how
AppReel's own source project wires up its skills — a symlink, not a copy, so there's one source
of truth and reinstalling never goes stale):

```bash
ln -s ../../.appreel/skills/create-flow .claude/skills/create-flow
ln -s ../../.appreel/skills/record-flow .claude/skills/record-flow
```

**Any other agent** (Cursor, Copilot, Codex, Windsurf, Devin, …): `.appreel/skills/create-flow/SKILL.md`
and `.appreel/skills/record-flow/SKILL.md` are plain markdown — nothing Claude-specific about the
content, just the frontmatter. The most portable way to make an agent find them on its own is a
line in your project's [`AGENTS.md`](https://agents.md) (the cross-tool instructions file 30+
agents read), e.g.:

```markdown
## Recording app walkthrough videos

See `.appreel/skills/create-flow/SKILL.md` to script a new video, `.appreel/skills/record-flow/SKILL.md`
to re-render an existing one.
```

Claude Code itself reads `CLAUDE.md`, not `AGENTS.md` — if your project bridges the two with an
`@AGENTS.md` import (a common pattern), the line above covers Claude Code as well and the symlinks
above become optional.

## License

Apache License 2.0 with the [Commons Clause](https://commonsclause.com/) condition — free to
use, modify, and redistribute (including forks under a new name) for any purpose, including
commercial use of what you make with it. The one thing it doesn't permit is selling AppReel
itself. See [LICENSE](./LICENSE).

The core recorder (`tooling/record.mjs` and friends) is vendored from
[`akunzai/agent-skills`](https://github.com/akunzai/agent-skills) under MIT — see
[NOTICE.md](./NOTICE.md).

## Support

AppReel is free and always will be. If it saved you time, [buy me a
coffee](https://buymeacoffee.com/ashesofowls) — entirely optional, never required for anything
here.
