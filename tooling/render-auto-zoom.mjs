#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DELIVERY_ENCODE_ARGS,
  DELIVERY_FILTER_TAIL,
  verifyDeliveryFile,
} from "./delivery-format.mjs";
import { parseSamples, suggestZooms, ZOOM_SCALE } from "./suggest-zooms.mjs";

export const ZOOM_IN_MS = 600;
export const ZOOM_OUT_MS = 600;
// Two regions closer together than this stay zoomed and slide from one focus to
// the next, instead of zooming out and straight back in.
export const ZOOM_GLIDE_GAP_MS = 1000;
// A slide starts this long after the previous region's last click, not at it.
// Frames reach the video a few hundred ms after the click that made them, so a
// slide timed to the click itself starts before the viewer has seen it land.
export const ZOOM_GLIDE_HOLD_MS = 400;

function printUsage(stream) {
  stream.write(`Usage: render-auto-zoom.mjs --video FILE --out FILE [--zooms FILE | --clicks FILE]

Apply auto-zoom regions to a recorded viewport video. Needs ffmpeg on PATH.
Pass --zooms from suggest-zooms.mjs, or --clicks plus optional --duration-ms.
`);
}

function parseArgs(argv) {
  const args = {
    video: null,
    out: null,
    zooms: null,
    clicks: null,
    durationMs: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--video" || arg === "--out" || arg === "--zooms" || arg === "--clicks") {
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (arg === "--duration-ms" || arg === "--trim-start-ms") {
      args[arg === "--duration-ms" ? "durationMs" : "trimStartMs"] = Number(argv[i + 1]);
      i += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return args;
}

function run(command, argv, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      stdio: ["ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function parseFrameRate(rate) {
  if (!rate || typeof rate !== "string") {
    return 30;
  }
  if (rate.includes("/")) {
    const [num, den] = rate.split("/").map(Number);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }
  const value = Number(rate);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export async function probeVideo(videoPath) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath,
  ]);
  const info = JSON.parse(stdout);
  const video = (info.streams ?? []).find((stream) => stream.codec_type === "video");
  if (!video) {
    throw new Error(`no video stream in ${videoPath}`);
  }
  const duration = Number(info.format?.duration ?? video.duration);
  const fps = parseFrameRate(video.avg_frame_rate) || parseFrameRate(video.r_frame_rate);
  return {
    durationMs: Math.round(duration * 1000),
    width: Number(video.width),
    height: Number(video.height),
    fps,
  };
}

function even(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function loadZooms(args, durationMs) {
  const zoomOptions = {
    zoomInMs: args.zoomInMs,
    zoomOutMs: args.zoomOutMs,
    scale: args.scale,
  };
  if (args.zooms) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(args.zooms), "utf8"));
    if (Array.isArray(parsed)) {
      return { status: parsed.length ? "ok" : "no-interactions", suggestions: parsed };
    }
    return parsed;
  }
  if (args.clicks) {
    const samples = parseSamples(fs.readFileSync(path.resolve(args.clicks), "utf8"));
    return suggestZooms(samples, durationMs, zoomOptions);
  }
  throw new Error("need --zooms or --clicks");
}

function buildSegments(suggestions, durationMs, timing = {}) {
  const zoomInMs = timing.zoomInMs ?? ZOOM_IN_MS;
  const zoomOutMs = timing.zoomOutMs ?? ZOOM_OUT_MS;
  const glideGapMs = timing.glideGapMs ?? ZOOM_GLIDE_GAP_MS;
  const glideHoldMs = timing.glideHoldMs ?? ZOOM_GLIDE_HOLD_MS;
  const segments = [];
  let cursor = 0;
  for (const region of suggestions) {
    const start = clampTime(region.start, durationMs);
    const end = clampTime(region.end, durationMs);
    if (end <= start) {
      continue;
    }
    const cx = Number(region.focus?.cx ?? 0.5);
    const cy = Number(region.focus?.cy ?? 0.5);
    const prev = segments.at(-1);
    if (prev?.kind === "zoom" && start - prev.end < glideGapMs) {
      // Slide starting a beat after the previous region's last click, over no
      // longer than the zoom-out plus zoom-in it replaces, and done by the time
      // the next one would have been fully in.
      const previousGlideEnd = prev.glides.at(-1)?.endMs ?? prev.start;
      const glideStart = Math.max(previousGlideEnd, prev.end - zoomOutMs + glideHoldMs);
      const glideEnd = Math.min(
        Math.max(glideStart + 1, Math.min(glideStart + zoomOutMs + zoomInMs, start + zoomInMs)),
        end,
      );
      prev.glides.push({ startMs: glideStart, endMs: glideEnd, cx, cy });
      prev.end = Math.max(prev.end, end);
      cursor = prev.end;
      continue;
    }
    if (start > cursor) {
      segments.push({ kind: "plain", start: cursor, end: start });
    }
    segments.push({
      kind: "zoom",
      start,
      end,
      cx,
      cy,
      scale: Number(region.scale ?? ZOOM_SCALE),
      glides: [],
    });
    cursor = end;
  }
  if (cursor < durationMs) {
    segments.push({ kind: "plain", start: cursor, end: durationMs });
  }
  return segments.filter((segment) => segment.end - segment.start >= 1);
}

