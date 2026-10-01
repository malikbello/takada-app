import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Flag } from "@takada/clinical";
import { spring } from "../lib/motion";
import { I } from "./icons";
import { Sheet } from "./ui";

// A danger sign is the one thing that must never be missed: solid crimson (used nowhere
// else in the app), a gentle shake when it appears, and a vibration.
export function DangerBanner({ flags, note }: { flags: Flag[]; note: () => string }) {
  const [open, setOpen] = useState(false);
  const seen = useRef(flags.length);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (flags.length > seen.current) {
      navigator.vibrate?.([80, 60, 80]);
      setPulse((p) => p + 1);
    }
    seen.current = flags.length;
  }, [flags.length]);
  const urgent = flags.some((f) => f.severity === "urgent_referral");
  return (
    <AnimatePresence>
      {flags.length > 0 && (
        <m.section className="alert" role="alert" aria-live="assertive" key="alert"
          initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1, x: pulse ? [0, -6, 6, -4, 4, 0] : 0 }}
          exit={{ opacity: 0, scale: 0.97 }} transition={{ ...spring, x: { duration: 0.45 } }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="badge-ic" style={{ background: "rgb(255 255 255 / .18)", color: "#fff", width: 36, height: 36, borderRadius: 12 }}><I.alert /></span>
            <b style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{urgent ? "Refer now" : "Refer for assessment"}</b>
          </div>
          {flags.map((f) => (
            <div key={f.ruleId}>
              <div className="msg">{f.message}</div>
              <div className="src">{f.ruleId} · {f.sourceRef}{f.sourceSection ? ` · ${f.sourceSection}` : ""}</div>
            </div>
          ))}
          <m.button className="btn white" style={{ marginTop: 14 }} whileTap={{ scale: 0.96 }} onClick={() => setOpen(true)}><I.share /> Referral note</m.button>
          <Sheet open={open} title="Referral note" onClose={() => setOpen(false)}>
            <pre className="card cream" style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0, fontSize: 15 }}>{note()}</pre>
            {"share" in navigator && (
              <button className="btn primary block xl" onClick={() => navigator.share({ title: "Referral", text: note() }).catch(() => undefined)}><I.share /> Share (WhatsApp, SMS…)</button>
            )}
            <button className="btn block" onClick={() => navigator.clipboard?.writeText(note()).catch(() => undefined)}>Copy text</button>
          </Sheet>
        </m.section>
      )}
    </AnimatePresence>
  );
}
