import { useState } from "preact/hooks";
import { flagsOf, recordHash, reduce } from "@takada/protocol";
import { DangerBanner } from "../components/DangerBanner";
import { ErrorNote, HoldButton, Sheet } from "../components/ui";
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
  const visit = events ? reduce(events) : undefined;
  if (error) return <main class="wrap"><ErrorNote error={error} /></main>;
  if (!visit) return <main class="wrap muted">{visit === null ? "Visit not found." : "Loading…"}</main>;
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
      <header class="bar">
        <button class="icon-btn" onClick={() => go(`/visit/${visit.id}`)} aria-label="Back to visit">←</button>
        <h1>Review · {visit.patientRef}</h1>
      </header>
      <main class="wrap stack">
        <DangerBanner flags={flagsOf(visit)} note={() => referralNote(visit, profile.facility, profile.worker)} />
        <section class="card stack">
          <h2>Findings</h2>
          {visit.findings.length === 0 && <p class="muted">No findings recorded.</p>}
          {visit.findings.map((f) => (
            <div class="row" key={`${f.concept}|${f.assertion}`}>
              <div class="grow">
                <b>{label(f.concept)}</b> · {ASSERT[f.assertion]}
                {f.evidence && <div class="muted small">heard: “{f.evidence}”</div>}
              </div>
              <span class={`pill ${f.origin === "model" ? "warn" : ""}`}>{f.origin === "model" ? "AI draft" : "You"}</span>
              {!visit.confirmed && <button class="icon-btn" aria-label={`Remove ${label(f.concept)}`} onClick={() => remove(f.concept, f.assertion)}>✕</button>}
            </div>
          ))}
        </section>
        <section class="card"><h2>Measurements</h2><p>{vitalsLine(visit.vitals) || <span class="muted">None recorded.</span>}</p></section>
        {visit.draft?.needsReview.length ? (
          <section class="card followup"><h2>Check these</h2><ul>{visit.draft.needsReview.map((x) => <li key={x}>{x}</li>)}</ul></section>
        ) : null}
        {visit.amendments.length > 0 && (
          <section class="card small"><h2>Changes</h2>{visit.amendments.map((a) => <p key={a.at}>{new Date(a.at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} · {a.by}: {a.reason}</p>)}</section>
        )}
        <ErrorNote error={err} />
      </main>
      <div class="dock"><div class="inner">
        {visit.confirmed ? (
          <button class="btn big" onClick={() => setAmending(true)}>Correct this record</button>
        ) : (
          <HoldButton label="Hold to confirm record" onDone={confirm} disabled={busy} />
        )}
      </div></div>
      {amending && (
        <Sheet title="Correct a confirmed record" onClose={() => setAmending(false)}>
          <p class="muted">The confirmed record is kept. Your correction is added with a reason and must be confirmed again.</p>
          <label class="field"><span>Reason</span><input class="input" value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} /></label>
          <button class="btn primary big" onClick={amend}>Reopen to correct</button>
        </Sheet>
      )}
    </>
  );
}
