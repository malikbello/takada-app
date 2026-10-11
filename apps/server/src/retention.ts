// Retention (phc-scribe ADR-0033). Recordings and full transcripts are working material: the
// hub deletes them a set time after the record is confirmed (the window for "Correct this
// record"), or after an unfinished visit has sat for a month. The confirmed record stays:
// findings, their short evidence quotes and measurements. Every purge is logged as counts,
// never content.
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { makeEvent, type VisitEvent } from "@takada/protocol";

export type Retention = { audioDays: number; unconfirmedDays: number };
export type Purged = { visits: number; audioFiles: number; transcripts: number };

const DAY = 86_400_000;

/** Visits whose recordings and transcripts are due for deletion at `now`. A confirmed record
 * counts from its confirmation; an amendment reopens it, so an unconfirmed visit counts from
 * its start or its last amendment. */
export function dueVisits(db: DatabaseSync, r: Retention, now: Date): string[] {
  const rows = db
    .prepare("SELECT visit_id, type, at FROM events WHERE type IN ('visit.started', 'record.confirmed', 'record.amended') ORDER BY visit_id, seq")
    .all() as { visit_id: string; type: string; at: string }[];
  const last = new Map<string, { started?: number; confirmed?: number; amended?: number }>();
  for (const e of rows) {
    const v = last.get(e.visit_id) ?? {};
    const t = Date.parse(e.at);
    if (e.type === "visit.started") v.started = t;
    else if (e.type === "record.confirmed") v.confirmed = Math.max(v.confirmed ?? 0, t);
    else v.amended = Math.max(v.amended ?? 0, t);
    last.set(e.visit_id, v);
  }
  const due: string[] = [];
  for (const [id, v] of last) {
    const confirmed = v.confirmed !== undefined && (v.amended === undefined || v.amended < v.confirmed);
    const since = confirmed ? v.confirmed! : Math.max(v.started ?? 0, v.amended ?? 0);
    const days = confirmed ? r.audioDays : r.unconfirmedDays;
    if (since && now.getTime() - since >= days * DAY) due.push(id);
  }
  return due;
}

/** Delete one visit's recordings and empty the transcripts in the hub's own drafts. Only
 * server-authored events are re-issued (same id and time, a new content hash); a worker's
 * event is never rewritten. Returns what was removed; nothing left means a no-op. */
export async function purgeVisit(db: DatabaseSync, audioDir: string, visitId: string, now = new Date()): Promise<Omit<Purged, "visits">> {
  const files = db.prepare("SELECT path FROM audio WHERE visit_id = ?").all(visitId) as { path: string }[];
  for (const f of files) rmSync(f.path, { force: true });
  rmSync(join(audioDir, visitId), { recursive: true, force: true });
  db.prepare("DELETE FROM audio WHERE visit_id = ?").run(visitId);
  let transcripts = 0;
  const drafts = db
    .prepare("SELECT seq, body FROM events WHERE visit_id = ? AND type = 'draft.received' AND device_id LIKE 'server:%'")
    .all(visitId) as { seq: number; body: string }[];
  for (const d of drafts) {
    const e = JSON.parse(d.body) as Extract<VisitEvent, { type: "draft.received" }>;
    if (!e.payload.transcript) continue;
    const { hash: _old, ...rest } = e;
    const redacted = await makeEvent({ ...rest, payload: { ...e.payload, transcript: "" } });
    db.prepare("UPDATE events SET body = ? WHERE seq = ?").run(JSON.stringify(redacted), d.seq);
    transcripts++;
  }
  if (files.length || transcripts) {
    db.prepare("INSERT INTO purges (visit_id, at, audio_files, transcripts) VALUES (?,?,?,?)").run(visitId, now.toISOString(), files.length, transcripts);
  }
  return { audioFiles: files.length, transcripts };
}

export async function purgeDue(db: DatabaseSync, audioDir: string, r: Retention, now = new Date()): Promise<Purged> {
  const out: Purged = { visits: 0, audioFiles: 0, transcripts: 0 };
  for (const id of dueVisits(db, r, now)) {
    const p = await purgeVisit(db, audioDir, id, now);
    if (p.audioFiles || p.transcripts) out.visits++;
    out.audioFiles += p.audioFiles;
    out.transcripts += p.transcripts;
  }
  return out;
}

/** Run at start and every hour; returns a stop function. */
export function startRetention(
  db: DatabaseSync,
  audioDir: string,
  r: Retention,
  log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void },
): () => void {
  const tick = () =>
    purgeDue(db, audioDir, r)
      .then((p) => p.visits && log.info(p, "retention: deleted recordings and transcripts past their time (ADR-0033)"))
      .catch((err: Error) => log.error({ err: err.message }, "retention: purge failed"));
  void tick();
  const t = setInterval(tick, 3_600_000);
  return () => clearInterval(t);
}
