// Phone <-> hub/cloud sync (ADR-0023 §4). Push unsynced events, upload recordings, pull
// what other devices and the drafting service wrote. Every failure is recorded and shown
// in the app; nothing is deleted from the phone because of a sync.

import { useEffect, useState } from "react";
import { reduce, VisitEvent, type Visit } from "@takada/protocol";
import { db } from "./db";

export type Link = { url: string; token: string; facility: string; node: string };
export type SyncState = { at: string | null; error: string | null; rejected: number; pushing: boolean };

const BATCH = 200;
let state: SyncState = { at: null, error: null, rejected: 0, pushing: false };
const listeners = new Set<(s: SyncState) => void>();
const set = (s: Partial<SyncState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l(state));
};

export function useSyncState(): SyncState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

export async function getLink(): Promise<Link | null> {
  const r = await db.settings.get("link");
  return r ? (JSON.parse(r.value) as Link) : null;
}

export class SyncError extends Error {}

/** Time allowed for a request: 30 s, plus 10 s per MB sent (a 60 MB recording gets 10.5
 * minutes), since clinic Wi-Fi can be slow and a recording must not time out half-sent. */
export function timeoutFor(bytes = 0): number {
  return 30_000 + Math.ceil(bytes / 100_000) * 1000;
}

async function api(link: Link, path: string, init: RequestInit = {}, timeoutMs = timeoutFor()): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(new URL(path, link.url), { ...init, headers: { Authorization: `Bearer ${link.token}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new SyncError("Can't reach the hub");
  }
  if (res.status === 401) throw new SyncError("This phone is no longer paired. Pair it again.");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new SyncError(body?.error?.message ?? `Hub error ${res.status}`);
  }
  return res;
}

export async function pair(url: string, code: string, deviceId: string, worker: string): Promise<Link> {
  const base = url.trim().replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim().toUpperCase(), deviceId, worker }) });
  } catch {
    throw new SyncError("Can't reach the hub at that address");
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; facility?: string; node?: string; error?: { message?: string } };
  if (!res.ok || !body.token) throw new SyncError(body.error?.message ?? "Pairing failed");
  const link: Link = { url: base, token: body.token, facility: body.facility!, node: body.node ?? "hub" };
  // From now on the phone uses the facility name the hub knows (new visits carry it), not
  // the one typed at onboarding.
  await db.settings.bulkPut([{ key: "link", value: JSON.stringify(link) }, { key: "facility", value: link.facility }]);
  return link;
}

// Rejections that clear on a later sync (another phone's visit start has not arrived yet).
const TRANSIENT = new Set(["visit_unknown_yet"]);
let inflight: Promise<void> | null = null;

/** One sync round. If one is already running, this waits for it to finish, then runs a new
 * round, so a caller that just saved something knows it was included. */
export async function syncOnce(opts: { ifIdle?: boolean } = {}): Promise<void> {
  if (inflight && opts.ifIdle) return; // background ticks never queue up behind a long upload
  while (inflight) await inflight.catch(() => undefined);
  inflight = runSync();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

async function runSync(): Promise<void> {
  const link = await getLink();
  if (!link) return;
  set({ pushing: true });
  try {
    // 1. push, oldest first (a visit's start before its other events); events refused in this
    // round are skipped so the rest still go, and are offered again next round.
    let rejected = 0;
    const skip = new Set<string>();
    for (;;) {
      const unsynced = (await db.events.where("synced").equals(0).sortBy("at")).filter((e) => !skip.has(e.id));
      const batch = unsynced.slice(0, BATCH);
      if (!batch.length) break;
      const res = await api(link, "/v1/sync/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch.map(({ synced: _s, ...e }) => e) }) });
      const out = (await res.json()) as { accepted: string[]; rejected: { id: string; reason: string }[] };
      await db.events.bulkUpdate(out.accepted.map((id) => ({ key: id, changes: { synced: 1 as const } })));
      for (const r of out.rejected) {
        skip.add(r.id);
        if (TRANSIENT.has(r.reason)) continue;
        rejected++;
        await db.settings.put({ key: `rejected:${r.id}`, value: r.reason });
      }
    }
    // 2. upload recordings; one that fails does not hold back the others or the pull
    const failed: string[] = [];
    for (const b of await db.blobs.where("uploaded").equals(0).toArray()) {
      try {
        await api(link, `/v1/audio/${b.visitId}/${b.id}`, { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: b.blob }, timeoutFor(b.blob.size));
        await db.blobs.update(b.id, { uploaded: 1 });
      } catch (e) {
        if (e instanceof SyncError && /no longer paired/.test(e.message)) throw e;
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    // 3. pull
    let after = Number((await db.settings.get("cursor"))?.value ?? 0);
    for (;;) {
      const res = await api(link, `/v1/sync/pull?after=${after}&limit=500`);
      const out = (await res.json()) as { events: unknown[]; next: number };
      const valid = out.events.map((e) => VisitEvent.safeParse(e)).filter((r) => r.success).map((r) => ({ ...r.data!, synced: 1 as const }));
      if (valid.length) await db.events.bulkPut(valid);
      after = out.next;
      await db.settings.put({ key: "cursor", value: String(after) });
      if (out.events.length < 500) break;
    }
    // 4. the phone's copy of a recording goes once the hub has it and the record is confirmed
    await dropConfirmedAudio();
    const uploadError = failed.length ? `${failed.length} recording${failed.length > 1 ? "s" : ""} could not be sent to the hub (${failed[0]}). They are safe on this phone; the next sync tries again.` : null;
    set({ at: new Date().toISOString(), error: uploadError, rejected });
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    set({ pushing: false });
  }
}

export type JobStatus = { id: string; status: "queued" | "running" | "done" | "failed"; error: string | null; ahead?: number };

export async function requestDraft(visitId: string, language: string): Promise<JobStatus> {
  const link = await getLink();
  if (!link) throw new SyncError("Pair this phone with the clinic hub first (Settings)");
  await syncOnce();
  // Draft only once the hub has all of this visit: its events and every recording. (A problem
  // with another visit's recording does not hold this one back.)
  const pending = await db.events.where("visitId").equals(visitId).filter((e) => e.synced === 0).toArray();
  const blobs = await db.blobs.where("visitId").equals(visitId).toArray();
  if (pending.length || blobs.some((b) => !b.uploaded)) {
    const start = pending.find((e) => e.type === "visit.started");
    const why = start ? (await db.settings.get(`rejected:${start.id}`))?.value : undefined;
    throw new SyncError(
      why ? `The hub refused this visit (${why}). Ask your supervisor.`
      : state.error ?? "Part of this visit has not reached the hub yet. Stay on the clinic Wi-Fi and try again.",
    );
  }
  // Recordings the phone has already handed over and deleted (ADR-0033) are still the hub's.
  const captured = (await db.events.where("visitId").equals(visitId).filter((e) => e.type === "audio.captured").toArray())
    .map((e) => (e.payload as { blobId: string }).blobId);
  const audioIds = [...new Set([...blobs.map((b) => b.id), ...captured])];
  const res = await api(link, "/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitId, language, audioIds }) });
  const job = (await res.json()) as JobStatus;
  await db.settings.bulkPut([{ key: `job:${visitId}`, value: job.id }, { key: `jobAudio:${visitId}`, value: audioIds.join(",") }]);
  return job;
}

/** ADR-0033: delete the phone's copy of each recording the hub has stored, once the visit's
 * confirmation has reached the hub too. Until then the phone may be the only copy. */
export async function dropConfirmedAudio(): Promise<number> {
  const uploaded = await db.blobs.where("uploaded").equals(1).toArray();
  let dropped = 0;
  for (const visitId of new Set(uploaded.map((b) => b.visitId))) {
    const events = await db.events.where("visitId").equals(visitId).toArray();
    const v = reduce(events);
    const confirmation = events.filter((e) => e.type === "record.confirmed").at(-1);
    if (!v?.confirmed || !confirmation || confirmation.synced !== 1) continue;
    const ids = uploaded.filter((b) => b.visitId === visitId).map((b) => b.id);
    await db.blobs.bulkDelete(ids);
    dropped += ids.length;
  }
  return dropped;
}

/** The recordings the latest draft request covered (empty if none was asked from this phone). */
export async function draftedAudio(visitId: string): Promise<string[]> {
  return ((await db.settings.get(`jobAudio:${visitId}`))?.value ?? "").split(",").filter(Boolean);
}

/** True when a visit has a recording no draft has been asked for yet, so the phone asks by
 * itself: the nurse never has to remember, and a later "Record more" is drafted with the rest
 * (11 Oct hub test: two visits were confirmed before anyone asked for a draft). A visit drafted
 * before requests were kept on file (a draft, nothing on file) counts as drafted. */
export function hasUndraftedAudio(visit: Pick<Visit, "audio" | "draft" | "confirmed">, drafted: string[]): boolean {
  if (visit.confirmed || !visit.audio.length) return false;
  if (visit.draft && !drafted.length) return false;
  const done = new Set(drafted);
  return visit.audio.some((a) => !done.has(a.blobId));
}

export async function jobStatus(visitId: string): Promise<JobStatus | null> {
  const link = await getLink();
  const id = (await db.settings.get(`job:${visitId}`))?.value;
  if (!link || !id) return null;
  const res = await api(link, `/v1/jobs/${id}`);
  return (await res.json()) as JobStatus;
}

/** Background sync: on start, when the network returns, and every 20 s while visible. */
export function startSync(): () => void {
  const tick = () => document.visibilityState === "visible" && navigator.onLine && void syncOnce({ ifIdle: true });
  const t = window.setInterval(tick, 20_000);
  window.addEventListener("online", tick);
  tick();
  return () => {
    clearInterval(t);
    window.removeEventListener("online", tick);
  };
}
