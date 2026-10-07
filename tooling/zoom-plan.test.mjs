import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPointInZoomCrop, zoomCrop, zoomPlanProblems } from "./record.mjs";

describe("zoomCrop", () => {
  it("clamps the focus so the crop stays in the frame", () => {
    const crop = zoomCrop({ cx: 0.1, cy: 0.5 }, 2);
    assert.deepEqual(crop, { left: 0, right: 0.5, top: 0.25, bottom: 0.75 });
  });

  it("finds a target the crop misses", () => {
    // The loop button sits at (0.17, 0.10); a focus guessed at (0.52, 0.32) misses it.
    const crop = zoomCrop({ cx: 0.52, cy: 0.32 }, 1.55);
    assert.equal(isPointInZoomCrop(0.17, 0.1, crop), false);
    assert.equal(isPointInZoomCrop(0.52, 0.32, crop), true);
  });

  it("keeps a margin from the crop edge", () => {
    const crop = zoomCrop({ cx: 0.5, cy: 0.5 }, 2);
    assert.equal(isPointInZoomCrop(0.26, 0.5, crop), false);
    assert.equal(isPointInZoomCrop(0.3, 0.5, crop), true);
  });
});

describe("zoomPlanProblems", () => {
  const focusA = { cx: 0.3, cy: 0.3 };
  const focusB = { cx: 0.7, cy: 0.5 };

  it("accepts a planned stretch and a wait-started one after its release", () => {
    const steps = [
      { action: "click", text: "a", holdZoomAfter: true, zoomFocus: focusA },
      { action: "click", text: "b" },
      { action: "click", text: "c", releaseZoomHold: true },
      { action: "wait", ms: 1000, holdZoomAfter: true, zoomFocus: focusB },
      { action: "wait", ms: 0, releaseZoomHold: true },
    ];
    assert.deepEqual(zoomPlanProblems(steps), []);
  });

  it("rejects hold and release on the same click", () => {
    const problems = zoomPlanProblems([
      { action: "click", text: "a", holdZoomAfter: true, releaseZoomHold: true, zoomFocus: focusA },
    ]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /both holdZoomAfter and releaseZoomHold/);
  });

  it("rejects a new focus inside a held stretch", () => {
    const problems = zoomPlanProblems([
      { action: "click", text: "a", holdZoomAfter: true, zoomFocus: focusA },
      { action: "click", text: "b", holdZoomAfter: true, zoomFocus: focusB },
    ]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /new zoomFocus inside a held stretch/);
  });

  it("allows repeating the held focus on a middle step", () => {
    assert.deepEqual(
      zoomPlanProblems([
        { action: "click", text: "a", holdZoomAfter: true, zoomFocus: focusA },
        { action: "click", text: "b", holdZoomAfter: true, zoomFocus: focusA },
      ]),
      [],
    );
  });

  it("rejects a wait that starts a zoom without a focus, or inside a hold", () => {
    assert.match(
      zoomPlanProblems([{ action: "wait", ms: 500, holdZoomAfter: true }])[0],
      /without zoomFocus/,
    );
    assert.match(
      zoomPlanProblems([
        { action: "click", text: "a", holdZoomAfter: true, zoomFocus: focusA },
        { action: "wait", ms: 500, holdZoomAfter: true, zoomFocus: focusB },
      ])[0],
      /inside a held one/,
    );
  });

  it("rejects zoom options on waitFor", () => {
    assert.match(
      zoomPlanProblems([{ action: "waitFor", text: "a", holdZoomAfter: true, zoomFocus: focusA }])[0],
      /waitFor ignores/,
    );
  });
});
