import { AnimatePresence, m } from "motion/react";
import { useState, type FormEvent } from "react";
import { I, Logo, type IconName } from "../components/icons";
import { ErrorNote } from "../components/ui";
import { ease, spring } from "../lib/motion";
import { go } from "../lib/nav";
import { saveProfile, type Profile } from "../lib/store";

const PROMISES: [IconName, string, string, string, string][] = [
  ["mic", "Talk as you always do", "Yorùbá, Pidgin or English. Takada writes the record.", "#fff1ec", "#d4573a"],
  ["heart", "Keep mother and baby safe", "Danger signs flagged at once, with the protocol behind them.", "#fdeef1", "#c2416c"],
  ["sparkle", "Never miss a question", "A gentle guide to what to ask next.", "#f2edfb", "#5b3aa5"],
];

// First launch. A calm arrival (the mark draws itself, the name settles), three promises,
// then two fields. Under a minute; nothing to remember.
export function Welcome({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [worker, setWorker] = useState("");
  const [facility, setFacility] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!worker.trim() || !facility.trim()) return setError("Please fill in both");
    setBusy(true);
    try {
      onDone(await saveProfile(worker.trim(), facility.trim()));
      go("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="blobs" aria-hidden="true"><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
      <AnimatePresence mode="wait">
        {step === 0 ? (
          <m.main key="hello" className="page" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
            exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3, ease }}>
            <div className="center">
              <div style={{ display: "grid", placeItems: "center" }}><Logo size={104} animate /></div>
              <h1 className="display" aria-label="takada" style={{ fontSize: 46, marginTop: 18 }}>
                {"takada".split("").map((ch, i) => (
                  <m.span key={i} style={{ display: "inline-block" }} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 1.45 + i * 0.05 }}>{ch}</m.span>
                ))}
              </h1>
              <m.p className="muted" style={{ fontSize: 18, maxWidth: "24ch", margin: "8px auto 0", fontWeight: 500 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.9, duration: 0.6 }}>
                Every visit written. <span className="brand-text" style={{ fontWeight: 750 }}>Every danger sign seen.</span>
              </m.p>
            </div>
            <div className="stack" style={{ marginTop: 30 }}>
              {PROMISES.map(([icon, t, d, bg, fg], i) => (
                <m.div className="card tight row" key={t} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 2.1 + i * 0.12 }}>
                  <span className="badge-ic" style={{ background: bg, color: fg, width: 44, height: 44, borderRadius: 14 }}>{I[icon]()}</span>
                  <div><div className="h" style={{ fontSize: 15.5 }}>{t}</div><div className="muted small">{d}</div></div>
                </m.div>
              ))}
            </div>
            <m.button className="btn primary block xl" style={{ marginTop: 24 }} onClick={() => setStep(1)}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 2.5 }} whileTap={{ scale: 0.97 }}>
              Get started <I.arrow />
            </m.button>
            <m.p className="faint tiny center" style={{ marginTop: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.7 }}>
              Records stay on this phone until they sync to your clinic.
            </m.p>
          </m.main>
        ) : (
          <m.main key="who" className="page" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center" }}
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.35, ease }}>
            <form className="stack" onSubmit={save}>
              <Logo size={56} />
              <div>
                <p className="overline" style={{ margin: "14px 0 6px" }}>Ẹ kú àbọ̀ · Welcome</p>
                <h1 className="title" style={{ fontSize: 28 }}>Who's caring for mothers today?</h1>
              </div>
              <label className="field"><span>Your name or staff ID</span>
                <input className="input" value={worker} onChange={(e) => setWorker(e.target.value)} autoComplete="name" autoFocus placeholder="e.g. Rahmat Adebayo" />
              </label>
              <label className="field"><span>Your facility</span>
                <input className="input" value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="Name or HFR code" />
              </label>
              <ErrorNote error={error} />
              <m.button className="btn primary block xl" type="submit" disabled={busy} whileTap={{ scale: 0.97 }}>{busy ? "One moment…" : <>Continue <I.arrow /></>}</m.button>
              <button className="link" type="button" onClick={() => setStep(0)} style={{ alignSelf: "center" }}>Back</button>
            </form>
          </m.main>
        )}
      </AnimatePresence>
    </>
  );
}
