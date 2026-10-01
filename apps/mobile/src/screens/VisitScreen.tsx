import { useState } from "preact/hooks";
import { flagsOf, reduce } from "@takada/protocol";
import { DangerTiles, Notes, Recorder, VitalsForm } from "../components/Capture";
import { DangerBanner } from "../components/DangerBanner";
import { DraftButton } from "../components/DraftButton";
import { NextQuestion } from "../components/GuidePanel";
import { I } from "../components/icons";
import { ErrorNote, Sheet, TopBar } from "../components/ui";
import { go } from "../lib/nav";
import { useLive, visitEvents, type Profile } from "../lib/store";
import { referralNote, summary } from "../lib/summary";

export function VisitScreen({ id, profile }: { id: string; profile: Profile }) {
  const { data: events, error } = useLive(() => visitEvents(id), [id]);
  const [showSummary, setShowSummary] = useState(false);
  const visit = events ? reduce(events) : undefined;
  if (error) return <main class="page"><ErrorNote error={error} /></main>;
  if (visit === undefined) return <main class="page" />;
  if (visit === null) return <main class="page stack"><ErrorNote error="This visit isn't on this phone." /><a class="btn" href="#/">Back</a></main>;
  const flags = flagsOf(visit);
  return (
    <>
      <TopBar back="#/" title={`${visit.patientRef}${visit.weeks !== null ? ` · ${visit.weeks} wk` : ""}`}
        right={visit.confirmed ? <span class="pill"><span class="dot ok" />Confirmed</span> : <span class="pill"><span class="dot warn" />Open</span>} />
      <main class="page stack">
        <DangerBanner flags={flags} note={() => referralNote(visit, profile.facility, profile.worker)} />
        <Recorder visit={visit} profile={profile} />
        <NextQuestion visit={visit} profile={profile} />
        <DangerTiles visit={visit} profile={profile} />
        <VitalsForm visit={visit} profile={profile} />
        <Notes visit={visit} profile={profile} />
        <DraftButton visit={visit} />
      </main>
      <div class="dock"><div class="inner">
        <button class="btn press" onClick={() => setShowSummary(true)}>Summary</button>
        <button class="btn primary grow press" onClick={() => go(`/review/${visit.id}`)}>Review & confirm <I.arrow /></button>
      </div></div>
      {showSummary && (
        <Sheet title="Summary so far" onClose={() => setShowSummary(false)}>
          <SummaryBody s={summary(visit)} />
        </Sheet>
      )}
    </>
  );
}

export function SummaryBody({ s }: { s: ReturnType<typeof summary> }) {
  return (
    <div class="stack">
      <section class="glass tight"><div class="eyebrow">Found</div>{s.found.length ? s.found.map((x) => <p key={x} style={{ margin: "6px 0" }}>{x}</p>) : <p class="faint">Nothing recorded yet.</p>}</section>
      {s.vitals && <section class="glass tight"><div class="eyebrow">Measurements</div><p style={{ margin: "6px 0 0" }}>{s.vitals}</p></section>}
      {s.followUps.length > 0 && <section class="glass tight"><div class="eyebrow" style={{ color: "var(--amber)" }}>Follow up</div>{s.followUps.map((x) => <p key={x} style={{ margin: "6px 0" }}>{x}</p>)}</section>}
      <section class="glass tight"><div class="eyebrow">Asked · {s.asked.length}</div>{s.asked.map((x) => <p key={x} class="small muted" style={{ margin: "6px 0" }}>✓ {x}</p>)}</section>
      <section class="glass tight"><div class="eyebrow" style={{ color: "var(--ink-2)" }}>Not asked yet · {s.notYet.length}</div>{s.notYet.map((x) => <p key={x} class="small" style={{ margin: "6px 0" }}>{x}</p>)}</section>
    </div>
  );
}
