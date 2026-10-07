import { describe, expect, it } from "vitest";
import { toDraft } from "../src/upstream";

describe("toDraft", () => {
  it("shows what was removed from the model's output, with its detail", () => {
    const d = toDraft(
      { findings: [{ concept: "severe_headache", assertion: "present", evidence: { text: "severe headache" } }] } as never,
      [
        { path: "anc.tests[0]", reason: "schema_repair", detail: "urine_protein: no result" },
        { path: "vitals.pulse", reason: "ungrounded" },
      ],
      "llamacpp:phc-scribe",
    );
    expect(d.needsReview).toEqual([
      "anc.tests[0]: schema_repair (urine_protein: no result)",
      "vitals.pulse: ungrounded",
    ]);
    expect(d.findings.map((f) => f.concept)).toEqual(["severe_headache"]);
  });
});
