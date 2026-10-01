import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { makeEvent, reduce, type Visit, type VisitEvent } from "@takada/protocol";
import { db } from "./db";

export type Profile = { worker: string; facility: string; deviceId: string };

export async function getProfile(): Promise<Profile | null> {
  const rows = await db.settings.bulkGet(["worker", "facility", "deviceId"]);
  const [worker, facility, deviceId] = rows.map((r) => r?.value);
  return worker && facility && deviceId ? { worker, facility, deviceId } : null;
}

export async function saveProfile(worker: string, facility: string): Promise<Profile> {
  const existing = await db.settings.get("deviceId");
  const deviceId = existing?.value ?? `dev-${crypto.randomUUID()}`;
  await db.settings.bulkPut([
    { key: "worker", value: worker },
    { key: "facility", value: facility },
    { key: "deviceId", value: deviceId },
  ]);
  return { worker, facility, deviceId };
}

type NewEvent = Parameters<typeof makeEvent>[0];

/** Validate, hash and store one event. Errors propagate to the caller's error state. */
export async function append(e: NewEvent): Promise<VisitEvent> {
  const ev = await makeEvent(e);
  await db.events.put({ ...ev, synced: 0 });
  return ev;
}

export async function visitEvents(visitId: string): Promise<VisitEvent[]> {
  return (await db.events.where("visitId").equals(visitId).toArray()).map(({ synced: _s, ...e }) => e as VisitEvent);
}

export async function allVisits(): Promise<Visit[]> {
  const events = await db.events.toArray();
  const byVisit = new Map<string, VisitEvent[]>();
  for (const { synced: _s, ...e } of events) {
    const list = byVisit.get(e.visitId) ?? [];
    list.push(e as VisitEvent);
    byVisit.set(e.visitId, list);
  }
  return [...byVisit.values()]
    .map(reduce)
    .filter((v): v is Visit => v !== null)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export async function pendingCount(): Promise<number> {
  return db.events.where("synced").equals(0).count();
}

/** Subscribe a component to a live IndexedDB query; errors are surfaced, not swallowed. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; error: Error | null } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setData, error: (e: unknown) => setError(e instanceof Error ? e : new Error(String(e))) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}
