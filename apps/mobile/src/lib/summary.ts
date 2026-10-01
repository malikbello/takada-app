// Plain-language views of a visit: "summary so far" and the referral note. Pure
// functions, so they are tested without a browser.

import { CONCEPT_BY_ID, GUIDE } from "@takada/clinical";
import { flagsOf, guideOf, type Visit } from "@takada/protocol";

const ASSERT: Record<string, string> = { present: "yes", absent: "no", possible: "possibly", historical: "in a past pregnancy" };

export const label = (concept: string) => CONCEPT_BY_ID.get(concept)?.label_en ?? concept;

export function vitalsLine(v: Visit["vitals"]): string {
  const parts: string[] = [];
  if (v.bp_systolic && v.bp_diastolic) parts.push(`BP ${v.bp_systolic}/${v.bp_diastolic}`);
  if (v.temperature_c) parts.push(`Temp ${v.temperature_c} °C`);
  if (v.pulse) parts.push(`Pulse ${v.pulse}`);
  if (v.weight_kg) parts.push(`Weight ${v.weight_kg} kg`);
  return parts.join(" · ");
}

export type Summary = { found: string[]; vitals: string; asked: string[]; notYet: string[]; followUps: string[] };

export function summary(v: Visit): Summary {
  const g = guideOf(v);
  const ask = new Map(GUIDE.items.map((i) => [i.id, i.ask]));
  const why = new Map(GUIDE.followUps.map((f) => [f.id, f.why]));
  return {
    found: v.findings.map((f) => `${label(f.concept)}: ${ASSERT[f.assertion] ?? f.assertion}${f.evidence ? ` (“${f.evidence}”)` : ""}`),
    vitals: vitalsLine(v.vitals),
    asked: g.items.filter((i) => i.covered).map((i) => ask.get(i.id) ?? i.id),
    notYet: g.items.filter((i) => !i.covered).map((i) => ask.get(i.id) ?? i.id),
    followUps: g.follow_ups.map((f) => why.get(f.id) ?? f.id),
  };
}

export function referralNote(v: Visit, facility: string, worker: string): string {
  const flags = flagsOf(v);
  const lines = [
    `REFERRAL — antenatal`,
    `From: ${facility} (${worker})`,
    `Patient: ${v.patientRef}${v.weeks !== null ? `, ${v.weeks} weeks pregnant` : ""}`,
    `Reason: ${flags.map((f) => f.name).join("; ") || "clinical concern"}`,
  ];
  const present = v.findings.filter((f) => f.assertion === "present" || f.assertion === "possible");
  if (present.length) lines.push(`Findings: ${present.map((f) => `${label(f.concept)}${f.assertion === "possible" ? " (possible)" : ""}`).join(", ")}`);
  const vit = vitalsLine(v.vitals);
  if (vit) lines.push(`Vitals: ${vit}`);
  for (const f of flags) lines.push(`Danger sign ${f.ruleId}: ${f.message} [${f.sourceRef}${f.sourceSection ? `, ${f.sourceSection}` : ""}]`);
  lines.push(`Recorded with Takada. Draft clinical content; confirm against the patient.`);
  return lines.join("\n");
}
