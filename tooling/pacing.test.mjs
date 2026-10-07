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
});
