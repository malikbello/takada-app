import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { GUIDE } from "@takada/clinical";
import { guideOf, nextQuestion, type Visit } from "@takada/protocol";
import { ease, spring } from "../lib/motion";
import { append, type Profile } from "../lib/store";
import { I } from "./icons";
import { ErrorNote, Ring, Sheet } from "./ui";

const byId = new Map(GUIDE.items.map((i) => [i.id, i]));

/** One question at a time: the most useful thing to ask next, one tap to mark it asked. */
export function NextQuestion({ visit, profile }: { visit: Visit; profile: Profile }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = guideOf(visit);
  const done = g.items.filter((i) => i.covered).length;
  const next = nextQuestion({ ...visit, asked: [...visit.asked, ...skipped] }) ?? nextQuestion(visit);
  const item = next ? byId.get(next.itemId) : undefined;

  async function mark(itemId: string, asked = true) {
    try {
      await append({ visitId: visit.id, deviceId: profile.deviceId, worker: profile.worker, type: "guide.marked", payload: { itemId, asked } });
      navigator.vibrate?.(12);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="card" style={{ background: next?.why ? "linear-gradient(180deg, #fff8ec, #fff)" : undefined }}>
      <div className="between">
        <div>
          <div className="overline" style={{ color: next?.why ? "var(--honey)" : undefined }}>{next?.why ? "Follow up" : "Ask next"}</div>
          <div className="faint tiny" style={{ marginTop: 2 }}>{item ? GUIDE.groups[item.group] : "Visit guide"}</div>
        </div>
        <Ring value={done} total={g.items.length} />
      </div>
      <AnimatePresence mode="wait">
        <m.div key={item?.id ?? "done"} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.28, ease }}>
          {item ? (
            <>
              <p className="q">{item.ask}</p>
              {next?.why && <div className="followup" style={{ marginBottom: 14 }}>{next.why}</div>}
              <div className="row">
                <m.button className="btn primary grow" whileTap={{ scale: 0.96 }} transition={spring} onClick={() => mark(item.id)}><I.check /> Asked</m.button>
                <m.button className="btn" whileTap={{ scale: 0.96 }} transition={spring} onClick={() => setSkipped((s) => [...s, item.id])}>Later</m.button>
              </div>
            </>
          ) : (
            <p className="q">Everything for this visit is covered. Ẹ ṣé!</p>
          )}
        </m.div>
      </AnimatePresence>
      <button className="link" onClick={() => setAll(true)}>See the whole guide · {g.items.length - done} left</button>
      <ErrorNote error={error} />
      <Sheet open={all} title="Visit guide" onClose={() => setAll(false)}>
        <FullGuide visit={visit} onToggle={mark} />
      </Sheet>
    </section>
  );
}

function FullGuide({ visit, onToggle }: { visit: Visit; onToggle: (id: string, on: boolean) => void }) {
  const g = guideOf(visit);
  const order = [...new Set(GUIDE.items.map((i) => i.group))];
  const covered = new Map(g.items.map((i) => [i.id, i.covered]));
  return (
    <div className="stack">
      {order.map((gid) => {
        const items = g.items.filter((i) => byId.get(i.id)?.group === gid);
        if (!items.length) return null;
        return (
          <div className="card tight" key={gid}>
            <div className="overline" style={{ marginBottom: 2 }}>{GUIDE.groups[gid]}</div>
            {items.map((i) => {
              const on = covered.get(i.id) ?? false;
              const byHand = visit.asked.includes(i.id);
              return (
                <button key={i.id} className="item" style={{ width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--line)", textAlign: "left", cursor: "pointer", color: "inherit" }}
                  onClick={() => (on && !byHand ? undefined : onToggle(i.id, !on))} aria-pressed={on}>
                  <m.span className={`check ${on ? "on" : ""}`} animate={{ scale: on ? [1, 1.25, 1] : 1 }} transition={{ duration: 0.3 }}>{on ? <I.check /> : null}</m.span>
                  <span className={on ? "faint" : undefined}>{byId.get(i.id)?.ask}{on && !byHand ? <span className="tiny"> · heard in the visit</span> : null}</span>
                </button>
              );
            })}
          </div>
        );
      })}
      <p className="faint tiny">Draft guide awaiting clinical sign-off. Questions come from the WHO antenatal guideline and Nigeria's National Standing Orders; Takada never invents them.</p>
    </div>
  );
}
