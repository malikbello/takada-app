import { m } from "motion/react";
import { useState } from "react";
import { flagsOf, reduce } from "@takada/protocol";
import { DangerTiles, Notes, Recorder, VitalsForm } from "../components/Capture";
import { DangerBanner } from "../components/DangerBanner";
import { DraftButton } from "../components/DraftButton";
import { NextQuestion } from "../components/GuidePanel";
import { I } from "../components/icons";
import { ErrorNote, Sheet, TopBar } from "../components/ui";
import { spring } from "../lib/motion";
import { go } from "../lib/nav";
import { useLive, visitEvents, type Profile } from "../lib/store";
import { referralNote, summary } from "../lib/summary";

export function VisitScreen({ id, profile }: { id: string; profile: Profile }) {
  const { data: events, error } = useLive(() => visitEvents(id), [id]);
  const [showSummary, setShowSummary] = useState(false);
  const visit = events ? reduce(events) : undefined;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;
  if (visit === undefined) return <main className="page" />;
  if (visit === null) return <main className="page stack"><ErrorNote error="This visit isn't on this phone." /><a className="btn" href="#/">Back</a></main>;
  const flags = flagsOf(visit);
  const sections = [
    <DangerBanner key="d" flags={flags} note={() => referralNote(visit, profile.facility, profile.worker)} />,
    <Recorder key="r" visit={visit} profile={profile} />,
    <NextQuestion key="q" visit={visit} profile={profile} />,
    <DangerTiles key="t" visit={visit} profile={profile} />,
    <VitalsForm key="v" visit={visit} profile={profile} />,
    <Notes key="n" visit={visit} profile={profile} />,
    <DraftButton key="a" visit={visit} />,
  ];
  return (
    <>
      <TopBar back="#/" title={<>{visit.patientRef}{visit.weeks !== null ? <span className="faint" style={{ fontWeight: 600 }}> · {visit.weeks} weeks</span> : null}</>}
        right={<span className={`pill ${visit.confirmed ? "sage" : "violet"}`}><span className="dot" />{visit.confirmed ? "Confirmed" : "In visit"}</span>} />
      <main className="page stack">
        {sections.map((s, i) => (
          <m.div key={s.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }}>{s}</m.div>
        ))}
      </main>
      <div className="dock"><div className="inner">
        <m.button className="btn" onClick={() => setShowSummary(true)} whileTap={{ scale: 0.96 }}>Summary</m.button>
        <m.button className="btn primary grow" onClick={() => go(`/review/${visit.id}`)} whileTap={{ scale: 0.97 }}>Review & confirm <I.arrow /></m.button>
      </div></div>
      <Sheet open={showSummary} title="Summary so far" onClose={() => setShowSummary(false)}>
        <SummaryBody s={summary(visit)} />
      </Sheet>
    </>
  );
}

function SummaryBody({ s }: { s: ReturnType<typeof summary> }) {
  return (
    <div className="stack">
      <section className="card tight"><div className="overline">Found</div>{s.found.length ? s.found.map((x) => <p key={x} style={{ margin: "6px 0" }}>{x}</p>) : <p className="faint" style={{ margin: "6px 0 0" }}>Nothing recorded yet.</p>}</section>
      {s.vitals && <section className="card tight"><div className="overline">Measurements</div><p style={{ margin: "6px 0 0" }}>{s.vitals}</p></section>}
      {s.followUps.length > 0 && <section className="followup"><div className="overline" style={{ color: "var(--honey)" }}>Follow up</div>{s.followUps.map((x) => <p key={x} style={{ margin: "6px 0" }}>{x}</p>)}</section>}
      <section className="card tight"><div className="overline" style={{ color: "var(--sage)" }}>Asked · {s.asked.length}</div>{s.asked.map((x) => <p key={x} className="small muted" style={{ margin: "6px 0" }}>✓ {x}</p>)}</section>
      <section className="card tight"><div className="overline" style={{ color: "var(--ink-2)" }}>Not asked yet · {s.notYet.length}</div>{s.notYet.map((x) => <p key={x} className="small" style={{ margin: "6px 0" }}>{x}</p>)}</section>
    </div>
  );
}
