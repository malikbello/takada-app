import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { httpScribe, toDraft } from "../src/upstream";

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

describe("toDraft checks", () => {
  it("lists a finding whose quote says the opposite first, for the health worker (phc-scribe ADR-0030)", () => {
    const d = toDraft(
      { findings: [{ concept: "reduced_fetal_movement", assertion: "present", evidence: { text: "the baby moves well" } }] } as never,
      [],
      "m",
      [{ path: "findings[0]", reason: "polarity", detail: 'reduced_fetal_movement is "present", but its quote reads as the normal state: "the baby moves well"' }],
    );
    expect(d.findings).toHaveLength(1); // kept: a check never removes a finding
    expect(d.needsReview).toEqual(['Check this: reduced_fetal_movement is "present", but its quote reads as the normal state: "the baby moves well"']);
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
