#!/usr/bin/env node
// Wraps any number of already-recorded clips (e.g. a desktop scenario and a
// mobile scenario recorded via .appreel/tooling/record.mjs) in device-frame
// mockups side by side and re-records the result — see stage.html for the
// actual layout/styling. Reuses the same lossless recorder as everything
// else in .appreel/tooling/, so it gets the same output format.
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
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};
// The project's own brand (.appreel/brand/ once installed, beside tooling/),
// picked up automatically when it holds a brand.html — like music/.
const DEFAULT_BRAND_DIR = path.join(__dirname, "..", "..", "brand");
// "custom" needs a customFrame directory (template.html + style.css) this
// package never ships — bring your own. "none" is fullscreen, no wrapper.
const FRAME_TYPES = ["desktop", "mobile", "mac", "windows", "chrome", "custom", "none"];

function printUsage(stream) {
  stream.write(`Usage: compose.mjs --screens FILE --out FILE [--header TEXT] [--wordmark TEXT]
                  [--brand DIR | --no-brand] [--intro FILE [--intro-ms N]] [--narration FILE]
       compose.mjs --preview --screens FILE [--narration FILE] [--header TEXT] [--wordmark TEXT]
                  [--brand DIR | --no-brand]

Wraps any number of recorded clips in device frames, side by side, and
records the composited result. Clips should already exist (e.g. from
record.mjs) — this only handles presentation. The result carries the house
music (see music.mjs).

--screens FILE points to a JSON array (composePresentation() also accepts
this as a plain array directly, when called from a flow's record.mjs):

  [
    { "name": "desktop", "label": "Desktop", "frame": "desktop", "clip": "desktop.mp4" },
    { "name": "mobile",  "label": "Mobile",  "frame": "mobile",  "clip": "mobile.mp4" }
  ]

frame is one of: ${FRAME_TYPES.join(" | ")}.
"custom" also takes customFrame: a directory with template.html (containing
one element marked data-video-slot) and style.css. This package ships no
default look for it — bring your own, or ask your coding agent to write one.
"none" is fullscreen, no device wrapper at all. "chrome" also takes url: the
text in its address bar (the tab shows the label); without it, both show the
label.

A screen can also take enterAtMs: a time on the clips' shared clock (they all
start together) when it joins the stage. Until then it is hidden and the
other screens sit centered without it; at that time they slide aside and it
fades in. Use it for a screen that has nothing to show yet, like a viewer
whose page only exists once the other screen has created it. exitAtMs is the
reverse: the screen fades out and the others close up, e.g. a browser window
that is only on stage while something is copied from it. The row is sized
for the most screens on stage at any one time, so screens that are never on
stage together don't shrink each other. At least one screen must be on stage
from the start.

Brand: .appreel/brand/ holds the project's own brand, in HTML. When it has a
brand.html, every video shows that fragment above the title, styled by an
optional style.css beside it (which can also place things elsewhere on the
stage, like a logo in a corner). Other files there (images, fonts) are served
alongside, so relative src/href and CSS url() work. --brand DIR uses another
folder for one video; --no-brand leaves it off. See .appreel/brand/README.md.

--wordmark TEXT is the plain-text alternative: a small wordmark above the
title (e.g. your app's name). A brand.html replaces it. Omit both and no
brand mark is shown.

--intro FILE plays an HTML page fullscreen before the stage (an animated
logo, a title card), then crossfades into the stage, and only then do the
clips start. It runs in its own frame, so its styles and scripts never touch
the stage's, and files beside it are served too. --intro-ms N sets how long
it plays (default 3000). From code: intro: { html, durationMs }. Keep intros
you reuse in .appreel/intros/<name>/.

Narration (the line of text under the screens) is read from the
<clip>.narration.json that record.mjs writes to each clip's artifacts/
subfolder, merged across every screen by time and scheduled so every line
stays up long enough to read (narration.mjs; rules in references/narration.md).
A step's narrationFocus should name its screen (or "all" / "none").
--narration FILE names a JSON list of {"t": ms, "text": "..."} instead, for
previewing.

--preview serves the stage and prints its URL instead of recording, so the
layout can be tuned in a browser (stage.html is re-read on every refresh).
Clips are optional there; without them the screens stay black.
`);
}

