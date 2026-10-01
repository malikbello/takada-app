// Phone <-> hub/cloud sync (ADR-0023 §4). Push unsynced events, upload recordings, pull
// what other devices and the drafting service wrote. Every failure is recorded and shown
// in the app; nothing is deleted from the phone because of a sync.

import { useEffect, useState } from "preact/hooks";
import { VisitEvent } from "@takada/protocol";
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

async function api(link: Link, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(new URL(path, link.url), { ...init, headers: { Authorization: `Bearer ${link.token}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
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
  await db.settings.put({ key: "link", value: JSON.stringify(link) });
  return link;
}

export async function syncOnce(): Promise<void> {
  const link = await getLink();
  if (!link || state.pushing) return;
  set({ pushing: true });
  try {
    // 1. push
    let rejected = 0;
    for (;;) {
      const batch = await db.events.where("synced").equals(0).limit(BATCH).toArray();
      if (!batch.length) break;
      const res = await api(link, "/v1/sync/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch.map(({ synced: _s, ...e }) => e) }) });
      const out = (await res.json()) as { accepted: string[]; rejected: { id: string; reason: string }[] };
      await db.events.bulkUpdate(out.accepted.map((id) => ({ key: id, changes: { synced: 1 as const } })));
      rejected += out.rejected.length;
      for (const r of out.rejected) await db.settings.put({ key: `rejected:${r.id}`, value: r.reason });
      if (!out.accepted.length) break; // only rejections left: stop instead of looping
    }
    // 2. upload recordings
    for (const b of await db.blobs.where("uploaded").equals(0).toArray()) {
      await api(link, `/v1/audio/${b.visitId}/${b.id}`, { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: b.blob });
      await db.blobs.update(b.id, { uploaded: 1 });
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
    set({ at: new Date().toISOString(), error: null, rejected });
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
  if (state.error) throw new SyncError(state.error);
  const audioIds = (await db.blobs.where("visitId").equals(visitId).toArray()).map((b) => b.id);
  const res = await api(link, "/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitId, language, audioIds }) });
  const job = (await res.json()) as JobStatus;
  await db.settings.put({ key: `job:${visitId}`, value: job.id });
  return job;
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
  const tick = () => document.visibilityState === "visible" && navigator.onLine && void syncOnce();
  const t = window.setInterval(tick, 20_000);
  window.addEventListener("online", tick);
  tick();
  return () => {
    clearInterval(t);
    window.removeEventListener("online", tick);
  };
}
