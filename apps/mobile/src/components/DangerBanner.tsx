import { useEffect, useRef, useState } from "preact/hooks";
import type { Flag } from "@takada/clinical";
import { I } from "./icons";
import { Sheet } from "./ui";

export function DangerBanner({ flags, note }: { flags: Flag[]; note: () => string }) {
  const [open, setOpen] = useState(false);
  const seen = useRef(0);
  useEffect(() => {
    if (flags.length > seen.current) navigator.vibrate?.([80, 60, 80]); // a new danger sign: feel it too
    seen.current = flags.length;
  }, [flags.length]);
  if (!flags.length) return null;
  const urgent = flags.some((f) => f.severity === "urgent_referral");
  return (
    <section class="alert" role="alert" aria-live="assertive">
      <div class="row" style={{ gap: "8px" }}>
        <span style={{ width: "22px", height: "22px" }}><I.alert /></span>
        <b style={{ fontSize: "20px", letterSpacing: "-0.01em" }}>{urgent ? "Refer now" : "Refer for assessment"}</b>
      </div>
      {flags.map((f) => (
        <div key={f.ruleId}>
          <div class="msg">{f.message}</div>
          <div class="src">{f.ruleId} · {f.sourceRef}{f.sourceSection ? ` · ${f.sourceSection}` : ""}</div>
        </div>
      ))}
      <button class="btn press" onClick={() => setOpen(true)}><I.share /> Referral note</button>
      {open && (
        <Sheet title="Referral note" onClose={() => setOpen(false)}>
          <pre class="glass" style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>{note()}</pre>
          {"share" in navigator ? (
            <button class="btn primary block xl" onClick={() => navigator.share({ title: "Referral", text: note() }).catch(() => undefined)}><I.share /> Share (WhatsApp, SMS…)</button>
          ) : null}
          <button class="btn block" onClick={() => navigator.clipboard?.writeText(note()).catch(() => undefined)}>Copy</button>
        </Sheet>
      )}
    </section>
  );
}