function clampTime(value, durationMs) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(durationMs, Math.max(0, value));
}

function sec(ms) {
  return (ms / 1000).toFixed(3);
}

// The crop centre along one axis as an expression of the output frame number
// `on`: the segment's first focus, then an eased slide to each glide's focus.
//
// Each focus is first pulled to the nearest centre the crop can really sit at
// (zoompan clamps the crop to the frame anyway). Sliding between the raw
// foci instead would let one axis run into its clamp early and stop while the
// other keeps moving, which reads as "up, then across" rather than a straight
// line. The clamp is a no-op at the endpoints, so nothing else changes.
function focusExpression(segment, axis, fps) {
  const frameAt = (ms) => Math.max(0, Math.round(((ms - segment.start) / 1000) * fps));
  const reachable = (focus) => Math.min(1 - 0.5 / segment.scale, Math.max(0.5 / segment.scale, focus));
  const points = [segment[axis], ...segment.glides.map((glide) => glide[axis])].map(reachable);
  let expr = points.at(-1).toFixed(4);
  for (let i = segment.glides.length - 1; i >= 0; i -= 1) {
    const from = points[i].toFixed(4);
    const to = points[i + 1].toFixed(4);
    const startFrame = frameAt(segment.glides[i].startMs);
    const endFrame = Math.max(startFrame + 1, frameAt(segment.glides[i].endMs));
    expr =
      `if(lt(on,${startFrame}),${from},` +
      `if(lt(on,${endFrame}),${from}+(${to}-${from})*(0.5-0.5*cos(PI*(on-${startFrame})/${endFrame - startFrame})),` +
      `${expr}))`;
  }
  return expr;
}

function zoomFilter(segment, width, height, fps, timing = {}) {
  const durationMs = segment.end - segment.start;
  const zoomInMs = timing.zoomInMs ?? ZOOM_IN_MS;
  const zoomOutMs = timing.zoomOutMs ?? ZOOM_OUT_MS;
  const inMs = Math.max(1, Math.min(zoomInMs, Math.floor(durationMs / 3)));
  const outMs = Math.max(1, Math.min(zoomOutMs, Math.floor(durationMs / 3)));
  const inFrames = Math.max(1, Math.round((inMs / 1000) * fps));
  const outFrames = Math.max(1, Math.round((outMs / 1000) * fps));
  const totalFrames = Math.max(inFrames + outFrames, Math.round((durationMs / 1000) * fps));
  const holdUntil = Math.max(inFrames, totalFrames - outFrames);
  const scale = segment.scale;
  const delta = (scale - 1).toFixed(4);
  const cx = focusExpression(segment, "cx", fps);
  const cy = focusExpression(segment, "cy", fps);
  const z =
    `if(lt(on,${inFrames}),` +
    `1+${delta}*(0.5-0.5*cos(PI*on/${inFrames})),` +
    `if(lt(on,${holdUntil}),${scale},` +
    `1+${delta}*(0.5-0.5*cos(PI*(${totalFrames}-on)/${outFrames}))))`;
  const x = `max(0,min(iw-iw/zoom,(${cx})*iw-iw/zoom/2))`;
  const y = `max(0,min(ih-ih/zoom,(${cy})*ih-ih/zoom/2))`;
  // format=yuv444p (not yuv420p): the intermediate format station is where
  // chroma actually gets subsampled — doing it here, before the encoder,
  // throws away color resolution the final -pix_fmt can't recover later.
  // yuv444p carries full chroma through the whole filter graph; each output
  // branch downsamples (or doesn't) exactly once, at the very end.
  return (
    `trim=${sec(segment.start)}:${sec(segment.end)},setpts=PTS-STARTPTS,` +
    `setsar=1,format=yuv444p,` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`
  );
}

function plainFilter(segment) {
  return `trim=${sec(segment.start)}:${sec(segment.end)},setpts=PTS-STARTPTS,setsar=1,format=yuv444p`;
}

// Stamped onto every output branch below, not passed as a bare ffmpeg output
// flag: libx264's wrapper only partially honors -color_primaries/-color_trc
// as output options (colorspace/matrix takes, the other two silently don't),
// but setparams on the frames themselves reliably sets all four. Without it,
// a decoder that doesn't infer full range from context can crush genuinely-
// near-black UI backgrounds (e.g. #0b0c0d) toward pure black.
const COLOR_TAG_FILTER = "setparams=range=pc:color_primaries=bt709:colorspace=bt709:color_trc=bt709";

// `tail` ends every output branch: the color tagging for webm, or the delivery
// format's 4:2:0 conversion for mp4.
export function buildFilterComplex(suggestions, probe, timing = {}, tail = COLOR_TAG_FILTER) {
  const width = even(probe.width);
  const height = even(probe.height);
  const fps = Math.round(probe.fps * 1000) / 1000;
  const segments = buildSegments(suggestions, probe.durationMs, timing);
  if (segments.length === 0) {
    return {
      filter: `[0:v]setsar=1,format=yuv444p,scale=${width}:${height}:flags=lanczos,${tail}[out]`,
      map: "[out]",
      segments,
    };
  }
  if (segments.length === 1 && segments[0].kind === "plain") {
    return {
      filter: `[0:v]${plainFilter(segments[0])},scale=${width}:${height}:flags=lanczos,${tail}[out]`,
      map: "[out]",
      segments,
    };
  }

  const parts = [];
  const labels = [];
  segments.forEach((segment, index) => {
    const label = `v${index}`;
    const body = segment.kind === "zoom" ? zoomFilter(segment, width, height, fps, timing) : plainFilter(segment);
    parts.push(`[0:v]${body}[${label}]`);
    labels.push(`[${label}]`);
  });
  parts.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=0,${tail}[out]`);
  return { filter: parts.join(";"), map: "[out]", segments };
}

