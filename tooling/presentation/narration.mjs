#!/usr/bin/env node
// The line of text under the devices in a side-by-side video. record.mjs logs
// when each narrated step starts; this turns those times into what the viewer
// actually sees. The rules are in references/narration.md.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// How long a line takes to rise in and to rise out. Slow enough to see the
// motion; stage.html gets these from compose.mjs so the two never disagree.
export const NARRATION_IN_MS = 672;
export const NARRATION_OUT_MS = 546;
// Once a line has finished rising in it stays readable at least this long, and
// longer lines for as long as their length needs, at about the pace subtitles
// allow. The floor is generous because the old line starts fading the moment
// the next begins, so a short line is legible for less time than its hold, and
// viewers need real breathing room on a line of two or three words (1.2s was
// still too quick).
export const NARRATION_MIN_READ_MS = 2100;
export const NARRATION_CHARS_PER_SEC = 17;
// A line pushed later than this after its step started stops reading as
// leading the action, so it is reported rather than quietly accepted. A line
// that stays up a long time can start later: the allowance is this or a quarter
// of the time the line is on screen, whichever is greater.
export const NARRATION_MAX_DEFER_MS = 1500;
export const NARRATION_DEFER_SHARE = 0.25;

// How long after a line starts before the next may replace it: the time to rise
// in, so the animation never eats into the reading time, plus the reading time.
export function narrationHoldMs(text) {
  const readMs = Math.max(
    NARRATION_MIN_READ_MS,
    Math.ceil((text.length / NARRATION_CHARS_PER_SEC) * 1000),
  );
  return NARRATION_IN_MS + readMs;
}

// record.mjs writes a clip's narration log to artifacts/<clip name>.narration.json
// beside it, not next to the clip itself (see record.mjs's captureRecording).
function narrationPathForClip(clip) {
  const base = path.basename(clip).replace(/\.(mp4|webm)$/i, ".narration.json");
  return path.join(path.dirname(clip), "artifacts", base);
}

// The inverse: from an artifacts/<name>.narration.json file back to the
// <name>.mp4 clip one directory up.
function clipPathForNarration(file) {
  const base = path.basename(file).replace(/\.narration\.json$/, ".mp4");
  return path.join(path.dirname(path.dirname(file)), base);
}

// One timeline for the whole stage: each screen's narration file, merged by
// time. Every screen's clip starts together, so their times share a clock. A
// given narrationFile replaces the per-screen files (for previewing).
// Each line is tagged with the name of the screen its step is on, which is
// the screen it calls attention to unless the line says otherwise (its own
// `focus` field wins — see scheduleNarration).
export function loadNarration({ screens = [], narrationFile } = {}) {
  const sources = narrationFile
    ? [{ file: path.resolve(narrationFile) }]
    : screens
        .filter((screen) => screen.clip)
        .map(({ name, clip }) => ({ file: narrationPathForClip(clip), side: name }));
  return sources
    .filter(({ file }) => fs.existsSync(file))
    .flatMap(({ file, side }) =>
      JSON.parse(fs.readFileSync(file, "utf8")).map((entry) => (side ? { side, ...entry } : entry)),
    )
    .sort((a, b) => a.t - b.t);
}

