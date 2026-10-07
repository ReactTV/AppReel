#!/usr/bin/env node
// Reads a recording's logs and reports the pacing a viewer feels but a log
// hides: the cursor leaving before a click's result shows, the cursor jumping
// to a target, the camera zooming out and straight back in, and stretches
// where nothing happens. The rules are in references/effects.md#pacing.
import fs from "node:fs";
import path from "node:path";

// Less than this from a click to the cursor moving on, and the viewer never
// sees what the click did (a `pause: 0` habit).
export const PACING_MIN_DWELL_MS = 150;
// Less than this from the cursor setting off to the click, and it reads as a
// jump rather than a move.
export const PACING_MIN_APPROACH_MS = 500;
// Two zoom regions this far apart zoom fully out and straight back in: too
// long to glide (under 1s), too short to read as a deliberate full-frame beat.
export const PACING_PUMP_GAP_MS = [1000, 2500];
// Longer than this with no pointer step and no narration line is dead air.
export const PACING_MAX_IDLE_MS = 2500;
// A line logged this close to the start of a pause carries it: the line is
// what the viewer reads (or watches the result of) while nothing moves.
const PACING_LINE_CARRY_MS = 300;
// An optional step that waits longer than this for a target that never shows
// is a timeout spent on nothing, often with the camera frozen on a zoom.
export const PACING_MAX_SKIPPED_WAIT_MS = 1000;

const POINTER_ACTIONS = new Set(["click", "dblclick", "double-click", "type", "select", "drag"]);

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

// The step a logged click belongs to, for naming it in a finding.
function stepAt(steps, t) {
  return steps.find((step) => step.t <= t && (step.end === undefined || t <= step.end));
}

function describe(step) {
  if (!step) return "a click";
  return step.label ? `${step.action} "${step.label}"` : step.action;
}

