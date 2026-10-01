// FHIR R4 export of a confirmed visit (ADR-0023 §6; architecture B3): Encounter,
// Observations (findings and vitals), and Provenance recording that the record was
// drafted by a model and confirmed by a named health worker. LOINC codes for vitals;
// findings carry the Takada concept id until the vocabulary's ICD-11/DAK mapping is verified.
import { CONCEPT_BY_ID } from "@takada/clinical";
import { flagsOf, type Visit } from "@takada/protocol";

const LOINC = "http://loinc.org";
const CONCEPTS = "https://takada.health/fhir/CodeSystem/anc-concepts";
const ASSERTION = "https://takada.health/fhir/CodeSystem/assertion";

type Resource = Record<string, unknown> & { resourceType: string; id: string };

export function toFhir(v: Visit, opts: { facility: string; node: string }): Record<string, unknown> {
  const enc = `urn:uuid:${v.id}`;
  const subject = { identifier: { system: `urn:takada:facility:${opts.facility}:anc-card`, value: v.patientRef } };
  const resources: Resource[] = [
    {
      resourceType: "Encounter",
      id: v.id,
      status: v.confirmed ? "finished" : "in-progress",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
      type: [{ text: "Antenatal care contact" }],
      subject,
      period: { start: v.startedAt },
      serviceProvider: { identifier: { system: "urn:nigeria:hfr", value: opts.facility } },
    },
  ];
  const obs = (id: string, code: Record<string, unknown>, value: Record<string, unknown>) =>
    resources.push({ resourceType: "Observation", id, status: v.confirmed ? "final" : "preliminary", code, subject, encounter: { reference: enc }, effectiveDateTime: v.startedAt, ...value });
  v.findings.forEach((f, i) => {
    obs(`${v.id}-f${i}`, { coding: [{ system: CONCEPTS, code: f.concept, display: CONCEPT_BY_ID.get(f.concept)?.label_en ?? f.concept }] }, {
      valueCodeableConcept: { coding: [{ system: ASSERTION, code: f.assertion }] },
      ...(f.evidence ? { note: [{ text: `Evidence: "${f.evidence}"` }] } : {}),
    });
  });
  const vit = v.vitals;
  if (vit.bp_systolic && vit.bp_diastolic) {
    obs(`${v.id}-bp`, { coding: [{ system: LOINC, code: "85354-9", display: "Blood pressure panel" }] }, {
      component: [
        { code: { coding: [{ system: LOINC, code: "8480-6", display: "Systolic blood pressure" }] }, valueQuantity: { value: vit.bp_systolic, unit: "mm[Hg]", system: "http://unitsofmeasure.org", code: "mm[Hg]" } },
        { code: { coding: [{ system: LOINC, code: "8462-4", display: "Diastolic blood pressure" }] }, valueQuantity: { value: vit.bp_diastolic, unit: "mm[Hg]", system: "http://unitsofmeasure.org", code: "mm[Hg]" } },
      ],
    });
  }
  const q = (id: string, code: string, display: string, value: number | undefined, unit: string) =>
    value !== undefined && obs(`${v.id}-${id}`, { coding: [{ system: LOINC, code, display }] }, { valueQuantity: { value, unit, system: "http://unitsofmeasure.org", code: unit } });
  q("temp", "8310-5", "Body temperature", vit.temperature_c, "Cel");
  q("wt", "29463-7", "Body weight", vit.weight_kg, "kg");
  q("pulse", "8867-4", "Heart rate", vit.pulse, "/min");
  for (const f of flagsOf(v)) {
    resources.push({
      resourceType: "Flag", id: `${v.id}-${f.ruleId}`, status: "active", subject, encounter: { reference: enc },
      category: [{ text: f.severity === "urgent_referral" ? "Urgent referral" : "Referral" }],
      code: { text: `${f.ruleId} ${f.name}: ${f.message}` },
    });
  }
  resources.push({
    resourceType: "Provenance",
    id: `${v.id}-prov`,
    target: resources.map((r) => ({ reference: `urn:uuid:${r.id}` })),
    recorded: v.confirmed?.at ?? new Date().toISOString(),
    agent: [
      ...(v.draft ? [{ type: { text: "assembler" }, who: { display: `AI draft: ${v.draft.model}` } }] : []),
      ...(v.confirmed ? [{ type: { text: "verifier" }, who: { display: `Health worker ${v.confirmed.by}` } }] : []),
      { type: { text: "custodian" }, who: { display: `Takada ${opts.node}` } },
    ],
  });
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: resources.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
}
