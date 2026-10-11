import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { append, getProfile, saveProfile } from "../src/lib/store";
import { draftedAudio, hasUndraftedAudio, pair, requestDraft, syncOnce, timeoutFor } from "../src/lib/sync";

// A fake hub with the real server's rules: a visit's events are refused until its start is
// known; one recording can be made to fail.
function fakeHub(opts: { failAudio?: Set<string>; slowPushMs?: number } = {}) {
  const started = new Set<string>();
  const stored: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchMock = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push(`${init.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/v1/pair") return json({ token: "t", facility: "PHC Ibadan North", node: "hub-1" });
    if (url.pathname === "/v1/sync/push") {
      if (opts.slowPushMs) await new Promise((r) => setTimeout(r, opts.slowPushMs));
      const { events } = JSON.parse(String(init.body)) as { events: { id: string; type: string; visitId: string }[] };
      const accepted: string[] = [], rejected: { id: string; reason: string }[] = [];
      for (const e of events) {
        if (e.type === "visit.started") started.add(e.visitId);
        else if (!started.has(e.visitId)) { rejected.push({ id: e.id, reason: "visit_unknown_yet" }); continue; }
        accepted.push(e.id);
        stored.push(e);
      }
      return json({ accepted, rejected });
    }
    if (url.pathname.startsWith("/v1/audio/")) {
      const id = url.pathname.split("/").at(-1)!;
      if (opts.failAudio?.has(id)) return json({ error: { message: "Request body is too large" } }, 413);
      uploads.push(id);
      return json({ stored: id });
    }
    if (url.pathname === "/v1/sync/pull") return json({ events: [], next: 0 });
    if (url.pathname === "/v1/jobs") {
      const { visitId } = JSON.parse(String(init.body)) as { visitId: string };
      if (!started.has(visitId)) return json({ error: { message: "Visit not found" } }, 404);
      return json({ id: crypto.randomUUID(), status: "queued", ahead: 0 }, 202);
    }
    return json({ error: { message: "not found" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { stored, uploads, calls };
}

// Event ids are random UUIDs and the phone's store lists unsynced events in id order; ids are
// fixed here so every visit start sorts after all the notes (the worst case, made certain).
const id = (prefix: string) => prefix + crypto.randomUUID().slice(1);
async function newVisit(deviceId: string, notes: number) {
  const visitId = crypto.randomUUID();
  const who = { visitId, deviceId, worker: "Nurse A" };
  await append({ ...who, id: id("f"), type: "visit.started", payload: { facility: "typed name", patientRef: "ANC-1", language: "yo", firstContact: null, weeks: 30 } });
  for (let i = 0; i < notes; i++) await append({ ...who, id: id("0"), type: "note.added", payload: { text: `note ${i}` } });
  return visitId;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.unstubAllGlobals());

describe("sync", () => {
  it("pairing switches the phone to the hub's facility name", async () => {
    const p = await saveProfile("Nurse A", "Ibadan North PHC");
    fakeHub();
    await pair("http://hub.test", "abcd2345", p.deviceId, p.worker);
    expect((await getProfile())?.facility).toBe("PHC Ibadan North");
  });

  it("sends a long offline day (more than one batch) completely, visit starts first", async () => {
    const p = await saveProfile("Nurse A", "PHC-1");
    const hub = fakeHub();
    await pair("http://hub.test", "abcd2345", p.deviceId, p.worker);
    for (let v = 0; v < 25; v++) await newVisit(p.deviceId, 11); // 300 events
    await syncOnce();
    expect(hub.stored).toHaveLength(300);
    expect(await db.events.where("synced").equals(0).count()).toBe(0);
  });

  it("one recording that fails does not block the others or the pull, and is reported", async () => {
    const p = await saveProfile("Nurse A", "PHC-1");
    const bad = crypto.randomUUID(), good = crypto.randomUUID();
    const hub = fakeHub({ failAudio: new Set([bad]) });
    await pair("http://hub.test", "abcd2345", p.deviceId, p.worker);
    const visitId = await newVisit(p.deviceId, 0);
    const blob = new Blob([new Uint8Array(100)], { type: "audio/wav" });
    await db.blobs.bulkPut([
      { id: bad, visitId, blob, createdAt: new Date().toISOString(), uploaded: 0 },
      { id: good, visitId, blob, createdAt: new Date().toISOString(), uploaded: 0 },
    ]);
    await syncOnce();
    expect(hub.uploads).toEqual([good]);
    expect(hub.calls.at(-1)).toBe("GET /v1/sync/pull");
    await expect(requestDraft(visitId, "yo")).rejects.toThrow(/could not be sent|has not reached the hub/);
    expect(hub.calls.some((c) => c === "POST /v1/jobs")).toBe(false); // no job that would fail later
    // another visit, fully sent, can still be drafted while that recording is stuck
    const other = await newVisit(p.deviceId, 1);
    expect((await requestDraft(other, "yo")).status).toBe("queued");
  });

  it("a draft requested during a sync waits for it and includes what was just saved", async () => {
    const p = await saveProfile("Nurse A", "PHC-1");
    const hub = fakeHub({ slowPushMs: 50 });
    await pair("http://hub.test", "abcd2345", p.deviceId, p.worker);
    await newVisit(p.deviceId, 1);
    const first = syncOnce();
    await new Promise((r) => setTimeout(r, 20)); // the first sync is now mid-push
    const visitId = await newVisit(p.deviceId, 1);
    const job = await requestDraft(visitId, "yo");
    await first;
    expect(job.status).toBe("queued");
    expect(hub.stored.filter((e) => e.visitId === visitId)).toHaveLength(2);
  });

  it("a draft request keeps the recordings it covered on file", async () => {
    const p = await saveProfile("Nurse A", "PHC-1");
    fakeHub();
    await pair("http://hub.test", "abcd2345", p.deviceId, p.worker);
    const visitId = await newVisit(p.deviceId, 0);
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    const blob = new Blob([new Uint8Array(100)], { type: "audio/wav" });
    await db.blobs.bulkPut([a, b].map((id) => ({ id, visitId, blob, createdAt: new Date().toISOString(), uploaded: 0 })));
    expect(await draftedAudio(visitId)).toEqual([]);
    await requestDraft(visitId, "en");
    expect((await draftedAudio(visitId)).sort()).toEqual([a, b].sort());
  });

  it("asks for a draft by itself only for recordings no draft has covered", () => {
    const clip = (blobId: string) => ({ blobId, seconds: 20, mime: "audio/wav" });
    const draft = { model: "llamacpp:phc-scribe", needsReview: [] };
    const confirmed = { at: "2026-10-11T10:04:01Z", by: "Nurse A", recordHash: "h" };
    expect(hasUndraftedAudio({ audio: [], draft: null, confirmed: null }, [])).toBe(false); // nothing recorded
    expect(hasUndraftedAudio({ audio: [clip("a")], draft: null, confirmed: null }, [])).toBe(true); // just stopped recording
    expect(hasUndraftedAudio({ audio: [clip("a")], draft: null, confirmed: null }, ["a"])).toBe(false); // already asked
    expect(hasUndraftedAudio({ audio: [clip("a"), clip("b")], draft, confirmed: null }, ["a"])).toBe(true); // "Record more"
    expect(hasUndraftedAudio({ audio: [clip("a")], draft: null, confirmed }, [])).toBe(false); // confirmed: never redrafted
    expect(hasUndraftedAudio({ audio: [clip("a")], draft, confirmed: null }, [])).toBe(false); // drafted before requests were kept
  });

  it("gives large recordings time to upload", () => {
    expect(timeoutFor()).toBe(30_000);
    expect(timeoutFor(60_000_000)).toBeGreaterThan(600_000);
  });
});
