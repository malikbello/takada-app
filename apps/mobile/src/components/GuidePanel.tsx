import { useState } from "preact/hooks";
import { GUIDE } from "@takada/clinical";
import { guideOf, type Visit } from "@takada/protocol";

// The visit guide (ADR-0023 §5): follow-ups first, then what has not been asked yet,
// by group. Items come from the signed-off clinical bundle; nothing is generated.
export function GuidePanel({ visit }: { visit: Visit }) {
  const [showDone, setShowDone] = useState(false);
  const g = guideOf(visit);
  const byId = new Map(GUIDE.items.map((i) => [i.id, i]));
  const why = new Map(GUIDE.followUps.map((f) => [f.id, f.why]));
  const done = g.items.filter((i) => i.covered);
  const open = g.items.filter((i) => !i.covered);
  // Visit order is the order items appear in the guide (the bundle's object keys are sorted).
  const order = [...new Set(GUIDE.items.map((i) => i.group))];
  const groups = order
    .map((gid) => ({ title: GUIDE.groups[gid] ?? gid, items: open.filter((i) => byId.get(i.id)?.group === gid) }))
    .filter((x) => x.items.length);
  const pct = g.items.length ? Math.round((done.length / g.items.length) * 100) : 0;
  return (
    <div class="stack">
      <div class="card">
        <div class="row"><b class="grow">{done.length} of {g.items.length} covered</b><span class="muted small">{pct}%</span></div>
        <div class="progress" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      </div>
      {g.follow_ups.map((f) => (
        <div class="followup" key={f.id} role="status">
          <b>Follow up</b>: {why.get(f.id)}
          <ul class="small">{f.ask.map((a) => <li key={a}>{byId.get(a)?.ask}</li>)}</ul>
        </div>
      ))}
      {groups.map((grp) => (
        <div class="card" key={grp.title}>
          <h2>{grp.title}</h2>
          {grp.items.map((i) => (
            <div class="guide-item" key={i.id}><span class="tick" aria-hidden="true" /><span>{byId.get(i.id)?.ask}</span></div>
          ))}
        </div>
      ))}
      {open.length === 0 && <p class="pill ok">Everything for this visit has been covered.</p>}
      <button class="btn ghost" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
        {showDone ? "Hide" : "Show"} what's already covered ({done.length})
      </button>
      {showDone && (
        <div class="card">
          {done.map((i) => (
            <div class="guide-item" key={i.id}><span class="tick done" aria-hidden="true">✓</span><span class="muted">{byId.get(i.id)?.ask}</span></div>
          ))}
        </div>
      )}
      <p class="muted small">Draft guide, pending clinical sign-off. Questions come from the WHO antenatal guideline and the National Standing Orders.</p>
    </div>
  );
}