function parseArgs(argv) {
  const args = {
    screens: null,
    out: null,
    header: null,
    wordmark: null,
    brand: undefined,
    intro: undefined,
    narration: null,
    preview: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--screens") args.screens = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--header") args.header = argv[++i];
    else if (arg === "--wordmark") args.wordmark = argv[++i];
    else if (arg === "--brand") args.brand = argv[++i];
    else if (arg === "--no-brand") args.brand = false;
    else if (arg === "--intro") args.intro = { ...args.intro, html: argv[++i] };
    else if (arg === "--intro-ms") args.intro = { ...args.intro, durationMs: Number(argv[++i]) };
    else if (arg === "--narration") args.narration = argv[++i];
    else if (arg === "--preview") args.preview = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unrecognized argument: ${arg}`);
  }
  return args;
}

// Accepts a path to a JSON file (CLI usage) or an already-parsed array
// (composePresentation()/previewStage() called directly from a flow's
// record.mjs), and validates + normalizes every screen entry.
function resolveScreens(screensOption) {
  const screens =
    typeof screensOption === "string"
      ? JSON.parse(fs.readFileSync(path.resolve(screensOption), "utf8"))
      : (screensOption ?? []);
  if (!Array.isArray(screens) || screens.length === 0) {
    throw new Error("screens must be a non-empty array of {name, label, frame, clip}");
  }
  const resolved = screens.map((screen) => {
    if (!screen.name) throw new Error("every screen needs a name");
    if (!FRAME_TYPES.includes(screen.frame)) {
      throw new Error(`screen "${screen.name}".frame must be one of ${FRAME_TYPES.join(", ")}`);
    }
    if (screen.frame === "custom" && !screen.customFrame) {
      throw new Error(`screen "${screen.name}" has frame "custom" but no customFrame directory`);
    }
    const enterAtMs = screen.enterAtMs ?? 0;
    if (!Number.isFinite(enterAtMs) || enterAtMs < 0) {
      throw new Error(`screen "${screen.name}".enterAtMs must be a number of milliseconds, 0 or more`);
    }
    const exitAtMs = screen.exitAtMs ?? null;
    if (exitAtMs !== null && (!Number.isFinite(exitAtMs) || exitAtMs <= enterAtMs)) {
      throw new Error(`screen "${screen.name}".exitAtMs must be a number of milliseconds after its enterAtMs`);
    }
    return {
      name: screen.name,
      label: screen.label ?? screen.name,
      frame: screen.frame,
      url: screen.url ?? null,
      clip: screen.clip ? path.resolve(screen.clip) : null,
      customFrame: screen.customFrame ? path.resolve(screen.customFrame) : null,
      enterAtMs,
      exitAtMs,
    };
  });
  if (resolved.every((screen) => screen.enterAtMs > 0)) {
    throw new Error("at least one screen must be on stage from the start (enterAtMs 0 or unset)");
  }
  return resolved;
}

// false leaves the brand off; a path uses that folder (and must hold a
// brand.html); unset falls back to the project's .appreel/brand/, which is
// used only if someone has put a brand.html there.
function resolveBrand(brandOption) {
  if (brandOption === false) return null;
  const dir = path.resolve(brandOption ?? DEFAULT_BRAND_DIR);
  if (!fs.existsSync(path.join(dir, "brand.html"))) {
    if (brandOption) throw new Error(`brand folder ${dir} has no brand.html`);
    return null;
  }
  return { dir, hasStyle: fs.existsSync(path.join(dir, "style.css")) };
}

const DEFAULT_INTRO_MS = 3000;
// Time the reloaded stage takes to show its intro, added to the recording.
const INTRO_LOAD_MARGIN_MS = 500;

// intro: { html, durationMs } → the page to play first, served from its own
// folder so its relative links work. Unset means no intro.
function resolveIntro(introOption) {
  if (!introOption) return null;
  if (typeof introOption.html !== "string") {
    throw new Error("intro needs html: the path to the page to play before the stage");
  }
  const htmlPath = path.resolve(introOption.html);
  if (!fs.existsSync(htmlPath)) throw new Error(`intro page ${htmlPath} does not exist`);
  const durationMs = introOption.durationMs ?? DEFAULT_INTRO_MS;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("intro.durationMs must be a number of milliseconds above 0");
  }
  return { dir: path.dirname(htmlPath), file: path.basename(htmlPath), durationMs };
}

// A file under `prefix` in the URL, from inside `dir` only.
function serveFolderFile(res, url, prefix, dir) {
  const filePath = path.join(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
  const relative = path.relative(dir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  serveFile(res, filePath);
  return true;
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const contentType = MIME[path.extname(filePath)] ?? "application/octet-stream";
  const stat = fs.statSync(filePath);
  res.writeHead(200, { "Content-Type": contentType, "Content-Length": stat.size });
  fs.createReadStream(filePath).pipe(res);
}

// Same as serveFile, plus HTTP range support — required for <video> seeking.
function serveVideo(req, res, filePath) {
  const contentType = MIME[path.extname(filePath)] ?? "application/octet-stream";
  const stat = fs.statSync(filePath);
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
}

function serveStage({ screens = [], narration = [], brand = null, intro = null }) {
  const screenByName = new Map(screens.map((screen) => [screen.name, screen]));
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");

      if (url.pathname === "/" || url.pathname === "/stage.html") {
        return serveFile(res, path.join(__dirname, "stage.html"));
      }

      if (url.pathname === "/screens.json") {
        const publicScreens = screens.map((screen) => ({
          name: screen.name,
          label: screen.label,
          frame: screen.frame,
          url: screen.url,
          enterAtMs: screen.enterAtMs,
          exitAtMs: screen.exitAtMs,
          clip: screen.clip ? `/screen/${encodeURIComponent(screen.name)}.mp4` : null,
          template:
            screen.frame === "custom" && screen.customFrame
              ? `/frame/${encodeURIComponent(screen.name)}/template.html`
              : null,
          style:
            screen.frame === "custom" && screen.customFrame
              ? `/frame/${encodeURIComponent(screen.name)}/style.css`
              : null,
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(publicScreens));
        return;
      }

      if (url.pathname === "/narration.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(narration));
        return;
      }

      const screenMatch = url.pathname.match(/^\/screen\/([^/]+)\.mp4$/);
      if (screenMatch) {
        const screen = screenByName.get(decodeURIComponent(screenMatch[1]));
        if (screen?.clip) return serveVideo(req, res, screen.clip);
      }

      const frameMatch = url.pathname.match(/^\/frame\/([^/]+)\/(template\.html|style\.css)$/);
      if (frameMatch) {
        const screen = screenByName.get(decodeURIComponent(frameMatch[1]));
        if (screen?.customFrame) return serveFile(res, path.join(screen.customFrame, frameMatch[2]));
      }

      // Anything in the brand or intro folder, so their own relative links resolve.
      if (brand && url.pathname.startsWith("/brand/")) {
        if (serveFolderFile(res, url, "/brand/", brand.dir)) return;
      }
      if (intro && url.pathname.startsWith("/intro/")) {
        if (serveFolderFile(res, url, "/intro/", intro.dir)) return;
      }

      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Screen data (name/label/frame/clip URLs) goes to the page via /screens.json,
// fetched client-side — an N-length structured array doesn't belong in a
// query string. Only the handful of page-wide scalars go here.
function stageQuery({ header, wordmark, brand, intro, hasNarration }) {
  const query = new URLSearchParams({
    narrationIn: String(NARRATION_IN_MS),
    narrationOut: String(NARRATION_OUT_MS),
  });
  if (typeof header === "string") query.set("header", header);
  if (typeof wordmark === "string") query.set("wordmark", wordmark);
  if (brand) query.set("brand", brand.hasStyle ? "html+css" : "html");
  if (intro) {
    query.set("intro", `/intro/${encodeURIComponent(intro.file)}`);
    query.set("introMs", String(intro.durationMs));
  }
  if (hasNarration) query.set("narration", "/narration.json");
  return query;
}

async function previewStage(options) {
  const screens = resolveScreens(options.screens);
  const { lines, warnings } = scheduleNarration(
    loadNarration({ screens, narrationFile: options.narration }),
  );
  warnings.forEach((warning) => process.stderr.write(`narration: ${warning}\n`));
  const brand = resolveBrand(options.brand);
  const intro = resolveIntro(options.intro);
  const server = await serveStage({ screens, narration: lines, brand, intro });
  const port = server.address().port;
  const query = stageQuery({ ...options, brand, intro, hasNarration: lines.length > 0 });
  query.set("fit", "1");
  process.stdout.write(`Preview: http://127.0.0.1:${port}/stage.html?${query}\n`);
  process.stdout.write("Serving until Ctrl+C — edit stage.html and refresh.\n");
}

