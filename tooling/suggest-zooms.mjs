#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MERGE_GAP_MS = 2500;
export const PAD_MS = 500;
export const DOUBLE_CLICK_MS = 350;
export const DOUBLE_CLICK_DIST = 0.04;
export const ZOOM_SCALE = 1.5;
/** How far a zoom may go: past 1 (no zoom), up to 4x (a quarter of the viewport). */
export const MAX_ZOOM_SCALE = 4;
export const ZOOM_SCALE_PROBLEM = `must be a number above 1 and at most ${MAX_ZOOM_SCALE} (the default is ${ZOOM_SCALE})`;

export function isValidZoomScale(value) {
  return Number.isFinite(value) && value > 1 && value <= MAX_ZOOM_SCALE;
}
/** Normalized viewport distance — clicks closer than this can share one zoom. */
export const MERGE_DIST = 0.35;

export function resolveZoomMergeOptions(scenario = {}) {
  return {
    mergeDist: Number.isFinite(scenario.zoomMergeDist)
      ? scenario.zoomMergeDist
      : MERGE_DIST,
    mergeGapMs: Number.isFinite(scenario.zoomMergeGapMs)
      ? scenario.zoomMergeGapMs
      : MERGE_GAP_MS,
  };
}

export function clicksAreZoomContinuous(prev, next, options = {}) {
  const mergeDist = options.mergeDist ?? MERGE_DIST;
  const mergeGapMs = options.mergeGapMs ?? MERGE_GAP_MS;
  if (!prev || !next) {
    return false;
  }
  return (
    Math.hypot(next.cx - prev.cx, next.cy - prev.cy) <= mergeDist &&
    next.timeMs - prev.timeMs <= mergeGapMs
  );
}

const CLICK_TYPES = new Set(["click", "double-click", "right-click", "middle-click"]);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseSamples(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON click log must be an array");
    }
    return parsed;
  }
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`invalid JSONL on line ${index + 1}`);
      }
    });
}

function buttonToType(button) {
  if (button === "right") {
    return "right-click";
  }
  if (button === "middle") {
    return "middle-click";
  }
  return "click";
}

export function normalizeSamples(rawSamples) {
  return rawSamples
    .filter((sample) => sample && typeof sample === "object")
    .map((sample) => {
      const timeMs = Number(sample.timeMs ?? sample.t ?? 0);
      let cx = Number(sample.cx);
      let cy = Number(sample.cy);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
        const vx = Number(sample.vx);
        const vy = Number(sample.vy);
        const width = Number(sample.viewportWidth ?? sample.innerW ?? 0);
        const height = Number(sample.viewportHeight ?? sample.innerH ?? 0);
        if (Number.isFinite(vx) && Number.isFinite(vy) && width > 0 && height > 0) {
          cx = vx / width;
          cy = vy / height;
        }
      }
      const action = sample.interactionType ?? sample.action;
      let interactionType;
      if (action === "dblclick" || action === "doubleclick") {
        interactionType = "double-click";
      } else if (action === "click" && sample.button) {
        interactionType = buttonToType(sample.button);
      } else if (CLICK_TYPES.has(action) || action === "move" || action === "mouseup") {
        interactionType = action;
      } else if (sample.button) {
        interactionType = buttonToType(sample.button);
      }
      return {
        timeMs: Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0,
        cx: Number.isFinite(cx) ? clamp(cx, 0, 1) : 0.5,
        cy: Number.isFinite(cy) ? clamp(cy, 0, 1) : 0.5,
        interactionType,
        moveStartT: Number.isFinite(sample.moveStartT)
          ? Math.max(0, Number(sample.moveStartT))
          : undefined,
        zoomStartT: Number.isFinite(sample.zoomStartT)
          ? Math.max(0, Number(sample.zoomStartT))
          : undefined,
        holdZoom: Boolean(sample.holdZoom),
        scale: isValidZoomScale(sample.scale) ? Number(sample.scale) : undefined,
        zoomEndT: Number.isFinite(sample.zoomEndT)
          ? Math.max(0, Number(sample.zoomEndT))
          : undefined,
      };
    })
    .sort((a, b) => a.timeMs - b.timeMs);
}

export function classifyDoubleClicks(samples) {
  let lastLeft = null;
  return samples.map((sample) => {
    if (sample.interactionType !== "click") {
      return sample;
    }
    if (
      lastLeft &&
      sample.timeMs - lastLeft.timeMs <= DOUBLE_CLICK_MS &&
      Math.hypot(sample.cx - lastLeft.cx, sample.cy - lastLeft.cy) <= DOUBLE_CLICK_DIST
    ) {
      lastLeft = { ...sample, interactionType: "double-click" };
      return lastLeft;
    }
    lastLeft = sample;
    return sample;
  });
}

function isExplicitClick(interactionType) {
  return typeof interactionType === "string" && CLICK_TYPES.has(interactionType);
}

function clickStrength(interactionType) {
  return interactionType === "double-click" ? 1500 : 900;
}

function clampFocus(focus, _scale) {
  return {
    cx: clamp(focus.cx, 0, 1),
    cy: clamp(focus.cy, 0, 1),
  };
}

