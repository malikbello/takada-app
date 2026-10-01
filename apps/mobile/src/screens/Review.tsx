import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { flagsOf, recordHash, reduce } from "@takada/protocol";
import { DangerBanner } from "../components/DangerBanner";
import { I } from "../components/icons";
import { ErrorNote, HoldButton, Sheet, TopBar } from "../components/ui";
import { spring } from "../lib/motion";
import { go } from "../lib/nav";
import { append, useLive, visitEvents, type Profile } from "../lib/store";
import { label, referralNote, vitalsLine } from "../lib/summary";

const ASSERT: Record<string, string> = { present: "Present", absent: "Absent", possible: "Possible", historical: "Past pregnancy" };

export function Review({ id, profile }: { id: string; profile: Profile }) {
  const { data: events, error } = useLive(() => visitEvents(id), [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [amending, setAmending] = useState(false);
  const [reason, setReason] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const visit = events ? reduce(events) : undefined;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;
  if (!visit) return <main className="page">{visit === null ? <ErrorNote error="Visit not found." /> : null}</main>;
  const who = { visitId: visit.id, deviceId: profile.deviceId, worker: profile.worker };
  const confirmedEvent = events?.filter((e) => e.type === "record.confirmed").at(-1);

  async function remove(concept: string, assertion: "present" | "absent" | "possible" | "historical") {
    try {
      await append({ ...who, type: "finding.removed", payload: { concept, assertion } });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function confirm() {
    if (!visit) return;
    setBusy(true);
    try {
      await append({ ...who, type: "record.confirmed", payload: { recordHash: await recordHash(visit) } });
      setCelebrate(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function amend() {
    if (!confirmedEvent || reason.trim().length < 3) return setErr("Give a short reason for the change");
    try {
      await append({ ...who, type: "record.amended", payload: { amends: confirmedEvent.id, reason: reason.trim() } });
      setAmending(false);
      setReason("");
      go(`/visit/${visit!.id}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <>
      <TopBar back={`#/visit/${visit.id}`} title={`Review · ${visit.patientRef}`} />
      <main className="page stack">
        <AnimatePresence>
          {celebrate && (
            <m.section className="hero center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
              <m.div style={{ width: 72, height: 72, margin: "4px auto 10px", borderRadius: 24, background: "rgb(255 255 255 / .25)", display: "grid", placeItems: "center" }}
                initial={{ rotate: -20, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.1 }}>
                <span style={{ width: 36, height: 36, display: "grid" }}><I.check /></span>
              </m.div>
              <h2 className="title" style={{ color: "#fff", position: "relative" }}>Record confirmed</h2>
              <p style={{ margin: "6px 0 14px", opacity: 0.92, position: "relative" }}>Saved on this phone and queued to sync. Ẹ ṣé!</p>
              <a className="btn white block" href="#/" style={{ position: "relative" }}>Back to today</a>
            </m.section>
          )}
        </AnimatePresence>
        <DangerBanner flags={flagsOf(visit)} note={() => referralNote(visit, profile.facility, profile.worker)} />
        <section className="card">
          <div className="overline">Findings</div>
          {visit.findings.length === 0 && <p className="faint">No findings recorded.</p>}
          <AnimatePresence initial={false}>
            {visit.findings.map((f) => (
              <m.div className="item" key={`${f.concept}|${f.assertion}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }}>
                <div className="grow">
                  <b>{label(f.concept)}</b> <span className="muted">· {ASSERT[f.assertion]}</span>
                  {f.evidence && <div className="faint small">heard: “{f.evidence}”</div>}
                </div>
                <span className={`pill ${f.origin === "model" ? "honey" : "violet"}`}>{f.origin === "model" ? "AI draft" : "You"}</span>
                {!visit.confirmed && <button className="icon-btn" aria-label={`Remove ${label(f.concept)}`} onClick={() => remove(f.concept, f.assertion)}>✕</button>}
              </m.div>
            ))}
          </AnimatePresence>
        </section>
        <section className="card"><div className="overline">Measurements</div><p style={{ margin: "6px 0 0" }}>{vitalsLine(visit.vitals) || <span className="faint">None recorded.</span>}</p></section>
        {visit.draft?.needsReview.length ? (
          <section className="followup"><div className="overline" style={{ color: "var(--honey)" }}>Please check</div>{visit.draft.needsReview.map((x) => <p key={x} className="small">{x}</p>)}</section>
        ) : null}
        {visit.amendments.length > 0 && (
          <section className="card small"><div className="overline">Changes</div>{visit.amendments.map((a) => <p key={a.at}>{new Date(a.at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} · {a.by}: {a.reason}</p>)}</section>
        )}
        <ErrorNote error={err} />
      </main>
      <div className="dock"><div className="inner">
        {visit.confirmed ? (
          <m.button className="btn block xl" onClick={() => setAmending(true)} whileTap={{ scale: 0.97 }}>Correct this record</m.button>
        ) : (
          <HoldButton label="Hold to confirm" onDone={confirm} disabled={busy} />
        )}
      </div></div>
      <Sheet open={amending} title="Correct a confirmed record" onClose={() => setAmending(false)}>
        <p className="muted">The confirmed record is kept. Your correction is added with a reason and must be confirmed again.</p>
        <label className="field"><span>Reason</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button className="btn primary block xl" onClick={amend}>Reopen to correct</button>
      </Sheet>
    </>
  );
}
