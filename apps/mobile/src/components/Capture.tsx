import { useRef, useState } from "preact/hooks";
import { CONCEPTS } from "@takada/clinical";
import type { Visit, Vitals } from "@takada/protocol";
import { db } from "../lib/db";
import { append, type Profile } from "../lib/store";
import { ErrorNote } from "./ui";

type Props = { visit: Visit; profile: Profile };

const who = (v: Visit, p: Profile) => ({ visitId: v.id, deviceId: p.deviceId, worker: p.worker });

/** Record audio on the phone. The clip stays on the device until the hub or cloud drafts it. */
export function Recorder({ visit, profile }: Props) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const t0 = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const id = crypto.randomUUID();
        try {
          await db.blobs.put({ id, visitId: visit.id, blob, createdAt: new Date().toISOString(), uploaded: 0 });
          await append({ ...who(visit, profile), type: "audio.captured", payload: { blobId: id, seconds: Math.round((Date.now() - t0.current) / 1000), mime: blob.type } });
        } catch (e) {
          setError(`Recording could not be saved: ${(e as Error).message}`);
        }
        setRec(null);
      };
      mr.start(1000);
      t0.current = Date.now();
      setSecs(0);
      timer.current = window.setInterval(() => setSecs(Math.round((Date.now() - t0.current) / 1000)), 500);
      setRec(mr);
    } catch (e) {
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was refused. Allow it in the browser settings, or type notes instead." : `Microphone unavailable: ${(e as Error).message}`);
    }
  }

  return (
    <div class="card stack">
      <div class="row">
        <h2 class="grow">Record the visit</h2>
        {visit.audio.length > 0 && <span class="pill">{visit.audio.length} clip{visit.audio.length > 1 ? "s" : ""} · {visit.audio.reduce((n, a) => n + a.seconds, 0)} s</span>}
      </div>
      {rec ? (
        <button class="btn danger big" onClick={() => rec.stop()}><span class="rec-dot" aria-hidden="true" /> Stop · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</button>
      ) : (
        <button class="btn primary big" onClick={start}>🎙 Start recording</button>
      )}
      <p class="muted small">Talk with the woman as usual. Takada drafts the record from the recording when the clinic hub or internet is available.</p>
      <ErrorNote error={error} />
    </div>
  );
}

export function Notes({ visit, profile }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function add() {
    if (!text.trim()) return;
    try {
      await append({ ...who(visit, profile), type: "note.added", payload: { text: text.trim() } });
      setText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div class="card stack">
      <label class="field"><span>Notes (typed or dictated with the keyboard mic)</span>
        <textarea class="input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="e.g. Headache since yesterday, no bleeding" />
      </label>
      <button class="btn" onClick={add} disabled={!text.trim()}>Add note</button>
      {visit.notes.length > 0 && <ul class="small">{visit.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <ErrorNote error={error} />
    </div>
  );
}

/** Danger signs the worker sees or hears: one tap raises the alert instantly, offline. */
export function DangerChips({ visit, profile }: Props) {
  const [error, setError] = useState<string | null>(null);
  const on = new Set(visit.findings.filter((f) => f.origin === "worker" && (f.assertion === "present" || f.assertion === "possible")).map((f) => f.concept));
  async function toggle(concept: string) {
    try {
      if (on.has(concept)) await append({ ...who(visit, profile), type: "finding.removed", payload: { concept, assertion: "present" } });
      else await append({ ...who(visit, profile), type: "finding.set", payload: { concept, assertion: "present", origin: "worker" } });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div class="card stack">
      <h2>Danger signs seen or reported</h2>
      <div class="chips">
        {CONCEPTS.filter((c) => c.danger_sign).map((c) => (
          <button key={c.id} class="chip" aria-pressed={on.has(c.id)} onClick={() => toggle(c.id)} title={c.definition}>{c.label_en}</button>
        ))}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

const FIELDS: { key: keyof Vitals; label: string; step?: string }[] = [
  { key: "bp_systolic", label: "BP systolic" },
  { key: "bp_diastolic", label: "BP diastolic" },
  { key: "temperature_c", label: "Temp °C", step: "0.1" },
  { key: "weight_kg", label: "Weight kg", step: "0.1" },
  { key: "pulse", label: "Pulse" },
];

export function VitalsForm({ visit, profile }: Props) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const payload: Record<string, number> = {};
    for (const f of FIELDS) {
      const raw = vals[f.key];
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) return setError(`${f.label} must be a number`);
      payload[f.key] = f.step ? n : Math.round(n);
    }
    if ((payload.bp_systolic === undefined) !== (payload.bp_diastolic === undefined)) return setError("Enter both BP numbers");
    try {
      await append({ ...who(visit, profile), type: "vitals.set", payload });
      setVals({});
      setError(null);
    } catch {
      setError("A value is outside the possible range; check it and try again");
    }
  }
  return (
    <div class="card stack">
      <h2>Measurements</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {FIELDS.map((f) => (
          <label class="field" key={f.key}><span>{f.label}{visit.vitals[f.key] !== undefined ? ` (now ${visit.vitals[f.key]})` : ""}</span>
            <input class="input" inputMode="decimal" type="number" step={f.step ?? "1"} value={vals[f.key] ?? ""}
              onInput={(e) => setVals({ ...vals, [f.key]: (e.target as HTMLInputElement).value })} />
          </label>
        ))}
      </div>
      <button class="btn" onClick={save}>Save measurements</button>
      <ErrorNote error={error} />
    </div>
  );
}
