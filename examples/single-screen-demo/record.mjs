#!/usr/bin/env node
// Raw single-screen recording — no presentation stage, no narration, just the
// scenario's own output. This is the simplest shape: one scenario, one clip.
//
// The scenario's "url" is a placeholder ("http://127.0.0.1:0/") since this
// demo spins up its own throwaway server rather than pointing at a real dev
// server — a real project's flow would just hardcode its actual URL instead
// and skip this override entirely.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { recordWalkthrough } from "../../tooling/record.mjs";
import { startDemoServer } from "../server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, "main.scenario.json"), "utf8"));

const server = await startDemoServer();
scenario.url = `http://127.0.0.1:${server.address().port}/`;

let result;
try {
  result = await recordWalkthrough({
    scenario,
    out: path.join(__dirname, ".output", "single-screen-demo.mp4"),
  });
} finally {
  server.close();
}
console.log("Done:", result.out);
