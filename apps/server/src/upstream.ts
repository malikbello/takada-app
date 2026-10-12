// Client for the phc-scribe /v1 API (contract: phc-scribe docs/openapi.v1.json). The hub
// points it at the local API with the offline model; the cloud at the GPU deployment.
import { Agent, fetch } from "undici";
import { CONCEPT_BY_ID } from "@takada/clinical";
import type { Finding, Vitals } from "@takada/protocol";

export type Draft = { transcript: string; findings: Finding[]; vitals: Vitals; model: string; needsReview: string[] };

export interface Scribe {
  transcribe(wav: Buffer, language: string): Promise<string>;
  extract(text: string, language: string | null): Promise<Omit<Draft, "transcript">>;
}

export class UpstreamError extends Error {
  constructor(public code: string, message: string, public retryable: boolean) {
    super(message);
  }
}

type Encounter = {
  findings?: { concept: string; assertion: string; evidence?: { text: string } | null }[];
  vitals?: {
    blood_pressure?: { systolic: number; diastolic: number } | null;
    temperature?: { value: number; unit: string } | null;
    weight?: { value: number } | null;
    pulse?: { value: number } | null;
  };
};

type Note = { path?: string; reason?: string; detail?: string };

// "Please check" notes are read by a nurse mid-clinic: one short sentence in plain words, never
// the API's field paths or reason codes.
const FIELD: Record<string, string> = {
  "vitals.blood_pressure": "Blood pressure", "vitals.temperature": "Temperature", "vitals.weight": "Weight",
  "vitals.pulse": "Pulse", "anc.gestational_age": "Weeks pregnant", "anc.gravida": "Number of pregnancies",
  "anc.parity": "Number of births", "anc.contact_number": "Visit number", "disposition.referral": "Referral",
  "disposition.next_visit": "Next visit",
};
const LEFT_OUT: Record<string, string> = {
  ungrounded: "left out, because it was not in what was said",
  value_not_in_evidence: "left out, because the number was not heard. Measure it again",
  out_of_range: "left out, because the value was not possible",
  inconsistent: "left out, because the values did not agree",
  schema_repair: "left out, because the draft for it was incomplete",
};
const short = (q: string, n = 60) => (q.length > n ? `${q.slice(0, n).replace(/\s+\S*$/, "")}…` : q);
const labelOf = (concept: string) => CONCEPT_BY_ID.get(concept)?.label_en ?? "A finding";

function fieldName(path: string | undefined): string {
  if (!path) return "A value";
  if (path.startsWith("findings[")) return "A finding";
  if (path.startsWith("anc.tests")) return "A test result";
  if (path.startsWith("anc.medications")) return "A medicine";
  return FIELD[path] ?? "A value";
}

export function checkNote(c: Note, record: Encounter): string {
  const i = /^findings\[(\d+)\]/.exec(c.path ?? "");
  const f = i ? record.findings?.[Number(i[1])] : undefined;
  if (f) {
    const quote = f.evidence?.text ? ` ("${short(f.evidence.text)}")` : "";
    if (c.reason === "polarity") return `${labelOf(f.concept)}: what was heard sounds like she does not have it${quote}. Remove it unless she does.`;
    return `${labelOf(f.concept)}: the words heard do not mention it${quote}. Ask her again before you keep it.`;
  }
  if (c.path?.startsWith("vitals.")) return `${fieldName(c.path)}: no number was heard for it. Measure it again before you keep it.`;
  return `Please check ${fieldName(c.path).toLowerCase()}.`;
}

export function droppedNote(d: Note): string {
  if (d.path?.startsWith("findings[")) return "One AI finding was left out, because its words were not in what was said.";
  return `${fieldName(d.path)}: ${LEFT_OUT[d.reason ?? ""] ?? "left out, please check it"}.`;
}

export function toDraft(record: Encounter, dropped: Note[], model: string, checks: Note[] = []): Omit<Draft, "transcript"> {
  const findings: Finding[] = (record.findings ?? [])
    .filter((f) => ["present", "absent", "possible", "historical"].includes(f.assertion))
    .map((f) => ({ concept: f.concept, assertion: f.assertion as Finding["assertion"], evidence: f.evidence?.text?.slice(0, 500), origin: "model" as const }));
  const v = record.vitals ?? {};
  const vitals: Vitals = {};
  if (v.blood_pressure) Object.assign(vitals, { bp_systolic: v.blood_pressure.systolic, bp_diastolic: v.blood_pressure.diastolic });
  if (v.temperature) vitals.temperature_c = v.temperature.unit === "Cel" ? v.temperature.value : Math.round(((v.temperature.value - 32) * 5 / 9) * 10) / 10;
  if (v.weight) vitals.weight_kg = v.weight.value;
  if (v.pulse) vitals.pulse = v.pulse.value;
  // Checks (phc-scribe ADR-0030, ADR-0036) keep the field and say why to look again; dropped
  // fields say what was left out. Duplicates (e.g. two medicines left out) are said once.
  const needsReview = [...new Set([...checks.map((c) => checkNote(c, record)), ...dropped.map(droppedNote)])];
  return { findings, vitals, model, needsReview };
}

// 15 minutes: on a laptop CPU the API may take up to 10 minutes for one long draft (phc-scribe
// PHC_LLAMACPP_TIMEOUT); jobs are queued, so a slow draft never blocks the nurse.
// The agent's own limits must be raised too: Node's fetch gives up after 300 s without response
// headers (UND_ERR_HEADERS_TIMEOUT) whatever the abort signal says, and the API sends its
// headers only when the draft is done, so every draft over 5 minutes failed and was retried.
export function httpScribe(base: string, apiKey?: string, proxy?: { key: string; secret: string }, timeoutMs = 900_000): Scribe {
  const dispatcher = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  const headers = (type: string): Record<string, string> => ({
    "Content-Type": type,
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(proxy ? { "Modal-Key": proxy.key, "Modal-Secret": proxy.secret } : {}),
  });
  async function call(path: string, init: { method: string; headers: Record<string, string>; body: string | Uint8Array }): Promise<unknown> {
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(new URL(path, base), { ...init, dispatcher, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new UpstreamError("upstream_unreachable", `phc-scribe unreachable: ${(e as Error).message}`, true);
    }
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429;
      throw new UpstreamError(`upstream_${res.status}`, `phc-scribe ${path} returned ${res.status}`, retryable);
    }
    return res.json();
  }
  return {
    async transcribe(wav, language) {
      const lang = ["yo", "pcm", "en", "ha", "ig"].includes(language) ? language : "en";
      const out = (await call(`/v1/transcribe?language=${lang}`, { method: "POST", headers: headers("audio/wav"), body: new Uint8Array(wav) })) as { text: string };
      return out.text;
    },
    async extract(text, language) {
      const body = JSON.stringify(language && language !== "auto" ? { text, language } : { text });
      const out = (await call("/v1/extract", { method: "POST", headers: headers("application/json"), body })) as {
        record: Encounter;
        grounding: { dropped: Note[]; checks?: Note[] };
        versions?: { model?: string };
      };
      return toDraft(out.record, out.grounding?.dropped ?? [], out.versions?.model ?? "phc-scribe", out.grounding?.checks ?? []);
    },
  };
}
