#!/usr/bin/env node
// Wraps two already-recorded clips (e.g. a desktop scenario and a mobile
// scenario recorded via .recordings/tooling/record.mjs) in device-frame
// mockups side by side and re-records the result — see stage.html for the
// actual layout/styling. Reuses the same lossless recorder as everything
// else in .recordings/tooling/, so it gets the same output format;
// see docs/MARKETING/TUTORIAL_VIDEOS/dual-screen-recording-poc.ai.mdx for
// how this came about.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordWalkthrough } from "../record.mjs";
import { probeVideo } from "../render-auto-zoom.mjs";
import { verifyDeliveryFile } from "../delivery-format.mjs";
import {
  loadNarration,
  scheduleNarration,
  NARRATION_IN_MS,
  NARRATION_OUT_MS,
} from "./narration.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 16:9, the aspect ratio every social platform and editor expects.
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const MIME = { ".html": "text/html", ".mp4": "video/mp4", ".webm": "video/webm" };

function printUsage(stream) {
  stream.write(`Usage: compose.mjs --desktop FILE --mobile FILE --out FILE
                  [--header TEXT] [--label-left TEXT] [--label-right TEXT]
                  [--right-frame phone|window]
       compose.mjs --preview [--desktop FILE] [--mobile FILE] [--narration FILE]
                  [--header TEXT] [--label-left TEXT] [--label-right TEXT]
                  [--right-frame phone|window]

Wraps two recorded clips in device-frame mockups (desktop monitor + phone),
side by side, and records the composited result. Both input clips should
already exist (e.g. from record.mjs) — this only handles presentation. The
result carries the house music (see music.mjs).

--right-frame window swaps the phone for a second monitor-style window, for a
right-hand clip that is a desktop app rather than a phone (--mobile still
names that clip). Default: phone.

Narration (the line of text under the devices) is read from the
<clip>.narration.json that record.mjs writes to each clip's artifacts/
subfolder, and the two sides are merged by time and scheduled so every line
stays up long enough to read (narration.mjs; rules in references/narration.md).
--narration FILE names a JSON list of {"t": ms, "text": "..."} instead, for
previewing.

--preview serves the stage and prints its URL instead of recording, so the
layout can be tuned in a browser (stage.html is re-read on every refresh).
The clips are optional there; without them the device screens stay black.
`);
}

function parseArgs(argv) {
  const args = {
    desktop: null,
    mobile: null,
    out: null,
    header: null,
    narration: null,
    labelLeft: "Broadcaster",
    labelRight: "Viewer",
    rightFrame: "phone",
    preview: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--desktop") args.desktop = argv[++i];
    else if (arg === "--mobile") args.mobile = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--header") args.header = argv[++i];
    else if (arg === "--narration") args.narration = argv[++i];
    else if (arg === "--label-left") args.labelLeft = argv[++i];
    else if (arg === "--label-right") args.labelRight = argv[++i];
    else if (arg === "--right-frame") {
      args.rightFrame = argv[++i];
      if (!["phone", "window"].includes(args.rightFrame)) {
        throw new Error(`--right-frame must be "phone" or "window", got: ${args.rightFrame}`);
      }
    } else if (arg === "--preview") args.preview = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unrecognized argument: ${arg}`);
  }
  return args;
}

function serveStage({ desktopPath, mobilePath, narration = [] }) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      let filePath;
      if (url.pathname === "/" || url.pathname === "/stage.html") {
        filePath = path.join(__dirname, "stage.html");
      } else if (url.pathname === "/desktop.mp4" && desktopPath) {
        filePath = desktopPath;
      } else if (url.pathname === "/mobile.mp4" && mobilePath) {
        filePath = mobilePath;
      } else if (url.pathname === "/narration.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(narration));
        return;
      } else {
        res.writeHead(404);
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      const stat = fs.statSync(filePath);
      const contentType = MIME[ext] ?? "application/octet-stream";
      const range = req.headers.range;
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        res.writeHead(206, {
          "Content-Type": contentType,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { "Content-Type": contentType, "Content-Length": stat.size, "Accept-Ranges": "bytes" });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function stageQuery({ header, labelLeft, labelRight, rightFrame, hasNarration }) {
  const query = new URLSearchParams({
    desktop: "/desktop.mp4",
    mobile: "/mobile.mp4",
    labelLeft,
    labelRight,
    narrationIn: String(NARRATION_IN_MS),
    narrationOut: String(NARRATION_OUT_MS),
  });
  if (typeof header === "string") query.set("header", header);
  if (rightFrame === "window") query.set("rightFrame", rightFrame);
  if (hasNarration) query.set("narration", "/narration.json");
  return query;
}

async function previewStage(options) {
  const desktopPath = options.desktop && path.resolve(options.desktop);
  const mobilePath = options.mobile && path.resolve(options.mobile);
  const { lines, warnings } = scheduleNarration(
    loadNarration({ desktopPath, mobilePath, narrationFile: options.narration }),
  );
  warnings.forEach((warning) => process.stderr.write(`narration: ${warning}\n`));
  const server = await serveStage({ desktopPath, mobilePath, narration: lines });
  const port = server.address().port;
  const query = stageQuery({ ...options, hasNarration: lines.length > 0 });
  query.set("fit", "1");
  process.stdout.write(`Preview: http://127.0.0.1:${port}/stage.html?${query}\n`);
  process.stdout.write("Serving until Ctrl+C — edit stage.html and refresh.\n");
}

export async function composePresentation(options) {
  const desktopPath = path.resolve(options.desktop);
  const mobilePath = path.resolve(options.mobile);
  const outPath = path.resolve(options.out);
  const [desktopProbe, mobileProbe] = await Promise.all([probeVideo(desktopPath), probeVideo(mobilePath)]);
  const tailPaddingMs = Number.isFinite(options.tailPaddingMs) ? options.tailPaddingMs : 800;
  const waitMs = Math.max(desktopProbe.durationMs, mobileProbe.durationMs) + tailPaddingMs;

  const { lines, warnings } = scheduleNarration(
    loadNarration({ desktopPath, mobilePath, narrationFile: options.narration }),
    { endMs: waitMs },
  );
  warnings.forEach((warning) => process.stderr.write(`narration: ${warning}\n`));
  const server = await serveStage({ desktopPath, mobilePath, narration: lines });
  const port = server.address().port;
  // Always pass a header (empty if none) so a recording never falls back to
  // the stage's sample title, which is only for previewing.
  const query = stageQuery({
    ...options,
    header: options.header ?? "",
    hasNarration: lines.length > 0,
  });

  let result;
  try {
    result = await recordWalkthrough({
      scenario: {
        url: `http://127.0.0.1:${port}/stage.html?${query}`,
        effects: { captions: false, cursor: false },
        steps: [{ action: "wait", ms: waitMs }],
      },
      out: outPath,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
    });
  } finally {
    server.close();
  }

  // The video is postable as recorded; make sure the stage really is 16:9 1080p.
  verifyDeliveryFile(outPath, { width: STAGE_WIDTH, height: STAGE_HEIGHT });
  return result;
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    printUsage(process.stderr);
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (args.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (args.preview) {
    await previewStage(args);
    return null;
  }
  if (!args.desktop || !args.mobile || !args.out) {
    printUsage(process.stderr);
    return 2;
  }
  const result = await composePresentation(args);
  process.stdout.write(`${JSON.stringify({ out: result.out }, null, 2)}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // A null code means the process should stay alive (preview server running).
  main().then((code) => {
    if (code !== null) process.exit(code);
  });
}