export async function composePresentation(options) {
  const screens = resolveScreens(options.screens);
  const outPath = path.resolve(options.out);
  const probes = await Promise.all(screens.map((screen) => probeVideo(screen.clip)));
  const tailPaddingMs = Number.isFinite(options.tailPaddingMs) ? options.tailPaddingMs : 800;
  const waitMs = Math.max(...probes.map((probe) => probe.durationMs)) + tailPaddingMs;

  const { lines, warnings } = scheduleNarration(
    loadNarration({ screens, narrationFile: options.narration }),
    { endMs: waitMs },
  );
  warnings.forEach((warning) => process.stderr.write(`narration: ${warning}\n`));
  const brand = resolveBrand(options.brand);
  const intro = resolveIntro(options.intro);
  const server = await serveStage({ screens, narration: lines, brand, intro });
  const port = server.address().port;
  // Always pass a header (empty if none) so a recording never falls back to
  // the stage's sample title, which is only for previewing.
  const query = stageQuery({
    ...options,
    brand,
    intro,
    header: options.header ?? "",
    wordmark: options.wordmark ?? "",
    hasNarration: lines.length > 0,
  });
  const stageUrl = `http://127.0.0.1:${port}/stage.html?${query}`;

  let result;
  try {
    result = await recordWalkthrough({
      scenario: {
        url: stageUrl,
        effects: { captions: false, cursor: false },
        // An intro is the video's first frames, so it can't start while the
        // page is still being set up for recording: reload the stage once
        // capture is running, and wait out the intro (plus a moment for the
        // reload) as well as the clips.
        steps: intro
          ? [
              { action: "goto", url: stageUrl },
              { action: "wait", ms: waitMs + intro.durationMs + INTRO_LOAD_MARGIN_MS },
            ]
          : [{ action: "wait", ms: waitMs }],
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
  if (!args.screens || !args.out) {
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
