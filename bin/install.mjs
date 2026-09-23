#!/usr/bin/env node
// Copies this package's tooling/ and skills/ into the consuming project's
// .appreel/, the same way `npx shadcn add` or `npx convex ai-files install`
// vendor files into a project rather than being imported as a runtime dependency.
// Also scaffolds the supporting folders a project fills in itself (music,
// auth, shared setup helpers, custom frame wrappers) so they're discoverable
// from the start instead of only documented in prose.
//
// Hard rule: this script never writes anywhere outside .appreel/ in the
// target project. It doesn't touch AGENTS.md, .claude/, README.md, or
// anything else already there — wiring the installed skills up for a
// specific coding agent (symlinking into .claude/skills/, adding a line to
// AGENTS.md, ...) is a manual step documented in this package's own
// README, on purpose: those are files the target project owns, this
// installer doesn't know what agent (if any) is in use, and getting a
// merge into someone else's AGENTS.md wrong is worse than not attempting
// it. Every path below is built from TARGET_ROOT so this stays true as the
// file grows — never construct a target path from `cwd` directly.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const cwd = process.cwd();
const TARGET_ROOT = path.join(cwd, ".appreel");

function usage() {
  console.log(`Usage: appreel <command>

Commands:
  install    Copy AppReel's tooling and skills into ./.appreel/, and
             scaffold the folders your project adds its own content to
             (music, auth, shared helpers, custom frames)
`);
}

// Resolves a path relative to TARGET_ROOT and refuses to return anything
// outside it — the enforcement behind the "never writes outside .appreel/"
// rule above, not just a naming convention. A relPath containing ".." (even
// by future-edit accident) throws instead of silently escaping.
function underTarget(relPath) {
  const resolved = path.join(TARGET_ROOT, relPath);
  const relativeToTarget = path.relative(TARGET_ROOT, resolved);
  if (relativeToTarget.startsWith("..") || path.isAbsolute(relativeToTarget)) {
    throw new Error(`refusing to write outside .appreel/: ${relPath}`);
  }
  return resolved;
}

// tooling/ and skills/ are package-owned — always overwritten on reinstall so
// updates actually take. Never edit them for one flow's needs (the skills say
// so too); if you need to, you're supposed to fork the package instead.
function copyPackageOwned() {
  const copies = [
    { from: path.join(packageRoot, "tooling"), to: underTarget("tooling") },
    { from: path.join(packageRoot, "skills", "create-flow"), to: underTarget("skills/create-flow") },
    { from: path.join(packageRoot, "skills", "record-flow"), to: underTarget("skills/record-flow") },
  ];
  for (const { from, to } of copies) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    console.log(`Copied   ${path.relative(cwd, to)}`);
  }
}

