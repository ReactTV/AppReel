import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkPacing } from "./pacing.mjs";

describe("checkPacing", () => {
  it("ignores focus-only zoom entries when checking pointer pacing", () => {
    const findings = checkPacing({
      clicks: [
        { t: 1000, moveStartT: 1000, focusOnly: true },
        { t: 2200, moveStartT: 1050 },
      ],
    });
    assert.deepEqual(
      findings.filter((f) => f.kind === "jump" || f.kind === "rushed exit"),
      [],
    );
  });

  it("still flags a pointer click that jumps", () => {
    const findings = checkPacing({ clicks: [{ t: 1200, moveStartT: 1000 }] });
    assert.equal(findings.filter((f) => f.kind === "jump").length, 1);
  });

  it("flags a long wait with no line as dead air", () => {
    const findings = checkPacing({ steps: [{ action: "wait", t: 1000, end: 5000 }] });
    assert.equal(findings.filter((f) => f.kind === "dead air").length, 1);
  });

  it("lets a line on the step that starts a pause carry it", () => {
    const findings = checkPacing({
      steps: [{ action: "wait", t: 1000, end: 12000 }],
      narration: [{ t: 1001, text: "Watch it play through" }],
    });
    assert.deepEqual(findings.filter((f) => f.kind === "dead air"), []);
  });

  it("flags the stretch before a pause's first line", () => {
    const findings = checkPacing({
      steps: [{ action: "wait", t: 1000, end: 9000 }],
      narration: [{ t: 5000, text: "Late line" }],
    });
    const dead = findings.filter((f) => f.kind === "dead air");
    assert.equal(dead.length, 1);
    assert.match(dead[0].message, /^4\.0s/);
  });

  it("reports an optional step that timed out", () => {
    const findings = checkPacing({
      steps: [
        { action: "click", t: 1000, end: 3600, label: "Confirm", skipped: true },
        { action: "click", t: 3600, end: 4800 },
      ],
    });
    assert.equal(findings.filter((f) => f.kind === "skipped").length, 1);
  });
});
