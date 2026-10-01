import { describe, expect, it } from "vitest";
import { canonical, flagsOf, guideOf, makeEvent, recordHash, reduce, verifyEvent, type VisitEvent } from "../src";

const visitId = crypto.randomUUID();
const who = { visitId, deviceId: "phone-1", worker: "nurse-1" };
let t = 0;
const at = () => new Date(Date.UTC(2026, 9, 2, 9, 0, t++)).toISOString();

async function visit(): Promise<VisitEvent[]> {
  return [
    await makeEvent({ ...who, at: at(), type: "visit.started", payload: { facility: "PHC-1", patientRef: "ANC-042", language: "yo", firstContact: false, weeks: 30 } }),
    await makeEvent({ ...who, at: at(), type: "note.added", payload: { text: "Orí ń fọ́ mi gidigidi. No bleeding." } }),
    await makeEvent({ ...who, at: at(), type: "finding.set", payload: { concept: "severe_headache", assertion: "present", origin: "worker" } }),
    await makeEvent({ ...who, at: at(), type: "vitals.set", payload: { bp_systolic: 165, bp_diastolic: 112 } }),
  ];
}

describe("events", () => {
  it("canonical JSON sorts keys and drops undefined", () => {
    expect(canonical({ b: 1, a: { d: undefined, c: [2, "x"] } })).toBe('{"a":{"c":[2,"x"]},"b":1}');
  });

  it("hashes and verifies, and detects tampering", async () => {
    const [e] = await visit();
    expect(await verifyEvent(e!)).toBe(true);
    expect(await verifyEvent({ ...e!, worker: "someone-else" } as VisitEvent)).toBe(false);
  });

  it("rejects invalid data loudly", async () => {
    await expect(makeEvent({ ...who, type: "vitals.set", payload: { bp_systolic: 900 } })).rejects.toThrow();
  });
});

describe("visit state", () => {
  it("is the same whatever order events arrive in, and duplicates are harmless", async () => {
    const ev = await visit();
    const a = reduce(ev);
    const b = reduce([...ev].reverse().concat(ev));
    expect(b).toEqual(a);
    expect(a?.findings).toHaveLength(1);
  });

  it("fires danger flags offline from worker entries", async () => {
    const v = reduce(await visit())!;
    const ids = flagsOf(v).map((f) => f.ruleId);
    expect(ids).toContain("DS-003");
    expect(flagsOf(v)[0]?.severity).toBe("urgent_referral");
  });

  it("tracks the visit guide from notes", async () => {
    const g = guideOf(reduce(await visit())!);
    const covered = new Set(g.items.filter((i) => i.covered).map((i) => i.id));
    expect(covered.has("ask-bleeding")).toBe(true);
    expect(covered.has("ask-headache-vision")).toBe(true);
    expect(covered.has("check-bp")).toBe(true);
  });

  it("keeps the worker's entry over the model's draft, and amendment reopens", async () => {
    const ev = await visit();
    ev.push(await makeEvent({ ...who, at: at(), type: "draft.received", payload: {
      transcript: "x", model: "natlas-ft", needsReview: [], vitals: { weight_kg: 70 },
      findings: [{ concept: "severe_headache", assertion: "possible", origin: "model" }, { concept: "fever", assertion: "absent", origin: "model" }],
    } }));
    const v = reduce(ev)!;
    expect(v.findings.find((f) => f.concept === "severe_headache")?.assertion).toBe("present");
    expect(v.vitals).toEqual({ weight_kg: 70, bp_systolic: 165, bp_diastolic: 112 });
    const confirm = await makeEvent({ ...who, at: at(), type: "record.confirmed", payload: { recordHash: await recordHash(v) } });
    expect(reduce([...ev, confirm])?.confirmed?.by).toBe("nurse-1");
    const amend = await makeEvent({ ...who, at: at(), type: "record.amended", payload: { amends: confirm.id, reason: "BP re-measured" } });
    expect(reduce([...ev, confirm, amend])?.confirmed).toBeNull();
  });
});
