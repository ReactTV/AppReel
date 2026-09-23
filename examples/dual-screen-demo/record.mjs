#!/usr/bin/env node
// Two screens recorded concurrently and composited side by side — the shape
// that showcases narration, the glow, and sync. Both scenarios point at the
// same throwaway demo server (examples/server.mjs), so typing on the desktop
// screen and watching it appear on the mobile screen is genuinely live, not
// staged after the fact.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareRecording, captureRecording, createRecordingSyncBarrier } from "../../tooling/record.mjs";
import { composePresentation } from "../../tooling/presentation/compose.mjs";
import { startDemoServer } from "../server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readScenario = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.scenario.json`), "utf8"));

const server = await startDemoServer();
const url = `http://127.0.0.1:${server.address().port}/`;

const screens = [
  { name: "desktop", label: "Desktop", frame: "desktop", scenario: { ...readScenario("desktop"), url } },
  { name: "mobile", label: "Mobile", frame: "mobile", scenario: { ...readScenario("mobile"), url } },
];

let result;
try {
  // prepareRecording for every screen first, then captureRecording for every
  // screen via Promise.all, so both screencasts start within the same tick —
  // see tooling/README.mdx#recording-multiple-screens-at-once for why this
  // ordering matters.
  const prepared = await Promise.all(
    screens.map((screen) =>
      prepareRecording({
        scenario: screen.scenario,
        out: path.join(__dirname, ".output", `dual-screen-demo-${screen.name}.mp4`),
      }),
    ),
  );
  const sync = createRecordingSyncBarrier(prepared.length);
  const recorded = await Promise.all(prepared.map((p) => captureRecording(p, { sync })));

  result = await composePresentation({
    screens: screens.map((screen, i) => ({
      name: screen.name,
      label: screen.label,
      frame: screen.frame,
      clip: recorded[i].out,
    })),
    header: "Type On One Screen, Watch The Other",
    out: path.join(__dirname, ".output", "dual-screen-demo-presentation.mp4"),
  });
} finally {
  server.close();
}
console.log("Done:", result.out);
