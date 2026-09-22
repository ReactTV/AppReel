#!/usr/bin/env node
// The format every mp4 this tooling writes is encoded in, so a recording is
// ready to post as it comes out: H.264 High, 4:2:0, limited-range BT.709,
// progressive, 30 fps constant, `moov` atom first, and at most one audio track
// (AAC-LC, 48 kHz stereo: the house music, added by music.mjs). 4:4:4 H.264 and full-range tagging, which the recorder
// used before, don't decode in most browsers, phones or hardware players.
// Only the internal frame capture (record.mjs, assembleFramesToVideo) stays
// lossless, as the source this format is encoded from.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DELIVERY_FPS = 30;
// H.264 level 4.2 covers 1080p at up to 60 fps.
const DELIVERY_LEVEL = 42;
// Keyframe every 2 seconds, closed GOPs: what streaming platforms re-encode from best.
const DELIVERY_GOP_FRAMES = DELIVERY_FPS * 2;
const DURATION_TOLERANCE_SECONDS = 0.25;

const COLOR_TAGS = { color_primaries: "bt709", color_space: "bt709", color_transfer: "bt709" };

// The end of every mp4 filter chain. The frames arrive as full-range 4:4:4
// tagged bt709; this converts them to limited-range 4:2:0 once, at the very
// end, so no earlier stage loses chroma. Tagged with setparams rather than
// bare -color_* output flags, which libx264's ffmpeg wrapper only partially
// honors (the x264 params below write the VUI as well).
export const DELIVERY_FILTER_TAIL = [
  `fps=${DELIVERY_FPS}`,
  "scale=iw:ih:flags=lanczos+accurate_rnd+full_chroma_int" +
    ":in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709",
  "format=yuv420p",
  "setparams=range=tv:color_primaries=bt709:colorspace=bt709:color_trc=bt709",
].join(",");

export const DELIVERY_ENCODE_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "18",
  "-maxrate",
  "16M",
  "-bufsize",
  "32M",
  "-profile:v",
  "high",
  "-level:v",
  "4.2",
  "-pix_fmt",
  "yuv420p",
  "-g",
  String(DELIVERY_GOP_FRAMES),
  "-keyint_min",
  String(DELIVERY_GOP_FRAMES),
  "-sc_threshold",
  "0",
  "-fps_mode",
  "cfr",
  "-x264-params",
  "open-gop=0:colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off",
  "-movflags",
  "+faststart",
];

function probe(file) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${file}: ${result.stderr.trim()}`);
  }
  const info = JSON.parse(result.stdout);
  return { streams: info.streams ?? [], duration: Number(info.format?.duration) };
}

/** Top-level MP4 box types in file order, read from the headers only. */
function topLevelBoxTypes(file) {
  const fd = fs.openSync(file, "r");
  try {
    const { size: fileSize } = fs.fstatSync(fd);
    const header = Buffer.alloc(16);
    const types = [];
    for (let offset = 0; offset < fileSize; ) {
      fs.readSync(fd, header, 0, 16, offset);
      const declaredSize = header.readUInt32BE(0);
      types.push(header.toString("latin1", 4, 8));
      if (declaredSize === 0) {
        break;
      }
      offset += declaredSize === 1 ? Number(header.readBigUInt64BE(8)) : declaredSize;
    }
    return types;
  } finally {
    fs.closeSync(fd);
  }
}

/** Every requirement of the format, as `[name, expected, actual, passed]`. */
function checkDeliveryFile(file, { width, height, durationSeconds }) {
  const { streams, duration } = probe(file);
  const video = streams.find((stream) => stream.codec_type === "video") ?? {};
  const boxes = topLevelBoxTypes(file);
  const isFaststart = boxes.indexOf("moov") !== -1 && boxes.indexOf("moov") < boxes.indexOf("mdat");
  const checks = [
    ["video streams", 1, streams.filter((s) => s.codec_type === "video").length],
    ["codec", "h264", video.codec_name],
    ["profile", "High", video.profile],
    ["pixel format", "yuv420p", video.pix_fmt],
    ["pixel aspect ratio", "1:1", video.sample_aspect_ratio],
    ["frame rate", `${DELIVERY_FPS}/1`, video.r_frame_rate],
    ["average frame rate", `${DELIVERY_FPS}/1`, video.avg_frame_rate],
    ["color range", "tv", video.color_range],
    ["color primaries", COLOR_TAGS.color_primaries, video.color_primaries],
    ["color matrix", COLOR_TAGS.color_space, video.color_space],
    ["color transfer", COLOR_TAGS.color_transfer, video.color_transfer],
  ];
  if (width !== undefined) {
    checks.push(["width", width, video.width]);
  }
  if (height !== undefined) {
    checks.push(["height", height, video.height]);
  }
  const results = checks.map(([name, expected, actual]) => [name, expected, actual, expected === actual]);

  results.push(["level (max)", DELIVERY_LEVEL, video.level, Number(video.level) <= DELIVERY_LEVEL]);
  // No audio is fine (the recorder's own clips); if there is any, it is one track
  // that plays everywhere.
  const audio = streams.filter((s) => s.codec_type === "audio");
  results.push(["audio streams (max)", 1, audio.length, audio.length <= 1]);
  if (audio.length === 1) {
    results.push(["audio codec", "aac", audio[0].codec_name, audio[0].codec_name === "aac"]);
    results.push(["audio sample rate", "48000", audio[0].sample_rate, audio[0].sample_rate === "48000"]);
    results.push(["audio channels", 2, audio[0].channels, audio[0].channels === 2]);
  }
  results.push(["moov before mdat", "true", String(isFaststart), isFaststart]);
  if (Number.isFinite(durationSeconds)) {
    results.push([
      "duration",
      `${durationSeconds.toFixed(2)}s ±${DURATION_TOLERANCE_SECONDS}`,
      `${duration.toFixed(2)}s`,
      Math.abs(duration - durationSeconds) <= DURATION_TOLERANCE_SECONDS,
    ]);
  }
  return results;
}

/**
 * Throws, listing every mismatch, unless the file meets the format. `width`,
 * `height` and `durationSeconds` are checked only when given.
 */
export function verifyDeliveryFile(file, expected = {}) {
  const failures = checkDeliveryFile(file, expected).filter(([, , , passed]) => !passed);
  if (failures.length > 0) {
    const lines = failures.map(([name, want, got]) => `  ${name}: expected ${want}, got ${got}`);
    throw new Error(`${file} does not meet the delivery format:\n${lines.join("\n")}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const file = argv[argv.indexOf("--check") + 1];
  if (argv.indexOf("--check") === -1 || !file) {
    process.stderr.write("Usage: delivery-format.mjs --check FILE.mp4 [--size 1920x1080]\n");
    return 2;
  }
  const sizeIndex = argv.indexOf("--size");
  const [width, height] = sizeIndex === -1 ? [] : argv[sizeIndex + 1].split("x").map(Number);
  verifyDeliveryFile(file, { width, height });
  process.stdout.write(`${file} meets the delivery format.\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
