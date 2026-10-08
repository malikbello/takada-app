// Client for the phc-scribe /v1 API (contract: phc-scribe docs/openapi.v1.json). The hub
// points it at the local API with the offline model; the cloud at the GPU deployment.
import { Agent, fetch } from "undici";
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
  // Checks (phc-scribe ADR-0030) keep the field and say why to look again; their detail is
  // already a sentence for the health worker.
  const needsReview = [
    ...checks.map((c) => `Check this: ${c.detail || c.path || "a finding"}`),
    ...dropped.map((d) => `${d.path ?? "field"}: ${d.reason ?? "needs review"}${d.detail ? ` (${d.detail})` : ""}`),
  ];
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
