// Visit state = a pure fold over its events, in (at, id) order. Every replica that holds
// the same set of events computes the same state, whatever order they arrived in.

import { BUNDLE, GUIDE, evaluate, facts, status, type Flag, type FactsInput, type GuideStatus } from "@takada/clinical";
import { canonical, sha256Hex } from "./hash";
import type { Finding, VisitEvent, Vitals } from "./events";

export type Visit = {
  id: string;
  facility: string;
  patientRef: string;
  language: string;
  firstContact: boolean | null;
  weeks: number | null;
  startedAt: string;
  notes: string[];
  transcript: string;
  audio: { blobId: string; seconds: number; mime: string }[];
  findings: Finding[];
  vitals: Vitals;
  draft: { model: string; needsReview: string[] } | null;
  confirmed: { at: string; by: string; recordHash: string } | null;
  amendments: { at: string; by: string; reason: string }[];
};

export function order(events: VisitEvent[]): VisitEvent[] {
  const seen = new Set<string>();
  return [...events]
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const key = (f: { concept: string; assertion: string }) => `${f.concept}|${f.assertion}`;

export function reduce(events: VisitEvent[]): Visit | null {
  let v: Visit | null = null;
  for (const e of order(events)) {
    if (e.type === "visit.started") {
      v = {
        id: e.visitId, ...e.payload, startedAt: e.at, notes: [], transcript: "", audio: [], findings: [], vitals: {},
        draft: null, confirmed: null, amendments: [],
      };
      continue;
    }
    if (!v || e.visitId !== v.id) continue;
    switch (e.type) {
      case "note.added":
        v.notes.push(e.payload.text);
        break;
      case "audio.captured":
        v.audio.push(e.payload);
        break;
      case "finding.set":
        v.findings = [...v.findings.filter((f) => key(f) !== key(e.payload)), e.payload];
        break;
      case "finding.removed":
        v.findings = v.findings.filter((f) => key(f) !== key(e.payload));
        break;
      case "vitals.set":
        v.vitals = { ...v.vitals, ...e.payload };
        break;
      case "draft.received": {
        v.transcript = e.payload.transcript;
        // The worker's own entries win over the model's draft for the same concept.
        const workerConcepts = new Set(v.findings.filter((f) => f.origin === "worker").map((f) => f.concept));
        v.findings = [...v.findings, ...e.payload.findings.filter((f) => !workerConcepts.has(f.concept))];
        v.vitals = { ...e.payload.vitals, ...v.vitals };
        v.draft = { model: e.payload.model, needsReview: e.payload.needsReview };
        break;
      }
      case "record.confirmed":
        v.confirmed = { at: e.at, by: e.worker, recordHash: e.payload.recordHash };
        break;
      case "record.amended":
        v.amendments.push({ at: e.at, by: e.worker, reason: e.payload.reason });
        v.confirmed = null; // an amendment reopens the record until it is confirmed again
        break;
    }
  }
  return v;
}

export function factsOf(v: Visit): FactsInput {
  const findings: Record<string, string[]> = {};
  for (const f of v.findings) (findings[f.concept] ??= []).push(f.assertion);
  const vitals: Record<string, number> = {};
  for (const [k, x] of Object.entries(v.vitals)) if (typeof x === "number") vitals[k] = x;
  return { findings, vitals };
}

/** Danger-sign flags for the visit as it stands (rules run offline, on the phone). */
export function flagsOf(v: Visit): Flag[] {
  return evaluate(BUNDLE.rules.rules, facts(factsOf(v)));
}

/** Visit-guide status from everything said or typed so far. */
export function guideOf(v: Visit): GuideStatus {
  const text = [...v.notes, v.transcript].join("\n");
  return status(GUIDE, text, facts(factsOf(v)), v.firstContact, v.weeks);
}

/** The clinical content a confirmation vouches for; hashed so later edits are detectable. */
export function recordHash(v: Visit): Promise<string> {
  const findings = [...v.findings].map(({ concept, assertion, evidence }) => ({ concept, assertion, evidence })).sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return sha256Hex(canonical({ visit: v.id, patientRef: v.patientRef, weeks: v.weeks, findings, vitals: v.vitals }));
}