function buildClusters(clicks, mergeGapMs, mergeDist) {
  if (clicks.length === 0) {
    return [];
  }

  const sorted = [...clicks].sort((a, b) => a.timeMs - b.timeMs);
  const clusters = [];
  let firstMs = sorted[0].timeMs;
  let lastMs = sorted[0].timeMs;
  let lastFocus = sorted[0].focus;
  let bestStrength = sorted[0].strength;
  let bestFocus = sorted[0].focus;

  for (let i = 1; i < sorted.length; i += 1) {
    const click = sorted[i];
    const withinTime = click.timeMs - lastMs <= mergeGapMs;
    const withinSpace = Math.hypot(click.focus.cx - lastFocus.cx, click.focus.cy - lastFocus.cy) <= mergeDist;
    if (withinTime && withinSpace) {
      lastMs = Math.max(lastMs, click.timeMs);
      // Recency wins ties so the zoom keeps following the cursor within a merged cluster.
      if (click.strength >= bestStrength) {
        bestStrength = click.strength;
        bestFocus = click.focus;
      }
    } else {
      clusters.push({ firstMs, lastMs, focus: bestFocus });
      firstMs = click.timeMs;
      lastMs = click.timeMs;
      bestStrength = click.strength;
      bestFocus = click.focus;
    }
    lastFocus = click.focus;
  }
  clusters.push({ firstMs, lastMs, focus: bestFocus });
  return clusters;
}

export function suggestZooms(rawSamples, totalMs, options = {}) {
  const zoomInMs = options.zoomInMs ?? 600;
  const zoomOutMs = options.zoomOutMs ?? 600;
  const scale = options.scale ?? ZOOM_SCALE;

  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return { status: "no-slots", suggestions: [] };
  }

  const samples = classifyDoubleClicks(normalizeSamples(rawSamples));
  const clicks = samples.filter((sample) => isExplicitClick(sample.interactionType));

  if (clicks.length === 0) {
    return { status: samples.length === 0 ? "no-telemetry" : "no-interactions", suggestions: [] };
  }

  const suggestions = [];
  for (let i = 0; i < clicks.length; ) {
    const first = clicks[i];
    const moveStart = Number.isFinite(first.moveStartT)
      ? first.moveStartT
      : Math.max(0, first.timeMs - 300);
    const start = Number.isFinite(first.zoomStartT)
      ? first.zoomStartT
      : Math.max(0, moveStart - zoomInMs);
    let j = i;
    let focus = { cx: first.cx, cy: first.cy };
    const mergeOptions = {
      mergeDist: options.mergeDist ?? MERGE_DIST,
      mergeGapMs: options.mergeGapMs ?? MERGE_GAP_MS,
    };
    while (j + 1 < clicks.length && !Number.isFinite(clicks[j].zoomEndT)) {
      const cur = clicks[j];
      const next = clicks[j + 1];
      const spatiallyContinuous = clicksAreZoomContinuous(cur, next, mergeOptions);
      if (j === i && !clicks[i].holdZoom && !spatiallyContinuous) {
        break;
      }
      if (j > i && !spatiallyContinuous) {
        break;
      }
      j += 1;
      focus = { cx: clicks[j].cx, cy: clicks[j].cy };
    }
    const last = clicks[j];
    const end = Math.min(
      totalMs,
      Number.isFinite(last.zoomEndT) ? last.zoomEndT : last.timeMs + zoomOutMs,
    );
    if (end > start) {
      // A stretch's own zoomScale (logged on its clicks) wins over the default.
      const regionScale = first.scale ?? scale;
      suggestions.push({
        start,
        end,
        focus: clampFocus(focus, regionScale),
        scale: regionScale,
      });
    }
    i = j + 1;
  }

  if (suggestions.length === 0) {
    return { status: "no-slots", suggestions: [] };
  }

  suggestions.sort((a, b) => a.start - b.start);
  return { status: "ok", suggestions };
}

function printUsage(stream) {
  stream.write(`Usage: suggest-zooms.mjs --clicks FILE --duration-ms MS [--out FILE]

Cluster explicit clicks into auto-zoom regions (JSON on stdout).
FILE is JSONL or a JSON array. Each click needs t/timeMs and cx, cy.
`);
}

function parseArgs(argv) {
  const args = { clicks: null, durationMs: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--clicks") {
      args.clicks = argv[i + 1];
      i += 1;
    } else if (arg === "--duration-ms") {
      args.durationMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return args;
}

export async function main(argv = process.argv.slice(2), io = process) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    printUsage(io.stderr);
    io.stderr.write(`${error.message}\n`);
    return 2;
  }

  if (args.help) {
    printUsage(io.stdout);
    return 0;
  }

  if (!args.clicks || !Number.isFinite(args.durationMs)) {
    printUsage(io.stderr);
    return 2;
  }

  const text = fs.readFileSync(path.resolve(args.clicks), "utf8");
  const result = suggestZooms(parseSamples(text), args.durationMs);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), json);
  } else {
    io.stdout.write(json);
  }
  return 0;
}

// Skills are installed as symlinks, so argv[1] is the link while import.meta.url
// is always the real path. Comparing them unresolved makes main() never run, and
// the command exits 0 having done nothing.
function isMainModule(arg) {
  if (!arg) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(arg))).href;
  } catch {
    return false;
  }
}

if (isMainModule(process.argv[1])) {
  main().then((code) => {
    process.exit(code);
  });
}
