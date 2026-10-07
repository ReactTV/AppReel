import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPointerPathInViewport,
  isBoxActionableInViewport,
  isPointInViewport,
  resolveRecordingPolicy,
  targetPoint,
  viewportHitArea,
} from "./record.mjs";

const VIEWPORT = { width: 1920, height: 1080 };

describe("resolveRecordingPolicy", () => {
  it("defaults to strict viewport bounds", () => {
    assert.deepEqual(resolveRecordingPolicy({}), { allowOffViewport: false });
  });

  it("allows opt-out", () => {
    assert.deepEqual(resolveRecordingPolicy({ recording: { allowOffViewport: true } }), {
      allowOffViewport: true,
    });
  });
});

describe("viewportHitArea", () => {
  it("counts only the on-screen portion", () => {
    assert.equal(viewportHitArea({ x: -50, y: 10, width: 100, height: 40 }, VIEWPORT), 50 * 40);
  });
});

describe("targetPoint", () => {
  it("returns null when nothing intersects the viewport", () => {
    assert.equal(targetPoint({ x: -200, y: 0, width: 50, height: 50 }, VIEWPORT), null);
  });
});

describe("isBoxActionableInViewport", () => {
  it("requires a minimum visible area", () => {
    assert.equal(isBoxActionableInViewport({ x: 0, y: 0, width: 10, height: 10 }, VIEWPORT), false);
    assert.equal(isBoxActionableInViewport({ x: 0, y: 0, width: 28, height: 28 }, VIEWPORT), true);
  });
});

describe("assertPointerPathInViewport", () => {
  it("throws when a move cuts outside the frame", () => {
    assert.throws(
      () => assertPointerPathInViewport(-100, 540, 100, 540, VIEWPORT, 8, "test"),
      /leaves the recorded viewport/,
    );
  });

  it("allows a short move inside the frame", () => {
    assertPointerPathInViewport(400, 400, 500, 450, VIEWPORT, 8, "test");
    assert.ok(isPointInViewport(500, 450, VIEWPORT));
  });
});
