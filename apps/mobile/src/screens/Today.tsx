import { m } from "motion/react";
import { useState, type FormEvent } from "react";
import { flagsOf } from "@takada/protocol";
import { I, Logo, Wordmark } from "../components/icons";
import { ErrorNote, Segmented, Sheet } from "../components/ui";
import { greeting } from "../lib/greet";
import { ease, spring } from "../lib/motion";
import { go } from "../lib/nav";
import { useOnline } from "../lib/online";
import { allVisits, append, pendingCount, useLive, type Profile } from "../lib/store";
import { useSyncState } from "../lib/sync";

export function Today({ profile }: { profile: Profile }) {
  const { data: visits, error } = useLive(allVisits);
  const { data: pending } = useLive(pendingCount);
  const online = useOnline();
  const sync = useSyncState();
  const [starting, setStarting] = useState(false);
  const g = greeting(profile.lang);
  const today = new Date().toDateString();
  const todays = (visits ?? []).filter((v) => new Date(v.startedAt).toDateString() === today);
  const open = (visits ?? []).filter((v) => !v.confirmed).length;
  const danger = todays.filter((v) => flagsOf(v).length).length;
  const status = sync.error ? ["danger", "Sync problem"] : !online ? ["honey", "Offline · safe"] : pending ? ["honey", `${pending} to sync`] : ["sage", "All synced"];

  return (
    <main className="page stack">
      <div className="between" style={{ paddingTop: 6 }}>
        <div className="row" style={{ gap: 8 }}><Logo size={32} /><Wordmark size={21} /></div>
        <div className="row" style={{ gap: 8 }}>
          <a href="#/settings" className={`pill ${status[0]}`} role="status"><span className="dot" />{status[1]}</a>
          <m.a href="#/settings" className="icon-btn" aria-label="Settings" whileTap={{ scale: 0.9 }}><I.gear /></m.a>
        </div>
      </div>

      <m.div style={{ padding: "20px 2px 4px" }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        {g.en && <p className="overline" style={{ margin: 0 }}>{g.en}</p>}
        <h1 className="display" lang={profile.lang} style={{ marginTop: 6 }}>{g.local},<br /><span className="brand-text">{profile.worker.split(" ")[0]}</span></h1>
        <p className="muted" style={{ margin: "8px 0 0", fontWeight: 500 }}>{profile.facility}</p>
      </m.div>

      <m.button className="hero" onClick={() => setStarting(true)} style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "block", font: "inherit" }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.08 }} whileTap={{ scale: 0.98 }}>
        <div className="row" style={{ gap: 16, position: "relative", zIndex: 1 }}>
          <span style={{ width: 58, height: 58, borderRadius: 20, background: "rgb(255 255 255 / .22)", display: "grid", placeItems: "center", flex: "none" }}>
            <span style={{ width: 28, height: 28, display: "grid" }}><I.plus /></span>
          </span>
          <span className="grow">
            <span style={{ display: "block", fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em" }}>Start a visit</span>
            <span style={{ display: "block", opacity: 0.92, fontSize: 14.5, fontWeight: 500 }}>Record · check danger signs · guided questions</span>
          </span>
          <span style={{ width: 24, height: 24, display: "grid" }}><I.arrow /></span>
        </div>
      </m.button>

      <div className="stats">
        {[[todays.length, "Visits today", undefined], [open, "To confirm", open ? "var(--honey)" : undefined], [danger, "Danger today", danger ? "var(--danger)" : undefined]].map(([n, l, c], i) => (
          <m.div className="stat" key={String(l)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.14 + i * 0.05 }}>
            <b style={{ color: c as string | undefined }}>{n as number}</b><span>{l as string}</span>
          </m.div>
        ))}
      </div>

      <ErrorNote error={error} />
      {visits && visits.length > 0 && <h2 className="h" style={{ marginTop: 22 }}>Recent visits</h2>}
      {visits?.length === 0 && (
        <m.div className="card cream center" style={{ marginTop: 8 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <div className="h">No visits yet</div>
          <p className="muted small" style={{ margin: "4px 0 0" }}>Your visits will appear here, safe on this phone.</p>
        </m.div>
      )}
      {visits?.map((v, i) => {
        const flags = flagsOf(v);
        return (
          <m.a key={v.id} href={`#/visit/${v.id}`} className="card tight row" style={{ textDecoration: "none", color: "inherit", gap: 14 }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 + Math.min(i, 8) * 0.04 }} whileTap={{ scale: 0.98 }}>
            <span className="avatar">{v.patientRef.slice(-3)}</span>
            <span className="grow">
              <b style={{ letterSpacing: "-0.01em" }}>{v.patientRef}</b>
              <span className="faint tiny" style={{ display: "block" }}>{new Date(v.startedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}{v.weeks !== null ? ` · ${v.weeks} weeks` : ""}</span>
            </span>
            {flags.length > 0 && <span className="pill danger"><span className="dot" />Danger</span>}
            <span className={`pill ${v.confirmed ? "sage" : "honey"}`}>{v.confirmed ? "Done" : "Open"}</span>
          </m.a>
        );
      })}
      <StartVisit profile={profile} open={starting} onClose={() => setStarting(false)} />
    </main>
  );
}

function StartVisit({ profile, open, onClose }: { profile: Profile; open: boolean; onClose: () => void }) {
  const [patientRef, setRef] = useState("");
  const [weeks, setWeeks] = useState("");
  const [first, setFirst] = useState<"yes" | "no" | "unknown">("unknown");
  const [language, setLanguage] = useState<"yo" | "pcm" | "en" | "auto">("auto");
  const [error, setError] = useState<string | null>(null);
  async function start(e: FormEvent) {
    e.preventDefault();
    if (!patientRef.trim()) return setError("Enter her ANC card number or initials");
    const w = weeks.trim() === "" ? null : Number(weeks);
    if (w !== null && (!Number.isFinite(w) || w < 0 || w > 45)) return setError("Weeks must be between 0 and 45");
    const visitId = crypto.randomUUID();
    try {
      await append({
        visitId, deviceId: profile.deviceId, worker: profile.worker, type: "visit.started",
        payload: { facility: profile.facility, patientRef: patientRef.trim(), language, firstContact: first === "unknown" ? null : first === "yes", weeks: w },
      });
      onClose();
      go(`/visit/${visitId}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Sheet open={open} title="New visit" onClose={onClose}>
      <form className="stack" onSubmit={start}>
        <label className="field"><span>ANC card number or initials</span>
          <input className="input" value={patientRef} onChange={(e) => setRef(e.target.value)} placeholder="e.g. ANC-042" />
        </label>
        <p className="faint tiny" style={{ margin: "-6px 0 0 6px" }}>Never her full name.</p>
        <label className="field"><span>Weeks pregnant, if known</span>
          <input className="input" type="number" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="e.g. 28" />
        </label>
        <div className="field"><span>First antenatal visit?</span>
          <Segmented id="first" label="First antenatal visit" value={first} onChange={setFirst} options={[["yes", "Yes"], ["no", "No"], ["unknown", "Not sure"]]} />
        </div>
        <div className="field"><span>Language</span>
          <Segmented id="lang" label="Language" value={language} onChange={setLanguage} options={[["auto", "Auto"], ["yo", "Yorùbá"], ["pcm", "Pidgin"], ["en", "English"]]} />
        </div>
        <ErrorNote error={error} />
        <m.button className="btn primary block xl" type="submit" whileTap={{ scale: 0.97 }}>Begin visit <I.arrow /></m.button>
      </form>
    </Sheet>
  );
}
