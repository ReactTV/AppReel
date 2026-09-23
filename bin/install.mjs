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
//
// No surprises: every command here does exactly one predictable thing.
// Nothing runs automatically (no postinstall hook) — you always trigger
// install/update yourself.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const cwd = process.cwd();
const TARGET_ROOT = path.join(cwd, ".appreel");
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).version;

function usage() {
  console.log(`Usage: appreel <command>

Commands:
  install    First-time setup: copy tooling/skills into ./.appreel/ and
             scaffold the folders your project adds its own content to
             (music, auth, shared helpers, custom frames, flows)
  update     Refresh tooling/skills to match the installed npm package —
             does not touch flows, music, auth, or anything else you own
  status     Is .appreel/ installed, is it up to date, are prerequisites
             (ffmpeg, Playwright) satisfied
  uninstall  Remove tooling/ and skills/ only — never touches flows/,
             music/, auth/, shared/, or frames/
  help       This message
  version    Print the installed appreel version
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

// A one-line, package-owned marker of which appreel version tooling/skills
// currently match — always overwritten alongside them. Deliberately its own
// file, not a line inside .appreel/README.md: README.md is write-once/
// project-owned (never touched after first creation, so a user's edits to it
// are safe), and a version stamp needs to change on every install/update —
// those two requirements can't both live in the same file.
const VERSION_STAMP_PATH = ".installed-version";

function readInstalledVersion() {
  const stampPath = underTarget(VERSION_STAMP_PATH);
  if (!fs.existsSync(stampPath)) return null;
  return fs.readFileSync(stampPath, "utf8").trim() || null;
}

function writeInstalledVersion() {
  fs.writeFileSync(underTarget(VERSION_STAMP_PATH), `${PACKAGE_VERSION}\n`);
}

// tooling/ and skills/ are package-owned — always overwritten so updates
// actually take. Never edit them for one flow's needs (the skills say so
// too); if you need to, you're supposed to fork the package instead.
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
  writeInstalledVersion();
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

## Keeping this up to date

This folder was copied in by \`npx @reacttv/appreel\`, not installed as a runtime dependency, so
updates don't happen automatically:

- \`npx @reacttv/appreel status\` — is this folder up to date, are prerequisites satisfied
- \`npx @reacttv/appreel update\` — refresh \`tooling/\` and \`skills/\` after bumping the npm
  package (never touches this file, \`flows/\`, or anything else here)
- \`npx @reacttv/appreel uninstall\` — remove \`tooling/\` and \`skills/\` only
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
AppReel ${PACKAGE_VERSION} installed into .appreel/

Next steps:
  1. Check prerequisites: npx @reacttv/appreel status
  2. Add a background track: .appreel/music/ (optional — see its README)
  3. Wire up create-flow / record-flow for your coding agent (pick one):
       Claude Code:  ln -s ../../.appreel/skills/create-flow .claude/skills/create-flow
                      ln -s ../../.appreel/skills/record-flow .claude/skills/record-flow
       Any other agent: point it at .appreel/skills/create-flow/SKILL.md and
                      .appreel/skills/record-flow/SKILL.md — plain markdown, no
                      special format required. Adding a line to your AGENTS.md
                      is the most portable way to make that stick.
     See the README for more on this.

Later, after bumping the npm package: npx @reacttv/appreel update
`);
}

function update() {
  if (!fs.existsSync(TARGET_ROOT)) {
    console.error("Nothing installed yet — run `npx @reacttv/appreel install` first.");
    process.exit(1);
  }
  const previous = readInstalledVersion();
  copyPackageOwned();
  if (previous === PACKAGE_VERSION) {
    console.log(`\ntooling/ and skills/ already match ${PACKAGE_VERSION} — nothing changed.`);
  } else if (previous) {
    console.log(`\nUpdated tooling/ and skills/: ${previous} -> ${PACKAGE_VERSION}`);
  } else {
    console.log(`\nUpdated tooling/ and skills/ to ${PACKAGE_VERSION} (no previous version was recorded).`);
  }
}

function status() {
  if (!fs.existsSync(TARGET_ROOT)) {
    console.log("Not installed. Run `npx @reacttv/appreel install`.");
    return;
  }
  const installed = readInstalledVersion();
  if (installed === null) {
    console.log(
      "tooling/skills version unknown (installed before version stamping existed) — " +
        "run `npx @reacttv/appreel update` to bring it current.",
    );
  } else if (installed === PACKAGE_VERSION) {
    console.log(`Up to date: tooling/skills match the installed package (${PACKAGE_VERSION}).`);
  } else {
    console.log(
      `Update available: .appreel/ is on ${installed}, node_modules has ${PACKAGE_VERSION} — ` +
        "run `npx @reacttv/appreel update`.",
    );
  }

  console.log("");
  const recordMjs = underTarget("tooling/record.mjs");
  if (!fs.existsSync(recordMjs)) {
    console.log("tooling/record.mjs missing — run `npx @reacttv/appreel install`.");
    return;
  }
  spawnSync(process.execPath, [recordMjs, "--check-prereqs"], { stdio: "inherit" });
}

function uninstall() {
  if (!fs.existsSync(TARGET_ROOT)) {
    console.log("Nothing installed.");
    return;
  }
  let removedAny = false;
  for (const relPath of ["tooling", "skills", VERSION_STAMP_PATH]) {
    const target = underTarget(relPath);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`Removed  ${path.relative(cwd, target)}`);
      removedAny = true;
    }
  }
  if (!removedAny) {
    console.log("tooling/ and skills/ were already gone.");
  }
  const remaining = fs.readdirSync(TARGET_ROOT);
  if (remaining.length > 0) {
    console.log(`\nLeft untouched in .appreel/ (your own content): ${remaining.join(", ")}`);
  } else {
    console.log("\n.appreel/ is now empty — remove it yourself if you're done with AppReel.");
  }
}

function printVersion() {
  console.log(PACKAGE_VERSION);
}

const [, , command] = process.argv;

switch (command) {
  case "install":
    install();
    break;
  case "update":
    update();
    break;
  case "status":
    status();
    break;
  case "uninstall":
    uninstall();
    break;
  case "help":
  case "-h":
  case "--help":
    usage();
    break;
  case "version":
  case "-v":
  case "--version":
    printVersion();
    break;
  default:
    usage();
    process.exit(command ? 1 : 0);
}
