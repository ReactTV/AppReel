#!/usr/bin/env node
// Puts the house music track under a finished video. Every video this tooling
// delivers gets it (record.mjs calls this at the end of recordWalkthrough, which
// is where a side-by-side presentation and a single-screen recording both come
// from); the clips that only feed a presentation's stage stay silent.
//
// The video stream is copied untouched, so this is fast and loses nothing. The
// track is cut to the video's length (looped if it is shorter), levelled to a
// steady loudness, and faded in and out, then encoded as AAC. Rules and the
// track's home are in README.mdx ("Music").
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyDeliveryFile } from "./delivery-format.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The one folder the track lives in: .appreel/music/.
export const MUSIC_DIR = path.join(__dirname, "..", "music");
const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg"];

// Integrated loudness the excerpt is levelled to (the fades then take a few
// tenths of a LU off). Far under a normal standalone video (-14 to -16 LUFS,
// where music is the main event): this is a quiet bed under on-screen text and
// should never be noticed over it. 10 dB down is about half as loud to the ear.
export const MUSIC_LOUDNESS_LUFS = -26;
export const MUSIC_FADE_IN_S = 1;
export const MUSIC_FADE_OUT_S = 2;

// The track every video uses: the one audio file in .appreel/music/. Null
// when there is none; an error when there are several, since nothing says which.
export function findMusicTrack() {
  if (!fs.existsSync(MUSIC_DIR)) {
    return null;
  }
  const tracks = fs
    .readdirSync(MUSIC_DIR)
    .filter((name) => AUDIO_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort();
  if (tracks.length > 1) {
    throw new Error(
      `${MUSIC_DIR} holds ${tracks.length} tracks (${tracks.join(", ")}). Keep the one every ` +
        "video should use there, or name one with the music option.",
    );
  }
  return tracks.length === 1 ? path.join(MUSIC_DIR, tracks[0]) : null;
}

function videoDurationSeconds(file) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  const seconds = Number(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(seconds)) {
    throw new Error(`ffprobe could not read the duration of ${file}: ${result.stderr.trim()}`);
  }
  return seconds;
}

// Integrated loudness of the first `seconds` of the track, looped if it is
// shorter, measured the way it will be used. Measured, then a fixed gain is
// applied, because loudnorm on its own only approximates its target.
function measureLufs(source, seconds) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner", "-nostats",
      "-stream_loop", "-1", "-i", source,
      "-t", seconds.toFixed(3),
      "-af", "ebur128", "-f", "null", "-",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const matches = [...result.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)];
  const lufs = Number(matches.at(-1)?.[1]);
  if (result.status !== 0 || !Number.isFinite(lufs)) {
    throw new Error(`ffmpeg could not measure the loudness of ${source}`);
  }
  return lufs;
}

// Replaces the audio of `video` (an mp4) with the track, in place. Returns what
// it did, or null when there is no track to add.
export function addMusic(video, { track } = {}) {
  const source = track ? path.resolve(track) : findMusicTrack();
  if (!source) {
    process.stderr.write(
      `music: no track in ${MUSIC_DIR}; ${path.basename(video)} has no audio\n`,
    );
    return null;
  }
  const seconds = videoDurationSeconds(video);
  const fadeOutAt = Math.max(0, seconds - MUSIC_FADE_OUT_S);
  const gainDb = MUSIC_LOUDNESS_LUFS - measureLufs(source, seconds);
  const filters = [
    `volume=${gainDb.toFixed(2)}dB`,
    // A safety net for a quiet track that the gain would push past -1.5 dBFS.
    "alimiter=limit=0.84:level=disabled",
    "aresample=48000",
    `afade=t=in:st=0:d=${MUSIC_FADE_IN_S}`,
    `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=${MUSIC_FADE_OUT_S}`,
  ].join(",");
  const tmp = video.replace(/\.mp4$/i, ".music.tmp.mp4");
  const result = spawnSync(
    "ffmpeg",
    [
      "-y", "-v", "error",
      "-i", video,
      // Looped, so a track shorter than the video still covers it; -t below cuts
      // it back to the video's length.
      "-stream_loop", "-1", "-i", source,
      // Only the video from the first input: any audio it already had is dropped.
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy",
      "-af", filters,
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-t", seconds.toFixed(3),
      "-movflags", "+faststart",
      tmp,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ffmpeg could not add music to ${video}: ${result.stderr.trim()}`);
  }
  try {
    verifyDeliveryFile(tmp, { durationSeconds: seconds });
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
  fs.renameSync(tmp, video);
  return { video, track: source, seconds };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write("Usage: music.mjs FILE.mp4 [FILE.mp4 ...]\n");
    process.exit(2);
  }
  for (const file of files) {
    const done = addMusic(file);
    if (done) {
      process.stdout.write(`${path.basename(done.video)}: ${path.basename(done.track)}, ${done.seconds.toFixed(1)}s\n`);
    }
  }
}
