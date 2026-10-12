import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeEvent, type VisitEvent } from "@takada/protocol";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";
import { claimNext, EXTRACT_CHARS, mergeDrafts, runJob, splitText } from "../src/queue";
import { UpstreamError, type Scribe } from "../src/upstream";
import { pcmWav } from "./helpers";

const ADMIN = "admin-token-for-tests-0123456789";
let db: ReturnType<typeof openDb>;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  db = openDb(":memory:");
  const dir = mkdtempSync(join(tmpdir(), "takada-"));
  app = buildApp(db, loadConfig({ ADMIN_TOKEN: ADMIN, AUDIO_DIR: join(dir, "audio"), LOG_LEVEL: "silent" } as NodeJS.ProcessEnv));
});

async function pair(facility = "PHC-1", deviceId = "phone-1") {
  const code = (await app.inject({ method: "POST", url: "/v1/admin/pairing-codes", headers: { authorization: `Bearer ${ADMIN}` }, payload: { facility } })).json().code;
  const res = await app.inject({ method: "POST", url: "/v1/pair", payload: { code, deviceId, worker: "nurse" } });
  return { token: res.json().token as string, deviceId, facility, code };
}

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

async function visitEvents(deviceId: string, facility: string): Promise<VisitEvent[]> {
  const visitId = crypto.randomUUID();
  const who = { visitId, deviceId, worker: "nurse" };
  return [
    await makeEvent({ ...who, type: "visit.started", payload: { facility, patientRef: "ANC-1", language: "pcm", firstContact: false, weeks: 30 } }),
    await makeEvent({ ...who, type: "note.added", payload: { text: "Blood dey comot small. BP 150/100." } }),
    await makeEvent({ ...who, type: "finding.set", payload: { concept: "vaginal_bleeding", assertion: "present", origin: "worker" } }),
  ];
}

const fake = (over: Partial<Scribe> = {}): Scribe => ({
  transcribe: async () => "spoken words",
  extract: async () => ({ findings: [{ concept: "fever", assertion: "absent", origin: "model" }], vitals: { bp_systolic: 150, bp_diastolic: 100 }, model: "test-model", needsReview: [] }),
  ...over,
});

