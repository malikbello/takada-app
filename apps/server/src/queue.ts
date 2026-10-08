// Drafting queue (ADR-0023 §3). Phones submit jobs; workers draft records in priority
// order (danger-related first) and write the draft back as a `draft.received` event the
// phones pull. Retries back off; after 3 failures a job is marked failed with its error
// code, visible to the phone. Nothing fails silently.
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { makeEvent } from "@takada/protocol";
import { insertEvent, visit } from "./store";
import { UpstreamError, type Draft, type Scribe } from "./upstream";
import { isSilent, splitWav } from "./wav";

const MAX_ATTEMPTS = 3;
// Under phc-scribe's 10 MB request limit (16 kHz mono 16-bit: 4 min is 7.7 MB).
export const SEGMENT_SECONDS = 240;
// phc-scribe /v1/extract takes at most 8,000 characters (PHC_MAX_TEXT_CHARS); a long visit
// (about 10 minutes of speech or more) is drafted in parts and the parts merged.
export const EXTRACT_CHARS = 8000;
// draft.received limits (packages/protocol events.ts): a draft over them could not be stored.
const MAX_FINDINGS = 60, MAX_REVIEW = 60, REVIEW_CHARS = 200;

/** Split text into parts of at most `max` characters, at a sentence or word end when possible. */
export function splitText(text: string, max = EXTRACT_CHARS): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const at = cut > max / 2 ? cut + 1 : window.lastIndexOf(" ") > max / 2 ? window.lastIndexOf(" ") : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

type Extracted = Omit<Draft, "transcript">;

// When parts disagree about a finding, the more alarming answer is kept, so a danger sign said
// in one part is never hidden by an "absent" in another.
const ALARM = { present: 3, possible: 2, historical: 1, absent: 0 } as const;

/** Merge the drafts of a long visit's parts. Nothing is dropped silently: whatever the parts
 * disagree on is listed for the health worker to check (a vital keeps its first value). */
export function mergeDrafts(drafts: Extracted[]): Extracted {
  if (drafts.length === 1) return drafts[0]!;
  const review = [`Long visit: drafted in ${drafts.length} parts. Check the whole record.`];
  const findings: Extracted["findings"] = [];
  for (const f of drafts.flatMap((d) => d.findings)) {
    const i = findings.findIndex((x) => x.concept === f.concept);
    if (i < 0) findings.push(f);
    else if (findings[i]!.assertion !== f.assertion) {
      review.push(`${f.concept}: ${findings[i]!.assertion} in one part, ${f.assertion} in another`);
      if (ALARM[f.assertion] > ALARM[findings[i]!.assertion]) findings[i] = f;
    }
  }
  const vitals: Extracted["vitals"] = {};
  for (const d of drafts) {
    for (const [k, v] of Object.entries(d.vitals) as [keyof Extracted["vitals"], number][]) {
      if (vitals[k] === undefined) vitals[k] = v;
      else if (vitals[k] !== v) review.push(`${k}: ${vitals[k]} in one part, ${v} in another`);
    }
  }
  return { findings, vitals, model: drafts[0]!.model, needsReview: [...review, ...drafts.flatMap((d) => d.needsReview)] };
}

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
    const review: string[] = [];
    let silent = 0;
    for (const id of JSON.parse(job.audio_ids) as string[]) {
      const a = db.prepare("SELECT path FROM audio WHERE id = ? AND visit_id = ?").get(id, job.visit_id) as { path: string } | undefined;
      if (!a) throw new UpstreamError("audio_missing", `audio ${id} has not been uploaded yet`, true);
      // The speech API takes about 5 minutes per request; a visit can be longer.
      let segments: Buffer[];
      try {
        segments = splitWav(readFileSync(a.path), SEGMENT_SECONDS);
      } catch (e) {
        throw new UpstreamError("audio_invalid", `audio ${id}: ${(e as Error).message}`, false);
      }
      const texts: string[] = [];
      for (const seg of segments) {
        if (isSilent(seg)) continue;
        // An empty transcript means the hub's speech gate heard no speech (phc-scribe ADR-0031).
        const text = (await scribe.transcribe(seg, job.language)).trim();
        if (text) texts.push(text);
      }
      if (!texts.length) {
        silent++;
        continue;
      }
      parts.push(texts.join(" ").trim());
    }
    if (silent) review.push(`${silent} recording${silent > 1 ? "s" : ""} had no speech the hub could hear (silent, or only noise), so ${silent > 1 ? "they were" : "it was"} not used`);
    const transcript = [...parts, ...v.notes].join("\n").trim();
    if (!transcript) {
      if (silent) throw new UpstreamError("silent_audio", "no speech could be heard in the recording (silent, or only noise)", false);
      throw new UpstreamError("nothing_to_draft", "no recording or notes for this visit", false);
    }
    const lang = job.language === "auto" ? null : job.language;
    const drafts: Extracted[] = [];
    for (const part of splitText(transcript)) drafts.push(await scribe.extract(part, lang));
    const draft = mergeDrafts(drafts);
    const ev = await makeEvent({
      visitId: job.visit_id, deviceId: `server:${node}`, worker: "takada-draft", type: "draft.received",
      payload: {
        transcript: transcript.slice(0, 50_000),
        ...draft,
        findings: draft.findings.slice(0, MAX_FINDINGS),
        needsReview: [...review, ...draft.needsReview].slice(0, MAX_REVIEW).map((r) => r.slice(0, REVIEW_CHARS)),
      },
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
