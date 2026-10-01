import { useState } from "preact/hooks";
import { GUIDE } from "@takada/clinical";
import { guideOf, nextQuestion, type Visit } from "@takada/protocol";
import { append, type Profile } from "../lib/store";
import { I } from "./icons";
import { ErrorNote, Ring, Sheet } from "./ui";

const byId = new Map(GUIDE.items.map((i) => [i.id, i]));

/** One question at a time: the most useful thing to ask next, with one tap to mark it. */
export function NextQuestion({ visit, profile }: { visit: Visit; profile: Profile }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = guideOf(visit);
  const done = g.items.filter((i) => i.covered).length;
  // Skipping moves a question to the back for now; it stays in the full list.
  const ordered = (() => {
    const q = nextQuestion({ ...visit, asked: [...visit.asked, ...skipped] });
    return q ?? nextQuestion(visit);
  })();
  const item = ordered ? byId.get(ordered.itemId) : undefined;

  async function mark(itemId: string, asked = true) {
    try {
      await append({ visitId: visit.id, deviceId: profile.deviceId, worker: profile.worker, type: "guide.marked", payload: { itemId, asked } });
      navigator.vibrate?.(12);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section class="glass next-q">
      <div class="between">
        <div>
          <div class="eyebrow">{ordered?.why ? "Follow up" : "Ask next"}</div>
          <div class="faint tiny">{item ? GUIDE.groups[item.group] : "Visit guide"}</div>
        </div>
        <Ring value={done} total={g.items.length} />
      </div>
      {item ? (
        <>
          <p class="q" key={item.id}>{item.ask}</p>
          {ordered?.why && <div class="why">{ordered.why}</div>}
          <div class="row">
            <button class="btn primary grow press" onClick={() => mark(item.id)}><I.check /> Asked</button>
            <button class="btn press" onClick={() => setSkipped((s) => [...s, item.id])}>Later</button>
          </div>
        </>
      ) : (
        <p class="q">Everything for this visit is covered. Well done.</p>
      )}
      <button class="link" onClick={() => setAll(true)}>See the whole guide ({g.items.length - done} left)</button>
      <ErrorNote error={error} />
      {all && (
        <Sheet title="Visit guide" onClose={() => setAll(false)}>
          <FullGuide visit={visit} onToggle={(id, on) => mark(id, on)} />
        </Sheet>
      )}
    </section>
  );
}

function FullGuide({ visit, onToggle }: { visit: Visit; onToggle: (id: string, on: boolean) => void }) {
  const g = guideOf(visit);
  const order = [...new Set(GUIDE.items.map((i) => i.group))];
  const status = new Map(g.items.map((i) => [i.id, i.covered]));
  return (
    <div class="stack">
      {order.map((gid) => {
        const items = g.items.filter((i) => byId.get(i.id)?.group === gid);
        if (!items.length) return null;
        return (
          <div class="glass tight" key={gid}>
            <div class="h" style={{ marginBottom: "4px" }}>{GUIDE.groups[gid]}</div>
            {items.map((i) => {
              const on = status.get(i.id) ?? false;
              const byHand = visit.asked.includes(i.id);
              return (
                <button key={i.id} class="item press" style={{ width: "100%", background: "none", border: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}
                  onClick={() => (on && !byHand ? undefined : onToggle(i.id, !on))} aria-pressed={on}>
                  <span class={`check ${on ? "on" : ""}`}>{on ? <I.check /> : null}</span>
                  <span class={on ? "faint" : undefined}>{byId.get(i.id)?.ask}{on && !byHand ? <span class="tiny faint"> · heard in the visit</span> : null}</span>
                </button>
              );
            })}
          </div>
        );
      })}
      <p class="faint tiny">Draft guide pending clinical sign-off. Questions come from the WHO antenatal guideline and the National Standing Orders; Takada never invents them.</p>
    </div>
  );
}
