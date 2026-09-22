#!/usr/bin/env node
// Copies this package's tooling/ and skills/ into the consuming project's
// .recordings/, the same way `npx shadcn add` or `npx convex ai-files install`
// vendor files into a project rather than being imported as a runtime dependency.
// First-pass scaffold — see the AppReel extraction plan (Phase 4) for the rest
// of what this needs: idempotent re-install, .gitignore wiring, prereq summary.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const cwd = process.cwd();

function usage() {
  console.log(`Usage: appreel <command>

Commands:
  install    Copy AppReel's tooling and skills into ./.recordings/
`);
}

function install() {
  const targetRecordings = path.join(cwd, ".recordings");
  const copies = [
    { from: path.join(packageRoot, "tooling"), to: path.join(targetRecordings, "tooling") },
    {
      from: path.join(packageRoot, "skills", "create-flow"),
      to: path.join(targetRecordings, "skills", "create-flow"),
    },
    {
      from: path.join(packageRoot, "skills", "record-flow"),
      to: path.join(targetRecordings, "skills", "record-flow"),
    },
  ];

  for (const { from, to } of copies) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    console.log(`Copied ${path.relative(packageRoot, from)} -> ${path.relative(cwd, to)}`);
  }

  console.log(`
AppReel installed into ${path.relative(cwd, targetRecordings)}/

Next steps:
  1. Check prerequisites: node .recordings/tooling/record.mjs --check-prereqs
  2. Add to .gitignore: .recordings/flows/*/.output/  and  .recordings/auth/
  3. Use the create-flow / record-flow skills to script your first walkthrough
`);
}

const [, , command] = process.argv;

if (command === "install") {
  install();
} else {
  usage();
  process.exit(command ? 1 : 0);
}
