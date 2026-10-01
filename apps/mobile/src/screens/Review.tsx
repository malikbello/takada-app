import { useState } from "preact/hooks";
import { flagsOf, recordHash, reduce } from "@takada/protocol";
import { DangerBanner } from "../components/DangerBanner";
import { I } from "../components/icons";
import { ErrorNote, HoldButton, Sheet, TopBar } from "../components/ui";
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
  const [justConfirmed, setJustConfirmed] = useState(false);
  const visit = events ? reduce(events) : undefined;
  if (error) return <main class="page"><ErrorNote error={error} /></main>;
  if (!visit) return <main class="page">{visit === null ? <ErrorNote error="Visit not found." /> : null}</main>;
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
      setJustConfirmed(true);
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
      <main class="page stack">
        {justConfirmed && (
          <section class="glass center stack fade-up" style={{ boxShadow: "var(--glow)" }}>
            <div style={{ display: "grid", placeItems: "center" }}><span class="orb" style={{ width: "72px", height: "72px" }}><span style={{ width: "34px", height: "34px", display: "inline-flex" }}><I.check /></span></span></div>
            <h2 class="title">Record confirmed</h2>
            <p class="muted small">Saved on this phone and queued to sync. Ẹ ṣé!</p>
            <a class="btn primary block press" href="#/">Back to today</a>
          </section>
        )}
        <DangerBanner flags={flagsOf(visit)} note={() => referralNote(visit, profile.facility, profile.worker)} />
        <section class="glass">
          <div class="eyebrow">Findings</div>
          {visit.findings.length === 0 && <p class="faint">No findings recorded.</p>}
          {visit.findings.map((f) => (
            <div class="item" key={`${f.concept}|${f.assertion}`}>
              <div class="grow">
                <b>{label(f.concept)}</b> <span class="muted">· {ASSERT[f.assertion]}</span>
                {f.evidence && <div class="faint small">heard: “{f.evidence}”</div>}
              </div>
              <span class="pill" style={{ color: f.origin === "model" ? "var(--amber)" : "var(--mint)" }}>{f.origin === "model" ? "AI draft" : "You"}</span>
              {!visit.confirmed && <button class="icon-btn press" aria-label={`Remove ${label(f.concept)}`} onClick={() => remove(f.concept, f.assertion)}>✕</button>}
            </div>
          ))}
        </section>
        <section class="glass"><div class="eyebrow">Measurements</div><p style={{ margin: "6px 0 0" }}>{vitalsLine(visit.vitals) || <span class="faint">None recorded.</span>}</p></section>
        {visit.draft?.needsReview.length ? (
          <section class="glass"><div class="eyebrow" style={{ color: "var(--amber)" }}>Please check</div>{visit.draft.needsReview.map((x) => <p key={x} class="small">{x}</p>)}</section>
        ) : null}
        {visit.amendments.length > 0 && (
          <section class="glass small"><div class="eyebrow">Changes</div>{visit.amendments.map((a) => <p key={a.at}>{new Date(a.at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} · {a.by}: {a.reason}</p>)}</section>
        )}
        <ErrorNote error={err} />
      </main>
      <div class="dock"><div class="inner">
        {visit.confirmed ? (
          <button class="btn block xl press" onClick={() => setAmending(true)}>Correct this record</button>
        ) : (
          <HoldButton label="Hold to confirm" onDone={confirm} disabled={busy} />
        )}
      </div></div>
      {amending && (
        <Sheet title="Correct a confirmed record" onClose={() => setAmending(false)}>
          <p class="muted">The confirmed record is kept. Your correction is added with a reason and must be confirmed again.</p>
          <label class="field"><span>Reason</span><input class="input" value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} autoFocus /></label>
          <button class="btn primary block xl press" onClick={amend}>Reopen to correct</button>
        </Sheet>
      )}
    </>
  );
}
