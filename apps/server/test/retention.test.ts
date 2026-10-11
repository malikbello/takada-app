import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeEvent, recordHash, reduce, verifyEvent, type VisitEvent } from "@takada/protocol";
import { openDb } from "../src/db";
import { dueVisits, purgeDue } from "../src/retention";
import { eventsForVisit, insertEvent } from "../src/store";

const DAY = 86_400_000;
const NOW = new Date("2026-11-01T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const R = { audioDays: 7, unconfirmedDays: 30 };
let db: ReturnType<typeof openDb>;
let audioDir: string;

beforeEach(() => {
  db = openDb(":memory:");
  audioDir = join(mkdtempSync(join(tmpdir(), "takada-ret-")), "audio");
});

/** A visit with one recording on disk and a hub draft; optionally confirmed (and amended). */
async function seed(o: { startedDaysAgo: number; confirmedDaysAgo?: number; amendedDaysAgo?: number }) {
  const visitId = crypto.randomUUID();
  const who = { visitId, deviceId: "phone-1", worker: "nurse" };
  const add = async (e: Parameters<typeof makeEvent>[0]) => {
    const ev = await makeEvent(e);
    insertEvent(db, ev, "PHC-1");
    return ev;
  };
  await add({ ...who, at: ago(o.startedDaysAgo), type: "visit.started", payload: { facility: "PHC-1", patientRef: "ANC-1", language: "en", firstContact: false, weeks: 28 } });
  await add({
    visitId, deviceId: "server:hub-1", worker: "takada-draft", at: ago(o.startedDaysAgo), type: "draft.received",
    payload: { transcript: "She has had some bleeding since yesterday.", findings: [{ concept: "vaginal_bleeding", assertion: "present", origin: "model", evidence: "bleeding since yesterday" }], vitals: {}, model: "test", needsReview: [] },
  });
  const dir = join(audioDir, visitId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "clip.wav");
  writeFileSync(path, "RIFF");
  db.prepare("INSERT INTO audio (id, visit_id, facility, path, bytes, uploaded_at) VALUES (?,?,?,?,?,?)").run(crypto.randomUUID(), visitId, "PHC-1", path, 4, ago(o.startedDaysAgo));
  if (o.confirmedDaysAgo !== undefined) {
    const v = reduce(eventsForVisit(db, visitId))!;
    const confirmed = await add({ ...who, at: ago(o.confirmedDaysAgo), type: "record.confirmed", payload: { recordHash: await recordHash(v) } });
    if (o.amendedDaysAgo !== undefined) await add({ ...who, at: ago(o.amendedDaysAgo), type: "record.amended", payload: { amends: confirmed.id, reason: "fix the BP" } });
  }
  return { visitId, path };
}

const draftOf = (visitId: string) => eventsForVisit(db, visitId).find((e) => e.type === "draft.received") as Extract<VisitEvent, { type: "draft.received" }>;

describe("retention (ADR-0033)", () => {
  it("deletes a confirmed visit's recording and transcript after 7 days, keeping the record", async () => {
    const old = await seed({ startedDaysAgo: 9, confirmedDaysAgo: 8 });
    const recent = await seed({ startedDaysAgo: 3, confirmedDaysAgo: 2 });
    const before = await recordHash(reduce(eventsForVisit(db, old.visitId))!);

    expect(await purgeDue(db, audioDir, R, NOW)).toEqual({ visits: 1, audioFiles: 1, transcripts: 1 });
    expect(existsSync(old.path)).toBe(false);
    expect(existsSync(recent.path)).toBe(true);
    const d = draftOf(old.visitId);
    expect(d.payload.transcript).toBe("");
    expect(d.payload.findings[0]?.evidence).toBe("bleeding since yesterday"); // the record keeps its quote
    expect(await verifyEvent(d)).toBe(true); // re-issued with a valid hash
    expect(await recordHash(reduce(eventsForVisit(db, old.visitId))!)).toBe(before); // confirmation still holds
    expect(draftOf(recent.visitId).payload.transcript).not.toBe("");
    expect(db.prepare("SELECT audio_files, transcripts FROM purges").all()).toEqual([{ audio_files: 1, transcripts: 1 }]);
    expect(await purgeDue(db, audioDir, R, NOW)).toEqual({ visits: 0, audioFiles: 0, transcripts: 0 }); // idempotent
  });

  it("an amendment reopens the record: nothing is deleted until it is confirmed again", async () => {
    const reopened = await seed({ startedDaysAgo: 20, confirmedDaysAgo: 19, amendedDaysAgo: 10 });
    expect(dueVisits(db, R, NOW)).not.toContain(reopened.visitId);
  });

  it("an unfinished visit keeps its recording for 30 days, then loses it", async () => {
    const fresh = await seed({ startedDaysAgo: 20 });
    const stale = await seed({ startedDaysAgo: 31 });
    const due = dueVisits(db, R, NOW);
    expect(due).toContain(stale.visitId);
    expect(due).not.toContain(fresh.visitId);
  });

  it("never rewrites a worker's own event", async () => {
    const v = await seed({ startedDaysAgo: 9, confirmedDaysAgo: 8 });
    const workerEvents = () => eventsForVisit(db, v.visitId).filter((e) => !e.deviceId.startsWith("server:")).map((e) => e.hash);
    const hashes = workerEvents();
    await purgeDue(db, audioDir, R, NOW);
    expect(workerEvents()).toEqual(hashes);
  });
});