// Re-encode without zooming. The caller wants the container, not the effect.
export function transcode(options) {
  return renderAutoZoom({ ...options, suggestions: [] });
}

export async function renderAutoZoom(options) {
  const videoPath = path.resolve(options.video);
  const outPath = path.resolve(options.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const probe = await probeVideo(videoPath);
  const trimStartMs = Math.max(0, Number(options.trimStartMs) || 0);
  const durationMs = Math.max(1, (options.durationMs ?? probe.durationMs) - trimStartMs);
  const zoomDoc = options.suggestions
    ? { status: "ok", suggestions: options.suggestions }
    : loadZooms(options, durationMs);
  const suggestions = zoomDoc.suggestions ?? [];
  const timing = {
    zoomInMs: options.zoomInMs ?? ZOOM_IN_MS,
    zoomOutMs: options.zoomOutMs ?? ZOOM_OUT_MS,
  };
  const webm = outPath.toLowerCase().endsWith(".webm");
  const { filter, map } = buildFilterComplex(
    suggestions,
    { ...probe, durationMs },
    timing,
    webm ? COLOR_TAG_FILTER : DELIVERY_FILTER_TAIL,
  );

  const ffmpegArgs = ["-y"];
  if (trimStartMs > 0) {
    ffmpegArgs.push("-ss", (trimStartMs / 1000).toFixed(3));
  }
  ffmpegArgs.push("-i", videoPath, "-filter_complex", filter, "-map", map, "-an");
  // The captured frames (record.mjs) are lossless; this is the one lossy step,
  // and it writes the delivery format (delivery-format.mjs) so every mp4 is
  // already postable and plays in any browser, phone or editor.
  if (webm) {
    // libvpx has no real lossless/4:4:4 path worth using here — -lossless
    // gets VP8 as close as it goes, kept only as a non-mp4 fallback option.
    ffmpegArgs.push("-c:v", "libvpx", "-pix_fmt", "yuv420p", "-lossless", "1", "-cpu-used", "0");
  } else {
    ffmpegArgs.push(...DELIVERY_ENCODE_ARGS);
  }
  ffmpegArgs.push(outPath);
  await run("ffmpeg", ffmpegArgs);
  if (!webm) {
    verifyDeliveryFile(outPath, {
      width: even(probe.width),
      height: even(probe.height),
      durationSeconds: durationMs / 1000,
    });
  }

  return { outPath, probe, suggestions, status: zoomDoc.status ?? "ok" };
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

  if (!args.video || !args.out || (!args.zooms && !args.clicks)) {
    printUsage(io.stderr);
    return 2;
  }

  try {
    const result = await renderAutoZoom(args);
    io.stdout.write(
      `${JSON.stringify({ out: result.outPath, status: result.status, zooms: result.suggestions.length }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
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