// Everything below is content the project itself owns (music, sessions,
// project-specific helpers, flows) — scaffolded once, never overwritten on a
// later install, so re-running this never clobbers anything a user added.
function writeIfMissing(relPath, content) {
  const filePath = underTarget(relPath);
  const displayPath = path.relative(cwd, filePath);
  if (fs.existsSync(filePath)) {
    console.log(`Skipped  ${displayPath} (already exists)`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log(`Created  ${displayPath}`);
}

function scaffoldProjectOwned() {
  writeIfMissing(
    "README.md",
    `# AppReel

Everything AppReel needs to script and produce walkthrough videos of this app.

| Folder | What's in it |
| --- | --- |
| \`tooling/\` | The recorder itself — vendored, shared, don't edit for one flow's needs |
| \`skills/\` | The \`create-flow\` / \`record-flow\` agent skills |
| \`flows/\` | One folder per video — the thing you actually maintain |
| \`music/\` | The one background track every video gets |
| \`auth/\` | Saved sign-in sessions (gitignored) |
| \`shared/\` | Cross-flow setup/reset helpers, if your project needs them |
| \`frames/\` | Custom device-frame wrappers shared by more than one flow |

Start with \`/create-flow\` to script a new video, \`/record-flow\` to re-render an existing one.
Read [\`tooling/README.mdx\`](./tooling/README.mdx) for how the recorder itself works.
`,
  );

  writeIfMissing(
    "music/README.md",
    `# Music

Drop exactly one audio file here (mp3/m4a/aac/wav/flac/ogg) — every video this tooling produces
gets it as a quiet background bed automatically. More than one file is an error, since nothing
says which to use.

No track ships with AppReel (audio licensing is yours to sort out, not this package's to bundle).
Note the track's source and license here once you've picked one:

- Track:
- Source:
- License:

Until a track is added, videos render silently — nothing else breaks.
`,
  );

  writeIfMissing(
    "auth/README.md",
    `# Auth

Saved Playwright \`storageState\` sessions a flow signs in with, one file per account:
\`<account>.auth.json\`. Never commit these — each one can impersonate whoever signed in, which is
why this whole folder is gitignored (see \`.gitignore\` here).

Generate one by following \`../tooling/references/auth.md\` — the \`create-flow\` skill does this as
part of scripting a flow that needs to be signed in.
`,
  );
  writeIfMissing("auth/.gitignore", "*\n!.gitignore\n!README.md\n");

  writeIfMissing(
    "shared/README.md",
    `# Shared

Cross-flow helpers your project needs — most commonly a shared app-state reset that more than one
flow's \`setup.mjs\` calls, so the logic isn't duplicated per flow. Nothing ships here by default:
what a flow needs to reset before recording is entirely specific to your app's data model.

Example shape:

    export async function resetAppState(options = {}) {
      // reset whatever your project needs reset before a flow records cleanly
    }

Import it from a flow's \`setup.mjs\` once more than one flow needs the same reset.
`,
  );

  writeIfMissing(
    "frames/README.md",
    `# Frames

Custom device-frame wrappers (\`frame: "custom"\` in a flow's \`screens\` config) that are reused
across more than one flow — one subfolder per frame, each holding \`template.html\` (one element
marked \`data-video-slot\`) and \`style.css\`. See \`node ../tooling/presentation/compose.mjs --help\`
for the exact contract.

A custom frame used by only one flow can live under that flow's own folder instead
(\`.appreel/flows/<name>/frames/<frame-name>/\`) — put it here only once a second flow wants the
same look.
`,
  );

  writeIfMissing(
    "flows/README.md",
    `# Flows

One folder per video, created by the \`create-flow\` skill: \`.appreel/flows/<name>/\`. Each
holds its scenario JSON, an optional \`setup.mjs\`, a \`record.mjs\`, and a \`README.md\` describing
its plan. Generated videos land in a gitignored \`.output/\` inside each flow's folder (see
\`.gitignore\` here) — everything else in a flow's folder is tracked in git.
`,
  );
  writeIfMissing("flows/.gitignore", "*/.output/\n");
}

function install() {
  copyPackageOwned();
  scaffoldProjectOwned();

  console.log(`
AppReel installed into .appreel/

Next steps:
  1. Check prerequisites: node .appreel/tooling/record.mjs --check-prereqs
  2. Add a background track: .appreel/music/ (optional — see its README)
  3. Wire up create-flow / record-flow for your coding agent (pick one):
       Claude Code:  ln -s ../../.appreel/skills/create-flow .claude/skills/create-flow
                      ln -s ../../.appreel/skills/record-flow .claude/skills/record-flow
       Any other agent: point it at .appreel/skills/create-flow/SKILL.md and
                      .appreel/skills/record-flow/SKILL.md — plain markdown, no
                      special format required. Adding a line to your AGENTS.md
                      is the most portable way to make that stick.
     See the README for more on this.
`);
}

const [, , command] = process.argv;

if (command === "install") {
  install();
} else {
  usage();
  process.exit(command ? 1 : 0);
}
