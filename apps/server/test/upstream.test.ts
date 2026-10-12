import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { httpScribe, toDraft } from "../src/upstream";

// "Please check" notes, as the nurse reads them (the 12 Oct end-to-end draft; phc-scribe ADR-0030, ADR-0036).
const e2e = {
  findings: [
    { concept: "vaginal_bleeding", assertion: "present", evidence: { text: "she has had some bleeding from the general sense yesterday" } },
    {
      concept: "severe_headache",
      assertion: "present",
      evidence: { text: "the baby moves well in love with her the bp is 120 by 80 i think i need to refer her to the general hospital today." },
    },
    { concept: "reduced_fetal_movement", assertion: "present", evidence: { text: "the baby moves well in love with her" } },
  ],
  vitals: { blood_pressure: { systolic: 120, diastolic: 80 } },
};

describe("toDraft: Please check notes", () => {
  const d = toDraft(
    e2e,
    [
      { path: "vitals.temperature", reason: "value_not_in_evidence", detail: "the baby moves well in love with her" },
      { path: "vitals.pulse", reason: "value_not_in_evidence", detail: "the baby moves well in love with her" },
      { path: "findings[4]", reason: "ungrounded", detail: "quote not found in transcript" },
      { path: "anc.tests[0]", reason: "schema_repair", detail: "urine_protein: no result" },
    ],
    "m",
    [
      { path: "findings[2]", reason: "polarity", detail: 'reduced_fetal_movement is "present", but its quote reads as the normal state' },
      { path: "findings[1]", reason: "support", detail: 'severe_headache is "present", but its quote does not mention it' },
    ],
  );

  it("are short sentences in plain words, checks first", () => {
    expect(d.needsReview).toEqual([
      'Reduced or absent fetal movement: what was heard sounds like she does not have it ("the baby moves well in love with her"). Remove it unless she does.',
      'Severe headache: the words heard do not mention it ("the baby moves well in love with her the bp is 120 by 80 i…"). Ask her again before you keep it.',
      "Temperature: left out, because the number was not heard. Measure it again.",
      "Pulse: left out, because the number was not heard. Measure it again.",
      "One AI finding was left out, because its words were not in what was said.",
      "A test result: left out, because the draft for it was incomplete.",
    ]);
  });

  it("never show field paths or reason codes, and stay short", () => {
    for (const n of d.needsReview) {
      expect(n.length).toBeLessThanOrEqual(200);
      expect(n).not.toMatch(/\b[a-z]+_[a-z_]+\b|vitals\.|findings\[|anc\./);
    }
  });

  it("keep every finding: a check never removes one", () => {
    expect(d.findings.map((f) => f.concept)).toEqual(["vaginal_bleeding", "severe_headache", "reduced_fetal_movement"]);
  });

  it("flag a measurement whose quote has no number", () => {
    const t = toDraft({ vitals: { temperature: { value: 37, unit: "Cel" } } }, [], "m", [{ path: "vitals.temperature", reason: "support" }]);
    expect(t.needsReview).toEqual(["Temperature: no number was heard for it. Measure it again before you keep it."]);
  });

  it("say a repeated note once", () => {
    const t = toDraft({}, [{ path: "anc.medications[0]", reason: "ungrounded" }, { path: "anc.medications[1]", reason: "ungrounded" }], "m");
    expect(t.needsReview).toEqual(["A medicine: left out, because it was not in what was said."]);
  });
});

describe("httpScribe", () => {
  // A stand-in for the API, which sends its headers only once the draft is written.
  async function slowApi(delayMs: number) {
    const srv = createServer((req, res) => {
      req.resume();
      setTimeout(() => res.setHeader("Content-Type", "application/json").end(JSON.stringify({ text: "hello" })), delayMs);
    });
    srv.requestTimeout = 0;
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() };
  }

  it("waits as long as its own timeout for a slow draft, then gives up as retryable", async () => {
    const slow = await slowApi(600);
    try {
      expect(await httpScribe(slow.url, "k", undefined, 2000).transcribe(Buffer.alloc(10), "yo")).toBe("hello");
      await expect(httpScribe(slow.url, "k", undefined, 200).transcribe(Buffer.alloc(10), "yo")).rejects.toMatchObject({ code: "upstream_unreachable", retryable: true });
    } finally {
      slow.close();
    }
  });
});
