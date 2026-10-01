import { beforeEach, describe, expect, it } from "vitest";
import { reduce } from "@takada/protocol";
import { db } from "../src/lib/db";
import { allVisits, append, getProfile, pendingCount, saveProfile, visitEvents } from "../src/lib/store";
import { referralNote, summary } from "../src/lib/summary";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("on-device store", () => {
  it("keeps a profile and a stable device id", async () => {
    expect(await getProfile()).toBeNull();
    const a = await saveProfile("Nurse A", "PHC-1");
    const b = await saveProfile("Nurse A", "PHC-2");
    expect(b.deviceId).toBe(a.deviceId);
    expect(await getProfile()).toEqual(b);
  });

  it("stores visits as events, all unsynced until acknowledged", async () => {
    const p = await saveProfile("Nurse A", "PHC-1");
    const visitId = crypto.randomUUID();
    const who = { visitId, deviceId: p.deviceId, worker: p.worker };
    await append({ ...who, type: "visit.started", payload: { facility: "PHC-1", patientRef: "ANC-7", language: "pcm", firstContact: null, weeks: 32 } });
    await append({ ...who, type: "note.added", payload: { text: "Belle dey pain me. Blood dey comot small." } });
    await append({ ...who, type: "finding.set", payload: { concept: "vaginal_bleeding", assertion: "present", origin: "worker" } });
    await append({ ...who, type: "vitals.set", payload: { bp_systolic: 130, bp_diastolic: 85 } });
    expect(await pendingCount()).toBe(4);
    expect(await allVisits()).toHaveLength(1);
    const v = reduce(await visitEvents(visitId))!;
    const s = summary(v);
    expect(s.found).toEqual(["Vaginal bleeding: yes"]);
    expect(s.vitals).toBe("BP 130/85");
    expect(s.asked).toContain("Measure and record the blood pressure.");
    const note = referralNote(v, "PHC-1", "Nurse A");
    expect(note).toContain("Patient: ANC-7, 32 weeks pregnant");
    expect(note).toContain("DS-001");
  });

  it("refuses invalid events instead of storing them", async () => {
    const p = await saveProfile("Nurse A", "PHC-1");
    await expect(append({ visitId: crypto.randomUUID(), deviceId: p.deviceId, worker: p.worker, type: "vitals.set", payload: { bp_systolic: 999 } })).rejects.toThrow();
    expect(await db.events.count()).toBe(0);
  });
});
