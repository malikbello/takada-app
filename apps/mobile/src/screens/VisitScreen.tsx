import { useState } from "preact/hooks";
import { flagsOf, reduce } from "@takada/protocol";
import { DangerChips, Notes, Recorder, VitalsForm } from "../components/Capture";
import { DangerBanner } from "../components/DangerBanner";
import { DraftButton } from "../components/DraftButton";
import { GuidePanel } from "../components/GuidePanel";
import { ErrorNote, Sheet } from "../components/ui";
import { go } from "../lib/nav";
import { useLive, visitEvents, type Profile } from "../lib/store";
import { referralNote, summary } from "../lib/summary";

export function VisitScreen({ id, profile }: { id: string; profile: Profile }) {
  const { data: events, error } = useLive(() => visitEvents(id), [id]);
  const [tab, setTab] = useState<"record" | "guide">("record");
  const [showSummary, setShowSummary] = useState(false);
  const visit = events ? reduce(events) : undefined;
  if (error) return <main class="wrap"><ErrorNote error={error} /></main>;
  if (visit === undefined) return <main class="wrap muted">Loading…</main>;
  if (visit === null) return <main class="wrap"><ErrorNote error="This visit was not found on this phone." /><a class="btn" href="#/">Back</a></main>;
  const flags = flagsOf(visit);
  const g = summary(visit);
  return (
    <>
      <header class="bar">
        <button class="icon-btn" onClick={() => go("/")} aria-label="Back to today">←</button>
        <h1>{visit.patientRef}{visit.weeks !== null ? ` · ${visit.weeks} wk` : ""}</h1>
        {visit.confirmed && <span class="pill ok">Confirmed</span>}
      </header>
      <main class="wrap stack">
        <DangerBanner flags={flags} note={() => referralNote(visit, profile.facility, profile.worker)} />
        <div class="tabs" role="tablist" aria-label="Visit sections">
          <button role="tab" aria-selected={tab === "record"} onClick={() => setTab("record")}>Record</button>
          <button role="tab" aria-selected={tab === "guide"} onClick={() => setTab("guide")}>Guide · {g.notYet.length} to ask</button>
        </div>
        {tab === "record" ? (
          <>
            <Recorder visit={visit} profile={profile} />
            <DraftButton visit={visit} />
            <DangerChips visit={visit} profile={profile} />
            <VitalsForm visit={visit} profile={profile} />
            <Notes visit={visit} profile={profile} />
          </>
        ) : (
          <GuidePanel visit={visit} />
        )}
      </main>
      <div class="dock"><div class="inner">
        <button class="btn grow" onClick={() => setShowSummary(true)}>Summary so far</button>
        <button class="btn primary grow" onClick={() => go(`/review/${visit.id}`)}>Review & confirm →</button>
      </div></div>
      {showSummary && (
        <Sheet title="Summary so far" onClose={() => setShowSummary(false)}>
          <SummaryBody s={g} />
        </Sheet>
      )}
    </>
  );
}

export function SummaryBody({ s }: { s: ReturnType<typeof summary> }) {
  return (
    <div class="stack">
      <section><h2>Found</h2>{s.found.length ? <ul>{s.found.map((x) => <li key={x}>{x}</li>)}</ul> : <p class="muted">Nothing recorded yet.</p>}</section>
      {s.vitals && <section><h2>Measurements</h2><p>{s.vitals}</p></section>}
      {s.followUps.length > 0 && <section class="followup"><h2>Follow up</h2><ul>{s.followUps.map((x) => <li key={x}>{x}</li>)}</ul></section>}
      <section><h2>Asked ({s.asked.length})</h2><ul class="small">{s.asked.map((x) => <li key={x}>{x}</li>)}</ul></section>
      <section><h2>Not asked yet ({s.notYet.length})</h2><ul class="small">{s.notYet.map((x) => <li key={x}>{x}</li>)}</ul></section>
    </div>
  );
}