describe("pairing and auth", () => {
  it("pairs once per code and rejects wrong, reused or missing credentials", async () => {
    const p = await pair();
    expect(p.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect((await app.inject({ method: "POST", url: "/v1/pair", payload: { code: p.code, deviceId: "x", worker: "y" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/pair", payload: { code: "WRONGCODE", deviceId: "x", worker: "y" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/v1/sync/pull" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/admin/pairing-codes", headers: auth("nope"), payload: { facility: "X" } })).statusCode).toBe(401);
  });

  it("slows down guessing of pairing codes", async () => {
    const codes = [];
    const from = (ip: string) => ({ "x-forwarded-for": ip });
    for (let i = 0; i < 21; i++) codes.push((await app.inject({ method: "POST", url: "/v1/pair", headers: from("10.0.0.7"), payload: { code: "WRONGCODE", deviceId: "x", worker: "y" } })).statusCode);
    expect(codes.slice(0, 20)).toEqual(Array(20).fill(403));
    expect(codes[20]).toBe(429);
    // another phone behind the same proxy is not locked out
    expect((await app.inject({ method: "POST", url: "/v1/pair", headers: from("10.0.0.8"), payload: { code: "WRONGCODE", deviceId: "x", worker: "y" } })).statusCode).toBe(403);
  });

  it("stops a revoked phone at once", async () => {
    const p = await pair();
    await app.inject({ method: "POST", url: `/v1/admin/devices/${p.deviceId}/revoke`, headers: auth(ADMIN) });
    expect((await app.inject({ method: "GET", url: "/v1/sync/pull", headers: auth(p.token) })).statusCode).toBe(401);
  });
});

describe("sync", () => {
  it("accepts valid events idempotently and rejects forged ones with a reason", async () => {
    const p = await pair();
    const ev = await visitEvents(p.deviceId, p.facility);
    const r1 = (await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } })).json();
    expect(r1.accepted).toHaveLength(3);
    const r2 = (await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } })).json();
    expect(r2.accepted).toHaveLength(3);
    expect((db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n).toBe(3);
    const tampered = { ...ev[1]!, payload: { text: "changed" } };
    const other = (await visitEvents("someone-else", p.facility))[0]!;
    const r3 = (await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: [tampered, other, { junk: true }] } })).json();
    expect(r3.rejected.map((r: { reason: string }) => r.reason).sort()).toEqual(["bad_hash", "invalid_event", "wrong_device"]);
  });

  it("accepts a visit whatever facility name was typed on the phone; it belongs to the paired facility", async () => {
    const p = await pair("PHC Ibadan North");
    const ev = await visitEvents(p.deviceId, "Ibadan North PHC"); // typed at onboarding, before pairing
    const r = (await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } })).json();
    expect(r.rejected).toEqual([]);
    const audio = await app.inject({ method: "PUT", url: `/v1/audio/${ev[0]!.visitId}/${crypto.randomUUID()}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: pcmWav(1) });
    expect(audio.statusCode).toBe(200);
    const other = await pair("PHC-2", "phone-2");
    expect((await app.inject({ method: "GET", url: `/v1/visits/${ev[0]!.visitId}/fhir`, headers: auth(other.token) })).statusCode).toBe(403);
  });

  it("accepts a batch whose visit start is not first (phones send unsynced events in id order)", async () => {
    const p = await pair();
    const ev = await visitEvents(p.deviceId, p.facility);
    const r = (await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: [...ev].reverse() } })).json();
    expect(r.accepted).toHaveLength(3);
    expect(r.rejected).toEqual([]);
  });

  it("pulls only the facility's events, with a cursor", async () => {
    const a = await pair("PHC-1", "phone-a");
    const b = await pair("PHC-1", "phone-b");
    const c = await pair("PHC-2", "phone-c");
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(a.token), payload: { events: await visitEvents(a.deviceId, a.facility) } });
    const pullB = (await app.inject({ method: "GET", url: "/v1/sync/pull?after=0&limit=2", headers: auth(b.token) })).json();
    expect(pullB.events).toHaveLength(2);
    const rest = (await app.inject({ method: "GET", url: `/v1/sync/pull?after=${pullB.next}`, headers: auth(b.token) })).json();
    expect(rest.events).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/v1/sync/pull", headers: auth(c.token) })).json().events).toHaveLength(0);
  });
});

describe("drafting queue", () => {
  it("drafts a visit from audio + notes, writes the draft back as an event, danger visits first", async () => {
    const p = await pair();
    const ev = await visitEvents(p.deviceId, p.facility);
    const visitId = ev[0]!.visitId;
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } });
    const audioId = crypto.randomUUID();
    expect((await app.inject({ method: "PUT", url: `/v1/audio/${visitId}/${audioId}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: Buffer.from("not a wav file at all, not even close to it..") })).statusCode).toBe(415);
    const header = Buffer.alloc(64);
    header.write("RIFF", 0, "latin1");
    header.write("WAVE", 8, "latin1");
    expect((await app.inject({ method: "PUT", url: `/v1/audio/${visitId}/${audioId}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: header })).statusCode).toBe(415); // no audio in it
    const wav = pcmWav(3);
    expect((await app.inject({ method: "PUT", url: `/v1/audio/${visitId}/${audioId}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: wav })).statusCode).toBe(200);
    const job = (await app.inject({ method: "POST", url: "/v1/jobs", headers: auth(p.token), payload: { visitId, language: "pcm", audioIds: [audioId] } })).json();
    expect(job.status).toBe("queued");
    expect((db.prepare("SELECT priority FROM jobs").get() as { priority: number }).priority).toBe(20); // bleeding = urgent
    let seen = "";
    await runJob(db, fake({ extract: async (text) => ((seen = text), { findings: [], vitals: {}, model: "m", needsReview: [] }) }), claimNext(db)!, "hub-1");
    expect(seen).toContain("spoken words");
    expect(seen).toContain("Blood dey comot");
    const status = (await app.inject({ method: "GET", url: `/v1/jobs/${job.id}`, headers: auth(p.token) })).json();
    expect(status.status).toBe("done");
    const pulled = (await app.inject({ method: "GET", url: "/v1/sync/pull", headers: auth(p.token) })).json().events;
    expect(pulled.at(-1).type).toBe("draft.received");
  });

  it("transcribes a long recording in segments the speech API accepts", async () => {
    const p = await pair();
    const ev = await visitEvents(p.deviceId, p.facility);
    const visitId = ev[0]!.visitId;
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } });
    const audioId = crypto.randomUUID();
    const put = await app.inject({ method: "PUT", url: `/v1/audio/${visitId}/${audioId}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: pcmWav(600) });
    expect(put.statusCode).toBe(200);
    await app.inject({ method: "POST", url: "/v1/jobs", headers: auth(p.token), payload: { visitId, language: "yo", audioIds: [audioId] } });
    const sizes: number[] = [];
    let seen = "";
    const scribe = fake({
      transcribe: async (wav) => (sizes.push(wav.length), `part${sizes.length}`),
      extract: async (text) => ((seen = text), { findings: [], vitals: {}, model: "m", needsReview: [] }),
    });
    await runJob(db, scribe, claimNext(db)!, "hub-1");
    expect(sizes).toHaveLength(3);
    expect(Math.max(...sizes)).toBeLessThan(10_000_000);
    expect(seen).toContain("part1 part2 part3");
  });

  it("never transcribes a silent recording, and says so", async () => {
    const p = await pair();
    const ev = await visitEvents(p.deviceId, p.facility);
    const visitId = ev[0]!.visitId;
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } });
    const silent = pcmWav(5);
    silent.fill(0, 44); // a muted microphone: all zeros
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    await app.inject({ method: "PUT", url: `/v1/audio/${visitId}/${ids[0]}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: silent });
    await app.inject({ method: "PUT", url: `/v1/audio/${visitId}/${ids[1]}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: pcmWav(3) });
    await app.inject({ method: "POST", url: "/v1/jobs", headers: auth(p.token), payload: { visitId, language: "pcm", audioIds: ids } });
    let calls = 0;
    await runJob(db, fake({ transcribe: async () => (calls++, "spoken words") }), claimNext(db)!, "hub-1");
    expect(calls).toBe(1);
    const draft = (await app.inject({ method: "GET", url: "/v1/sync/pull", headers: auth(p.token) })).json().events.at(-1);
    expect(draft.payload.needsReview[0]).toMatch(/1 recording had no speech the hub could hear/);

    // only silence and no notes: the job fails with a reason the nurse can act on
    const v2 = await pair("PHC-1", "phone-2");
    const [start] = await visitEvents(v2.deviceId, v2.facility);
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(v2.token), payload: { events: [start] } });
    const id = crypto.randomUUID();
    await app.inject({ method: "PUT", url: `/v1/audio/${start!.visitId}/${id}`, headers: { ...auth(v2.token), "content-type": "audio/wav" }, payload: silent });
    const job = (await app.inject({ method: "POST", url: "/v1/jobs", headers: auth(v2.token), payload: { visitId: start!.visitId, language: "yo", audioIds: [id] } })).json();
    await runJob(db, fake(), claimNext(db)!, "hub-1");
    const status = (await app.inject({ method: "GET", url: `/v1/jobs/${job.id}`, headers: auth(v2.token) })).json();
    expect(status.status).toBe("failed");
    expect(status.error).toMatch(/silent_audio/);
  });

  it("treats an empty transcript (the hub heard no speech) as no speech, not as text", async () => {
    const p = await pair();
    const [start] = await visitEvents(p.deviceId, p.facility);
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: [start] } });
    const id = crypto.randomUUID();
    await app.inject({ method: "PUT", url: `/v1/audio/${start!.visitId}/${id}`, headers: { ...auth(p.token), "content-type": "audio/wav" }, payload: pcmWav(5) });
    const job = (await app.inject({ method: "POST", url: "/v1/jobs", headers: auth(p.token), payload: { visitId: start!.visitId, language: "yo", audioIds: [id] } })).json();
    let extracted = false;
    await runJob(db, fake({ transcribe: async () => "  ", extract: async () => ((extracted = true), { findings: [], vitals: {}, model: "m", needsReview: [] }) }), claimNext(db)!, "hub-1");
    expect(extracted).toBe(false);
    const status = (await app.inject({ method: "GET", url: `/v1/jobs/${job.id}`, headers: auth(p.token) })).json();
    expect(status.error).toMatch(/^silent_audio: no speech could be heard/);
  });

  it("drafts a long visit in parts under the API's text limit and merges them", async () => {
    const p = await pair();
    const ev = await visitEvents(p.deviceId, p.facility);
    const visitId = ev[0]!.visitId;
    const long = await makeEvent({ visitId, deviceId: p.deviceId, worker: "nurse", type: "note.added", payload: { text: "She says her head hurts badly. ".repeat(600) } });
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: [...ev, long] } });
    await app.inject({ method: "POST", url: "/v1/jobs", headers: auth(p.token), payload: { visitId, language: "en", audioIds: [] } });
    const sizes: number[] = [];
    let n = 0;
    await runJob(db, fake({
      extract: async (text) => (sizes.push(text.length), n++, {
        findings: [{ concept: "fever", assertion: n === 1 ? "absent" : "present", origin: "model" }],
        vitals: { bp_systolic: 150 + n }, model: "m", needsReview: ["x".repeat(300)],
      }),
    }), claimNext(db)!, "hub-1");
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(EXTRACT_CHARS);
    const draft = (await app.inject({ method: "GET", url: "/v1/sync/pull", headers: auth(p.token) })).json().events.at(-1);
    expect(draft.type).toBe("draft.received");
    expect(draft.payload.findings).toEqual([{ concept: "fever", assertion: "present", origin: "model" }]); // the alarming answer is kept
    expect(draft.payload.vitals.bp_systolic).toBe(151);
    expect(draft.payload.needsReview[0]).toMatch(/drafted in \d parts/);
    expect(draft.payload.needsReview.some((r: string) => /fever: absent in one part, present in another/.test(r))).toBe(true);
    expect(Math.max(...draft.payload.needsReview.map((r: string) => r.length))).toBeLessThanOrEqual(200);
  });

  it("retries transient failures with backoff, then fails with a visible error", async () => {
    const p = await pair();
    const ev = await visitEvents(p.deviceId, p.facility);
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } });
    const job = (await app.inject({ method: "POST", url: "/v1/jobs", headers: auth(p.token), payload: { visitId: ev[0]!.visitId, language: "en", audioIds: [] } })).json();
    const down = fake({ extract: async () => { throw new UpstreamError("upstream_unreachable", "down", true); } });
    const future = new Date(Date.now() + 10 * 60_000);
    for (let i = 0; i < 3; i++) {
      const j = claimNext(db, future);
      expect(j).not.toBeNull();
      await runJob(db, down, j!, "hub-1");
    }
    const status = (await app.inject({ method: "GET", url: `/v1/jobs/${job.id}`, headers: auth(p.token) })).json();
    expect(status.status).toBe("failed");
    expect(status.error).toMatch(/upstream_unreachable/);
  });
});

describe("FHIR export and health", () => {
  it("exports Encounter, Observations, Flag and Provenance; other facilities are refused", async () => {
    const p = await pair();
    const other = await pair("PHC-2", "phone-z");
    const ev = await visitEvents(p.deviceId, p.facility);
    await app.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } });
    const res = await app.inject({ method: "GET", url: `/v1/visits/${ev[0]!.visitId}/fhir`, headers: auth(p.token) });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
    const types = res.json().entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType);
    expect(types).toEqual(expect.arrayContaining(["Encounter", "Observation", "Flag", "Provenance"]));
    expect((await app.inject({ method: "GET", url: `/v1/visits/${ev[0]!.visitId}/fhir`, headers: auth(other.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/healthz" })).json().ok).toBe(true);
    expect((await app.inject({ method: "GET", url: "/readyz" })).json().ok).toBe(true);
  });
});

describe("long text", () => {
  it("splits at sentence ends and loses nothing", () => {
    const text = Array.from({ length: 400 }, (_, i) => `Sentence ${i} is here.`).join(" ");
    const parts = splitText(text, 1000);
    expect(parts.every((p) => p.length <= 1000 && p.endsWith("."))).toBe(true);
    expect(parts.join(" ")).toBe(text);
    expect(splitText("short")).toEqual(["short"]);
    expect(mergeDrafts([{ findings: [], vitals: {}, model: "m", needsReview: [] }]).needsReview).toEqual([]);
  });
});

describe("demo hub (the judges' sandbox)", () => {
  const demoApp = (over: Record<string, string> = {}) =>
    buildApp(openDb(":memory:"), loadConfig({ ADMIN_TOKEN: ADMIN, LOG_LEVEL: "silent", DEMO_CODE: "TAKADA26", ...over } as NodeJS.ProcessEnv));
  const demoPair = async (a: ReturnType<typeof buildApp>, deviceId: string) =>
    (await a.inject({ method: "POST", url: "/v1/pair", payload: { code: "takada26", deviceId, worker: "judge" } })).json();

  it("gives each phone a demo clinic of its own, the same one when it pairs again", async () => {
    const a = demoApp();
    const p1 = await demoPair(a, "phone-a");
    const p2 = await demoPair(a, "phone-b");
    const again = await demoPair(a, "phone-a");
    expect(p1.demo).toBe(true);
    expect(p1.facility).not.toBe(p2.facility);
    expect(again.facility).toBe(p1.facility);
    // a clinic hub has no demo code
    expect((await app.inject({ method: "POST", url: "/v1/pair", payload: { code: "TAKADA26", deviceId: "x", worker: "y" } })).statusCode).toBe(403);
  });

  it("limits AI drafts per phone and per day, and says why", async () => {
    const a = demoApp({ DEMO_DRAFTS_PER_HOUR: "2", DEMO_DRAFTS_PER_DAY: "3" });
    const job = async (deviceId: string) => {
      const p = await demoPair(a, deviceId);
      const ev = await visitEvents(deviceId, p.facility);
      await a.inject({ method: "POST", url: "/v1/sync/push", headers: auth(p.token), payload: { events: ev } });
      return a.inject({ method: "POST", url: "/v1/jobs", headers: auth(p.token), payload: { visitId: ev[0]!.visitId, language: "pcm", audioIds: [] } });
    };
    expect((await job("p1")).statusCode).toBe(202);
    expect((await job("p1")).statusCode).toBe(202);
    const third = await job("p1");
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("rate_limited");
    expect((await job("p2")).statusCode).toBe(202);
    const busy = await job("p3");
    expect(busy.statusCode).toBe(429);
    expect(busy.json().error.code).toBe("demo_busy");
  });
});