// A hold can log several regions with the same start; the renderer merges
// them into one, so the gaps are measured between the merged regions.
function mergedRegions(suggestions) {
  const byStart = new Map();
  for (const region of suggestions ?? []) {
    const prev = byStart.get(region.start);
    byStart.set(region.start, prev ? { ...prev, end: Math.max(prev.end, region.end) } : { ...region });
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

/**
 * Pacing findings for one clip's logs. Each finding has the time it happens
 * (ms into the clip), a kind and a message.
 */
export function checkPacing({ clicks = [], steps = [], narration = [], zooms = [] }) {
  const findings = [];
  // A wait that starts a zoom logs a focus-only entry: no pointer moves, so
  // it can't rush or jump.
  const pointerClicks = clicks.filter((click) => !click.focusOnly);

  for (let i = 1; i < pointerClicks.length; i += 1) {
    const prev = pointerClicks[i - 1];
    const next = pointerClicks[i];
    const dwellMs = next.moveStartT - prev.t;
    if (Number.isFinite(dwellMs) && dwellMs < PACING_MIN_DWELL_MS) {
      findings.push({
        t: prev.t,
        kind: "rushed exit",
        message:
          `the cursor leaves ${describe(stepAt(steps, prev.t))} ${dwellMs}ms after clicking, ` +
          `before its result shows. Give the step a pause (≥${PACING_MIN_DWELL_MS}ms; drop "pause: 0").`,
      });
    }
  }

  for (const click of pointerClicks) {
    const approachMs = click.t - click.moveStartT;
    if (Number.isFinite(approachMs) && approachMs < PACING_MIN_APPROACH_MS) {
      findings.push({
        t: click.t,
        kind: "jump",
        message:
          `the cursor reaches ${describe(stepAt(steps, click.t))} ${approachMs}ms after setting off, ` +
          `which reads as a jump. Raise moveDurationMs / preClickMs (≥${PACING_MIN_APPROACH_MS}ms together).`,
      });
    }
  }

  const regions = mergedRegions(zooms);
  for (let i = 1; i < regions.length; i += 1) {
    const gapMs = regions[i].start - regions[i - 1].end;
    if (gapMs >= PACING_PUMP_GAP_MS[0] && gapMs < PACING_PUMP_GAP_MS[1]) {
      const between = steps
        .filter((step) => step.t >= regions[i - 1].end && step.t < regions[i].start)
        .filter((step) => POINTER_ACTIONS.has(step.action))
        .map(describe);
      findings.push({
        t: regions[i - 1].end,
        kind: "zoom pump",
        message:
          `the camera zooms out and back in ${seconds(gapMs)} later` +
          (between.length ? ` (around ${between.join(", ")})` : "") +
          `. Close the gap under 1s so it glides, give the clicks between "zoom": false, ` +
          `or open it past ${seconds(PACING_PUMP_GAP_MS[1])} as a deliberate full-frame beat.`,
      });
    }
  }

  for (const step of steps) {
    const waitedMs = (step.end ?? step.t) - step.t;
    if (step.skipped && waitedMs > PACING_MAX_SKIPPED_WAIT_MS) {
      findings.push({
        t: step.t,
        kind: "skipped",
        message:
          `optional ${describe(step)} waited ${seconds(waitedMs)} for a target that never appeared. ` +
          `Drop the step if it never shows in this flow, or give it a shorter timeout.`,
      });
    }
  }

  // Dead air: runs of non-pointer steps (wait, waitFor, press, goto) that no
  // narration line carries. A line starting a pause carries it until the run
  // ends, so only the stretch before the run's first line can be dead.
  const lineStarts = narration.map((line) => line.t).sort((a, b) => a - b);
  let run = [];
  const flushRun = () => {
    if (run.length === 0) return;
    const start = run[0].t;
    const end = run.at(-1).end ?? run.at(-1).t;
    const firstLine = lineStarts.find((t) => t >= start - PACING_LINE_CARRY_MS && t < end);
    const idleEnd =
      firstLine === undefined ? end : firstLine <= start + PACING_LINE_CARRY_MS ? start : firstLine;
    const idleMs = idleEnd - start;
    if (idleMs > PACING_MAX_IDLE_MS) {
      const inside = run
        .filter((step) => (step.end ?? step.t) > start && step.t < idleEnd)
        .map((step) => (step.action === "wait" ? "wait" : describe(step)));
      findings.push({
        t: start,
        kind: "dead air",
        message:
          `${seconds(idleMs)} with no pointer step and no line (${inside.join(", ")}). ` +
          `Shorten the waits, or put a line on the step that starts it if the pause means something.`,
      });
    }
    run = [];
  };
  for (const step of steps) {
    if (POINTER_ACTIONS.has(step.action)) {
      flushRun();
    } else {
      run.push(step);
    }
  }
  flushRun();

  return findings.sort((a, b) => a.t - b.t);
}

// Each clip's logs under an .output dir (or its artifacts/ subfolder), keyed by
// the clip's stem, e.g. <flow>-desktop.
function clipsIn(input) {
  const stat = fs.statSync(input);
  if (!stat.isDirectory()) {
    const stem = input.replace(/\.(clicks\.jsonl|steps\.jsonl|zooms\.json|narration\.json)$/, "");
    return [stem];
  }
  const artifactsDir = path.join(input, "artifacts");
  const dir = fs.existsSync(artifactsDir) ? artifactsDir : input;
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".clicks.jsonl"))
    .map((name) => path.join(dir, name.replace(/\.clicks\.jsonl$/, "")));
}

function printReport(inputs) {
  let total = 0;
  for (const stem of inputs.flatMap(clipsIn)) {
    const logs = {
      clicks: readJsonl(`${stem}.clicks.jsonl`),
      steps: readJsonl(`${stem}.steps.jsonl`),
      narration: readJson(`${stem}.narration.json`, []),
      zooms: readJson(`${stem}.zooms.json`, {}).suggestions ?? [],
    };
    if (logs.clicks.length === 0 && logs.steps.length === 0) continue;
    // A capture with no pointer step and no line (the presentation's own stage
    // recording) has no pacing to check.
    const hasPointerStep = logs.steps.some((step) => POINTER_ACTIONS.has(step.action));
    if (logs.clicks.length === 0 && logs.narration.length === 0 && !hasPointerStep) continue;
    const findings = checkPacing(logs);
    total += findings.length;
    process.stdout.write(`${path.basename(stem)}: ${findings.length ? `${findings.length} to look at` : "ok"}\n`);
    if (logs.steps.length === 0) {
      process.stdout.write("  (no .steps.jsonl: re-record with current tooling to check dead air)\n");
    }
    for (const finding of findings) {
      process.stdout.write(`  ${seconds(finding.t).padStart(6)}  ${finding.kind.padEnd(11)} ${finding.message}\n`);
    }
  }
  if (total > 0) {
    process.stdout.write(
      "\nLog times run a few hundred ms ahead of the video; confirm each finding on the video before changing it.\n",
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    process.stderr.write("Usage: pacing.mjs <flow .output dir | <clip>.clicks.jsonl ...>\n");
    process.exit(2);
  }
  printReport(inputs);
}
