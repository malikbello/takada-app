import { useEffect, useRef, useState } from "preact/hooks";
import { CONCEPTS } from "@takada/clinical";
import type { Visit, Vitals } from "@takada/protocol";
import { db } from "../lib/db";
import { append, type Profile } from "../lib/store";
import { toWav16k } from "../lib/wav";
import { I } from "./icons";
import { ErrorNote } from "./ui";

type Props = { visit: Visit; profile: Profile };

const who = (v: Visit, p: Profile) => ({ visitId: v.id, deviceId: p.deviceId, worker: p.worker });

/** The record orb. Audio stays on the phone (as 16 kHz WAV) until the hub or cloud drafts it. */
export function Recorder({ visit, profile }: Props) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const t0 = useRef(0);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function drawWave(stream: MediaStream) {
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const loop = () => {
      const c = canvas.current;
      if (c) {
        const g = c.getContext("2d")!;
        const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio);
        an.getByteTimeDomainData(data);
        g.clearRect(0, 0, w, h);
        const bars = 48, bw = w / bars;
        g.fillStyle = getComputedStyle(c).color;
        for (let i = 0; i < bars; i++) {
          const v = Math.abs((data[Math.floor((i / bars) * data.length)] ?? 128) - 128) / 128;
          const bh = Math.max(3 * devicePixelRatio, v * h * 1.8);
          g.globalAlpha = 0.35 + v * 1.3;
          g.beginPath();
          g.roundRect(i * bw + bw * 0.25, (h - bh) / 2, bw * 0.5, bh, bw * 0.25);
          g.fill();
        }
      }
      raf.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf.current);
      void ctx.close();
    };
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const stopWave = drawWave(stream);
      const timer = window.setInterval(() => setSecs(Math.round((Date.now() - t0.current) / 1000)), 250);
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer);
        stopWave();
        setRec(null);
        setSaving(true);
        const id = crypto.randomUUID();
        try {
          const { wav, seconds } = await toWav16k(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
          await db.blobs.put({ id, visitId: visit.id, blob: wav, createdAt: new Date().toISOString(), uploaded: 0 });
          await append({ ...who(visit, profile), type: "audio.captured", payload: { blobId: id, seconds: Math.round(seconds), mime: "audio/wav" } });
        } catch (e) {
          setError(`The recording could not be saved: ${(e as Error).message}`);
        } finally {
          setSaving(false);
        }
      };
      mr.start(1000);
      t0.current = Date.now();
      setSecs(0);
      setRec(mr);
      navigator.vibrate?.(20);
    } catch (e) {
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was refused. Allow it in the phone's settings, or type notes instead." : `Microphone unavailable: ${(e as Error).message}`);
    }
  }

  const total = visit.audio.reduce((n, a) => n + a.seconds, 0);
  return (
    <section class="glass center stack">
      <div class="orb-wrap">
        <button class={`orb ${rec ? "live" : ""}`} onClick={() => (rec ? rec.stop() : start())} disabled={saving} aria-label={rec ? "Stop recording" : "Start recording"}>
          {rec ? <I.stop /> : <I.mic />}
        </button>
      </div>
      {rec ? (
        <>
          <div class="timer" aria-live="polite">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</div>
          <canvas ref={canvas} class="wave" style={{ color: "var(--rose)" }} aria-hidden="true" />
          <p class="muted small">Listening. Talk with her as usual. Tap to stop.</p>
        </>
      ) : (
        <div>
          <div class="h">{saving ? "Saving…" : visit.audio.length ? "Record more" : "Tap to record the visit"}</div>
          <p class="muted small" style={{ margin: "4px 0 0" }}>
            {visit.audio.length ? `${visit.audio.length} recording${visit.audio.length > 1 ? "s" : ""} · ${Math.floor(total / 60)}m ${total % 60}s, safe on this phone` : "Yorùbá, Pidgin or English. Works offline."}
          </p>
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

/** Danger signs seen or reported: one tap raises the alert instantly, offline. */
export function DangerTiles({ visit, profile }: Props) {
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
    <details class="glass">
      <summary><span style={{ color: "var(--rose)", width: "22px", height: "22px", display: "inline-flex" }}><I.alert /></span> Danger signs {on.size ? <span class="pill">{on.size} marked</span> : null}<span class="chev"><I.chev /></span></summary>
      <p class="muted small">Tap any sign you see or she reports. Takada alerts at once.</p>
      <div class="tiles">
        {CONCEPTS.filter((c) => c.danger_sign).map((c) => (
          <button key={c.id} class="tile" aria-pressed={on.has(c.id)} onClick={() => toggle(c.id)} title={c.definition}>{c.label_en}</button>
        ))}
      </div>
      <ErrorNote error={error} />
    </details>
  );
}

const FIELDS: { key: keyof Vitals; label: string; unit: string; step?: string }[] = [
  { key: "bp_systolic", label: "BP top", unit: "mmHg" },
  { key: "bp_diastolic", label: "BP bottom", unit: "mmHg" },
  { key: "temperature_c", label: "Temperature", unit: "°C", step: "0.1" },
  { key: "weight_kg", label: "Weight", unit: "kg", step: "0.1" },
  { key: "pulse", label: "Pulse", unit: "/min" },
];

export function VitalsForm({ visit, profile }: Props) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const v = visit.vitals;
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
    if (!Object.keys(payload).length) return setError("Enter at least one measurement");
    try {
      await append({ ...who(visit, profile), type: "vitals.set", payload });
      setVals({});
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      setError("A value is outside the possible range. Check it and try again.");
    }
  }
  const summary = [v.bp_systolic && `BP ${v.bp_systolic}/${v.bp_diastolic}`, v.temperature_c && `${v.temperature_c}°C`, v.weight_kg && `${v.weight_kg} kg`, v.pulse && `${v.pulse}/min`].filter(Boolean).join(" · ");
  return (
    <details class="glass">
      <summary><span style={{ color: "var(--sky)", width: "22px", height: "22px", display: "inline-flex" }}><I.pulse /></span> Measurements {summary ? <span class="faint small" style={{ fontWeight: 500 }}>{summary}</span> : null}<span class="chev"><I.chev /></span></summary>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
        {FIELDS.map((f) => (
          <label class="field" key={f.key}><span>{f.label} <span class="faint">{f.unit}</span></span>
            <input class="input" inputMode="decimal" type="number" step={f.step ?? "1"} placeholder={v[f.key] !== undefined ? String(v[f.key]) : ""} value={vals[f.key] ?? ""}
              onInput={(e) => setVals({ ...vals, [f.key]: (e.target as HTMLInputElement).value })} />
          </label>
        ))}
      </div>
      <button class={`btn block press ${saved ? "" : "primary"}`} style={{ marginTop: "12px" }} onClick={save}>{saved ? <><I.check /> Saved</> : "Save measurements"}</button>
      <ErrorNote error={error} />
    </details>
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
    <details class="glass" open={visit.notes.length > 0}>
      <summary><span style={{ color: "var(--amber)", width: "22px", height: "22px", display: "inline-flex" }}><I.note /></span> Notes {visit.notes.length ? <span class="pill">{visit.notes.length}</span> : null}<span class="chev"><I.chev /></span></summary>
      {visit.notes.map((n, i) => <p key={i} class="small muted" style={{ margin: "8px 0" }}>{n}</p>)}
      <label class="field" style={{ marginTop: "10px" }}><span class="sr-only">Add a note</span>
        <textarea class="input" aria-label="Notes" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Type, or use the keyboard's microphone…" />
      </label>
      <button class="btn block press" style={{ marginTop: "10px" }} onClick={add} disabled={!text.trim()}>Add note</button>
      <ErrorNote error={error} />
    </details>
  );
}
