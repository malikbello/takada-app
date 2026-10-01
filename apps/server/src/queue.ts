// Drafting queue (ADR-0023 §3). Phones submit jobs; workers draft records in priority
// order (danger-related first) and write the draft back as a `draft.received` event the
// phones pull. Retries back off; after 3 failures a job is marked failed with its error
// code, visible to the phone. Nothing fails silently.
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { makeEvent } from "@takada/protocol";
import { insertEvent, visit } from "./store";
import { UpstreamError, type Scribe } from "./upstream";

const MAX_ATTEMPTS = 3;

type JobRow = { id: string; visit_id: string; facility: string; language: string; audio_ids: string; attempts: number };

export function claimNext(db: DatabaseSync, now = new Date()): JobRow | null {
  const iso = now.toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare("SELECT id, visit_id, facility, language, audio_ids, attempts FROM jobs WHERE status = 'queued' AND not_before <= ? ORDER BY priority DESC, created_at LIMIT 1")
      .get(iso) as JobRow | undefined;
    if (row) db.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?").run(iso, row.id);
    db.exec("COMMIT");
    return row ?? null;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export async function runJob(db: DatabaseSync, scribe: Scribe, job: JobRow, node: string): Promise<void> {
  const now = () => new Date().toISOString();
  try {
    const v = visit(db, job.visit_id);
    if (!v) throw new UpstreamError("visit_missing", "the visit's events have not synced yet", true);
    const parts: string[] = [];
    for (const id of JSON.parse(job.audio_ids) as string[]) {
      const a = db.prepare("SELECT path FROM audio WHERE id = ? AND visit_id = ?").get(id, job.visit_id) as { path: string } | undefined;
      if (!a) throw new UpstreamError("audio_missing", `audio ${id} has not been uploaded yet`, true);
      parts.push(await scribe.transcribe(readFileSync(a.path), job.language));
    }
    const transcript = [...parts, ...v.notes].join("\n").trim();
    if (!transcript) throw new UpstreamError("nothing_to_draft", "no recording or notes for this visit", false);
    const draft = await scribe.extract(transcript, job.language === "auto" ? null : job.language);
    const ev = await makeEvent({
      visitId: job.visit_id, deviceId: `server:${node}`, worker: "takada-draft", type: "draft.received",
      payload: { transcript: transcript.slice(0, 50_000), ...draft },
    });
    insertEvent(db, ev, job.facility);
    db.prepare("UPDATE jobs SET status = 'done', error = NULL, updated_at = ? WHERE id = ?").run(now(), job.id);
  } catch (e) {
    const err = e instanceof UpstreamError ? e : new UpstreamError("internal", (e as Error).message, false);
    const retry = err.retryable && job.attempts + 1 < MAX_ATTEMPTS;
    const backoff = new Date(Date.now() + 30_000 * 2 ** job.attempts).toISOString();
    db.prepare("UPDATE jobs SET status = ?, error = ?, updated_at = ?, not_before = ? WHERE id = ?").run(
      retry ? "queued" : "failed", `${err.code}: ${err.message}`.slice(0, 500), now(), retry ? backoff : now(), job.id,
    );
  }
}

/** Start `n` worker loops; returns a stop function (used on shutdown and in tests). */
export function startWorkers(db: DatabaseSync, scribe: Scribe, n: number, node: string, idleMs = 1000): () => Promise<void> {
  let running = true;
  const loops = Array.from({ length: n }, async () => {
    while (running) {
      const job = claimNext(db);
      if (job) await runJob(db, scribe, job, node);
      else await new Promise((r) => setTimeout(r, idleMs));
    }
  });
  return async () => {
    running = false;
    await Promise.all(loops);
  };
}

/** Jobs left 'running' by a crash go back to the queue on start. */
export function recoverStuck(db: DatabaseSync): number {
  return Number(db.prepare("UPDATE jobs SET status = 'queued' WHERE status = 'running'").run().changes);
}
