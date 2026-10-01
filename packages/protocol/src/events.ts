// The visit record as an append-only event log (ADR-0023 §4; architecture B3).
// Events are immutable and content-addressed: `hash` covers everything but itself, and
// an amendment names the event it corrects, so replicas on phones, the clinic hub and
// the cloud can merge by union without conflicts or loss.

import { z } from "zod";

export const Assertion = z.enum(["present", "absent", "possible", "historical"]);

export const Finding = z.object({
  concept: z.string().min(1),
  assertion: Assertion,
  evidence: z.string().max(500).optional(),
  /** Who put it there: the health worker's tap, or the model's draft. */
  origin: z.enum(["worker", "model"]),
});
export type Finding = z.infer<typeof Finding>;

export const Vitals = z.object({
  bp_systolic: z.number().int().min(40).max(300).optional(),
  bp_diastolic: z.number().int().min(20).max(200).optional(),
  temperature_c: z.number().min(30).max(45).optional(),
  pulse: z.number().int().min(20).max(250).optional(),
  weight_kg: z.number().min(20).max(250).optional(),
});
export type Vitals = z.infer<typeof Vitals>;

const base = {
  id: z.string().uuid(),
  visitId: z.string().uuid(),
  deviceId: z.string().min(1).max(64),
  worker: z.string().min(1).max(64),
  at: z.string().datetime(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
};

export const VisitEvent = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("visit.started"),
    payload: z.object({
      facility: z.string().min(1).max(64),
      patientRef: z.string().min(1).max(64), // ANC card number or initials; never a full name
      language: z.enum(["yo", "pcm", "en", "auto"]),
      firstContact: z.boolean().nullable(),
      weeks: z.number().min(0).max(45).nullable(),
    }),
  }),
  z.object({ ...base, type: z.literal("note.added"), payload: z.object({ text: z.string().min(1).max(20_000) }) }),
  z.object({
    ...base,
    type: z.literal("audio.captured"),
    payload: z.object({ blobId: z.string().min(1), seconds: z.number().min(0).max(7200), mime: z.string().max(64) }),
  }),
  z.object({ ...base, type: z.literal("finding.set"), payload: Finding }),
  z.object({ ...base, type: z.literal("finding.removed"), payload: z.object({ concept: z.string(), assertion: Assertion }) }),
  z.object({ ...base, type: z.literal("vitals.set"), payload: Vitals }),
  /** The worker marks a visit-guide question as asked (or un-marks it). */
  z.object({ ...base, type: z.literal("guide.marked"), payload: z.object({ itemId: z.string().min(1).max(64), asked: z.boolean() }) }),
  z.object({
    ...base,
    type: z.literal("draft.received"),
    payload: z.object({
      transcript: z.string().max(50_000),
      findings: z.array(Finding).max(60),
      vitals: Vitals,
      model: z.string().max(120),
      needsReview: z.array(z.string().max(200)).max(60),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("record.confirmed"),
    payload: z.object({ recordHash: z.string().regex(/^[0-9a-f]{64}$/) }),
  }),
  z.object({
    ...base,
    type: z.literal("record.amended"),
    payload: z.object({ amends: z.string().uuid(), reason: z.string().min(3).max(500) }),
  }),
]);
export type VisitEvent = z.infer<typeof VisitEvent>;
export type EventType = VisitEvent["type"];