// Turns the times steps started at into the times lines appear. Every line is
// shown, in order, and none is shown before its step started. A line that would
// replace another too soon waits until the earlier one has had its hold.
export function scheduleNarration(entries, { endMs } = {}) {
  const lines = [];
  const warnings = [];
  let earliest = 0;
  let stepNumber = 0;
  for (const entry of [...entries].sort((a, b) => a.t - b.t)) {
    const start = Math.max(entry.t, earliest);
    const deferMs = start - entry.t;
    // A header of "step" is numbered by the order lines appear, across both
    // sides, so adding or moving a step renumbers the rest.
    const header = entry.text && entry.header === "step" ? `Step ${(stepNumber += 1)}` : entry.header;
    lines.push({
      start,
      text: entry.text,
      t: entry.t,
      deferMs,
      style: entry.style,
      header: entry.text ? header : undefined,
      focus: entry.text ? (entry.focus ?? entry.side ?? "none") : "none",
    });
    earliest = entry.text ? start + narrationHoldMs(entry.text) : start;
  }
  lines.forEach((line, i) => {
    if (!line.text) return;
    const upMs = (lines[i + 1]?.start ?? endMs ?? line.start) - line.start;
    const allowedMs = Math.max(NARRATION_MAX_DEFER_MS, NARRATION_DEFER_SHARE * upMs);
    if (line.deferMs > allowedMs) {
      warnings.push(
        `"${line.text}" is shown ${(line.deferMs / 1000).toFixed(1)}s after its step started ` +
          `(limit ${(allowedMs / 1000).toFixed(1)}s for a line up ${(upMs / 1000).toFixed(1)}s): ` +
          `the line before it is too close. Merge the two beats or move this line to a later step.`,
      );
    }
  });
  const last = lines.at(-1);
  if (endMs !== undefined && last?.text && endMs - last.start < narrationHoldMs(last.text)) {
    warnings.push(
      `"${last.text}" starts at ${(last.start / 1000).toFixed(1)}s and the video ends at ` +
        `${(endMs / 1000).toFixed(1)}s, too soon to read it. Move it earlier or add tail padding.`,
    );
  }
  return { lines, warnings };
}

// `node narration.mjs <flow .output dir | *.narration.json ...>` prints the
// schedule: when each line appears, how long it stays, and any warnings.
function printTimeline(inputs) {
  const files = inputs.flatMap((input) => {
    if (!fs.statSync(input).isDirectory()) {
      return [input];
    }
    // record.mjs writes the logs to an artifacts/ subfolder of .output, not
    // .output itself; fall back to the given directory for an older flat run.
    const artifactsDir = path.join(input, "artifacts");
    const dir = fs.existsSync(artifactsDir) ? artifactsDir : input;
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".narration.json"))
      .map((name) => path.join(dir, name));
  });
  const entries = files.flatMap((file) => {
    const screenName = path.basename(file).replace(/\.narration\.json$/, "").split("-").at(-1);
    return JSON.parse(fs.readFileSync(file, "utf8")).map((entry) => ({
      side: screenName,
      ...entry,
      source: screenName,
    }));
  });
  // How long the finished video runs, as compose.mjs works it out: the longest
  // clip beside the narration files plus its tail, so the last line's warning
  // knows how long it stays up.
  const durations = files
    .map((file) => clipPathForNarration(file))
    .filter((clip) => fs.existsSync(clip))
    .map((clip) =>
      Number(
        spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip], {
          encoding: "utf8",
        }).stdout.trim(),
      ),
    )
    .filter(Number.isFinite);
  const endMs = durations.length ? Math.max(...durations) * 1000 + 800 : undefined;
  const { lines, warnings } = scheduleNarration(entries, { endMs });
  lines.forEach((line, i) => {
    const source = entries.find((entry) => entry.t === line.t && entry.text === line.text);
    const upMs = i < lines.length - 1 ? lines[i + 1].start - line.start : null;
    const defer = line.deferMs > 0 ? `+${(line.deferMs / 1000).toFixed(1)}s late` : "";
    process.stdout.write(
      `${(line.start / 1000).toFixed(1).padStart(5)}s  ${(source?.source ?? "").padEnd(8)} ` +
        `${(upMs === null ? "to end" : `${(upMs / 1000).toFixed(1)}s up`).padEnd(9)}` +
        `${defer.padEnd(11)} ${(line.focus ?? "").padEnd(6)} ${(line.header ?? "").padEnd(16)} ` +
        `${line.text || "(cleared)"}${line.style === "aside" ? "  [aside]" : ""}\n`,
    );
  });
  warnings.forEach((warning) => process.stdout.write(`WARNING: ${warning}\n`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    process.stderr.write("Usage: narration.mjs <flow .output dir | FILE.narration.json ...>\n");
    process.exit(2);
  }
  printTimeline(inputs);
}
