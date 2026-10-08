import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CONCEPTS } from "@takada/clinical";
import type { Visit, Vitals } from "@takada/protocol";
import { ease, spring } from "../lib/motion";
import { append, type Profile } from "../lib/store";
import { finishRecording, openRecording, saveChunk } from "../lib/recordings";
import { I } from "./icons";
import { Disclosure, ErrorNote } from "./ui";

type Props = { visit: Visit; profile: Profile };
// One recording is capped so converting it never runs a low-memory phone out of memory; the
// nurse taps once to carry on, and the visit's recordings are drafted together.
const MAX_SECONDS = 20 * 60;
const who = (v: Visit, p: Profile) => ({ visitId: v.id, deviceId: p.deviceId, worker: p.worker });

/** The record orb. Audio stays on the phone (as 16 kHz WAV) until the hub or cloud drafts it. */
export function Recorder({ visit, profile }: Props) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [noSound, setNoSound] = useState(false);
  const lastSound = useRef(0);
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
      an.getByteTimeDomainData(data);
      // Any sound at all (a quiet room still moves the signal); a covered or broken
      // microphone gives a flat line, and the nurse is told while there is time to fix it.
      let peak = 0;
      for (const x of data) peak = Math.max(peak, Math.abs(x - 128));
      if (peak >= 2) lastSound.current = Date.now();
      const c = canvas.current;
      if (c) {
        const g = c.getContext("2d")!;
        const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio);
        g.clearRect(0, 0, w, h);
        const bars = 40, bw = w / bars;
        const grad = g.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "#FFB199");
        grad.addColorStop(0.5, "#F07AA0");
        grad.addColorStop(1, "#7B4CC2");
        g.fillStyle = grad;
        for (let i = 0; i < bars; i++) {
          const v = Math.abs((data[Math.floor((i / bars) * data.length)] ?? 128) - 128) / 128;
          const bh = Math.max(4 * devicePixelRatio, v * h * 2.2);
          g.beginPath();
          g.roundRect(i * bw + bw * 0.28, (h - bh) / 2, bw * 0.44, bh, bw * 0.22);
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
    setCapped(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      // Every chunk goes to the phone's storage as it arrives (lib/recordings.ts).
      const recId = await openRecording({ visitId: visit.id, deviceId: profile.deviceId, worker: profile.worker, mime: mr.mimeType || "audio/webm" });
      let seq = 0;
      let saved = Promise.resolve();
      const stopWave = drawWave(stream);
      // Keep the screen on while recording: when it turns off, the phone may pause the app
      // and the rest of the visit would not be recorded.
      let lock: WakeLockSentinel | null = await navigator.wakeLock?.request("screen").catch(() => null) ?? null;
      const relock = async () => {
        if (document.visibilityState === "visible" && mr.state === "recording") lock = await navigator.wakeLock?.request("screen").catch(() => null) ?? null;
      };
      document.addEventListener("visibilitychange", relock);
      lastSound.current = Date.now();
      setNoSound(false);
      const timer = window.setInterval(() => {
        const s = Math.round((Date.now() - t0.current) / 1000);
        setSecs(s);
        setNoSound(Date.now() - lastSound.current > 5000);
        if (s >= MAX_SECONDS && mr.state === "recording") {
          setCapped(true);
          mr.stop();
        }
      }, 250);
      mr.ondataavailable = (e) => {
        if (!e.data.size) return;
        const n = seq++;
        saved = saved.then(() => saveChunk(recId, n, e.data)).catch((err: Error) => setError(`Recording could not be saved on this phone: ${err.message}`));
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer);
        setNoSound(false);
        document.removeEventListener("visibilitychange", relock);
        void lock?.release().catch(() => undefined);
        stopWave();
        setRec(null);
        setSaving(true);
        try {
          await saved; // the last chunk arrives just before onstop
          await finishRecording(recId);
        } catch (e) {
          setError(`The recording could not be converted: ${(e as Error).message}. It is kept on this phone; reopen the app to try again.`);
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
    <section className="card center" style={{ background: "var(--brand-soft)", borderColor: "transparent", paddingTop: 26 }}>
      <div style={{ display: "grid", placeItems: "center" }}>
        <m.button className={`orb ${rec ? "live" : ""}`} onClick={() => (rec ? rec.stop() : start())} disabled={saving}
          aria-label={rec ? "Stop recording" : "Start recording"} whileTap={{ scale: 0.92 }} layout transition={spring}>
          <span className="halo" aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            <m.span key={rec ? "stop" : "mic"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring} style={{ display: "grid" }}>
              {rec ? <I.stop /> : <I.mic />}
            </m.span>
          </AnimatePresence>
        </m.button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {rec ? (
          <m.div key="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }} style={{ marginTop: 16 }}>
            <div className="timer" aria-live="polite">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</div>
            <canvas ref={canvas} className="wave" aria-hidden="true" />
            {noSound
              ? <p className="err" role="alert" style={{ margin: "6px 0 0" }}>No sound is reaching the microphone. Check that nothing covers it, or stop and type notes.</p>
              : <p className="muted small" style={{ margin: "6px 0 0" }}>Listening. Talk with her as usual.</p>}
          </m.div>
        ) : (
          <m.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }} style={{ marginTop: 18 }}>
            <div className="h" style={{ fontSize: 19 }}>{saving ? "Saving…" : visit.audio.length ? "Record more" : "Tap to record the visit"}</div>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {visit.audio.length ? `${visit.audio.length} recording${visit.audio.length > 1 ? "s" : ""} · ${Math.floor(total / 60)}m ${total % 60}s, safe on this phone` : "Yorùbá, Pidgin or English · works offline"}
            </p>
          </m.div>
        )}
      </AnimatePresence>
      {capped && <p className="err" style={{ marginTop: 10 }}>The recording reached 20 minutes and was saved. Tap to keep recording.</p>}
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
    <Disclosure icon={<I.alert />} tint={["var(--danger-bg)", "var(--danger)"]} title="Danger signs" meta={on.size ? `${on.size} marked` : "Tap any she has"}>
      <div className="tiles">
        {CONCEPTS.filter((c) => c.danger_sign).map((c, i) => (
          <m.button key={c.id} className="tile" aria-pressed={on.has(c.id)} onClick={() => toggle(c.id)} title={c.definition}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025, duration: 0.3, ease }} whileTap={{ scale: 0.95 }}>
            {c.label_en}
          </m.button>
        ))}
      </div>
      <ErrorNote error={error} />
    </Disclosure>
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
    <Disclosure icon={<I.pulse />} tint={["#e8f3fb", "#1f6f9f"]} title="Measurements" meta={summary || "BP, temperature, weight"}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {FIELDS.map((f) => (
          <label className="field" key={f.key}><span>{f.label} <span className="faint">{f.unit}</span></span>
            <input className="input" inputMode="decimal" type="number" step={f.step ?? "1"} placeholder={v[f.key] !== undefined ? String(v[f.key]) : ""} value={vals[f.key] ?? ""}
              onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
          </label>
        ))}
      </div>
      <m.button className={`btn block ${saved ? "soft" : "primary"}`} style={{ marginTop: 12 }} onClick={save} whileTap={{ scale: 0.97 }}>
        {saved ? <><I.check /> Saved</> : "Save measurements"}
      </m.button>
      <ErrorNote error={error} />
    </Disclosure>
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
    <Disclosure icon={<I.note />} tint={["var(--honey-bg)", "var(--honey)"]} title="Notes" meta={visit.notes.length ? `${visit.notes.length} note${visit.notes.length > 1 ? "s" : ""}` : "Type or dictate"} defaultOpen={visit.notes.length > 0}>
      <AnimatePresence initial={false}>
        {visit.notes.map((n, i) => (
          <m.p key={i} className="small" style={{ margin: "0 0 10px", padding: "10px 12px", background: "var(--cream)", borderRadius: 12 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{n}</m.p>
        ))}
      </AnimatePresence>
      <label className="field"><span className="sr-only">Add a note</span>
        <textarea className="input" aria-label="Notes" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type, or use the keyboard's microphone…" />
      </label>
      <m.button className="btn soft block" style={{ marginTop: 10 }} onClick={add} disabled={!text.trim()} whileTap={{ scale: 0.97 }}>Add note</m.button>
      <ErrorNote error={error} />
    </Disclosure>
  );
}
