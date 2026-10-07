import { describe, expect, it } from "vitest";
import { canonical, flagsOf, guideOf, makeEvent, nextQuestion, recordHash, reduce, verifyEvent, type VisitEvent } from "../src";

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

  it("replaces the previous draft when the record is drafted again", async () => {
    const ev = await visit();
    const draft = async (findings: { concept: string; assertion: "present" | "absent" }[], weight: number) =>
      makeEvent({ ...who, at: at(), type: "draft.received", payload: {
        transcript: "x", model: "natlas-ft", needsReview: [], vitals: { weight_kg: weight },
        findings: findings.map((f) => ({ ...f, origin: "model" as const })),
      } });
    ev.push(await draft([{ concept: "fever", assertion: "present" }, { concept: "blurred_vision", assertion: "present" }], 70));
    ev.push(await draft([{ concept: "fever", assertion: "absent" }], 72));
    const v = reduce(ev)!;
    const model = v.findings.filter((f) => f.origin === "model");
    expect(model).toEqual([{ concept: "fever", assertion: "absent", origin: "model" }]);
    expect(v.vitals.weight_kg).toBe(72);
    expect(v.vitals.bp_systolic).toBe(165); // the worker's typed vitals survive every draft
    expect(v.findings.some((f) => f.origin === "worker" && f.concept === "severe_headache")).toBe(true);
  });

  it("lets the worker override the model after the draft arrived", async () => {
    const ev = await visit();
    ev.push(await makeEvent({ ...who, at: at(), type: "draft.received", payload: {
      transcript: "x", model: "natlas-ft", needsReview: [], vitals: { weight_kg: 70 },
      findings: [{ concept: "vaginal_bleeding", assertion: "absent", origin: "model" }],
    } }));
    ev.push(await makeEvent({ ...who, at: at(), type: "finding.set", payload: { concept: "vaginal_bleeding", assertion: "present", origin: "worker" } }));
    ev.push(await makeEvent({ ...who, at: at(), type: "vitals.set", payload: { weight_kg: 68 } }));
    const v = reduce(ev)!;
    expect(v.findings.filter((f) => f.concept === "vaginal_bleeding")).toEqual([{ concept: "vaginal_bleeding", assertion: "present", origin: "worker" }]);
    expect(v.vitals.weight_kg).toBe(68);
  });
});

describe("ordering", () => {
  it("keeps the order of events made in the same millisecond", async () => {
    const id = crypto.randomUUID();
    const w = { visitId: id, deviceId: "p", worker: "n" };
    const evs = [];
    for (let i = 0; i < 50; i++) {
      evs.push(await makeEvent({ ...w, type: i === 0 ? "visit.started" : "note.added", payload: i === 0 ? { facility: "F", patientRef: "R", language: "en", firstContact: null, weeks: null } : { text: `n${i}` } } as never));
    }
    const ats = evs.map((e) => e.at);
    expect(new Set(ats).size).toBe(50);
    expect(reduce([...evs].reverse())?.notes).toEqual(evs.slice(1).map((_, i) => `n${i + 1}`));
  });

  it("replays the visit start first even if another device's clock is behind", async () => {
    const id = crypto.randomUUID();
    const late = await makeEvent({ visitId: id, deviceId: "p", worker: "n", at: "2026-10-02T10:00:00.000Z", type: "visit.started", payload: { facility: "F", patientRef: "R", language: "en", firstContact: null, weeks: null } });
    const early = await makeEvent({ visitId: id, deviceId: "q", worker: "n", at: "2026-10-02T09:59:59.000Z", type: "note.added", payload: { text: "from a phone with a slow clock" } });
    expect(reduce([early, late])?.notes).toEqual(["from a phone with a slow clock"]);
  });
});

describe("guide marks and next question", () => {
  it("marks a question as asked by hand, and the next question moves on", async () => {
    const ev = await visit();
    const v1 = reduce(ev)!;
    const first = nextQuestion(v1);
    expect(first).not.toBeNull();
    const mark = await makeEvent({ ...who, at: at(), type: "guide.marked", payload: { itemId: first!.itemId, asked: true } });
    const v2 = reduce([...ev, mark])!;
    expect(guideOf(v2).items.find((i) => i.id === first!.itemId)?.covered).toBe(true);
    expect(nextQuestion(v2)?.itemId).not.toBe(first!.itemId);
    const unmark = await makeEvent({ ...who, at: at(), type: "guide.marked", payload: { itemId: first!.itemId, asked: false } });
    expect(reduce([...ev, mark, unmark])!.asked).toEqual([]);
  });

  it("puts open follow-ups before the checklist", async () => {
    const ev = await visit();
    ev.push(await makeEvent({ ...who, at: at(), type: "finding.set", payload: { concept: "fever", assertion: "present", origin: "worker" } }));
    const q = nextQuestion(reduce(ev)!);
    expect(q?.why).toMatch(/Fever/);
  });
});
