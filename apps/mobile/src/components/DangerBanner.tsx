import { useState } from "preact/hooks";
import type { Flag } from "@takada/clinical";
import { Sheet } from "./ui";

export function DangerBanner({ flags, note }: { flags: Flag[]; note: () => string }) {
  const [open, setOpen] = useState(false);
  if (!flags.length) return null;
  const urgent = flags.some((f) => f.severity === "urgent_referral");
  return (
    <section class="alert stack" role="alert" aria-live="assertive">
      <div>
        <b>{urgent ? "Refer now" : "Refer for assessment"}</b>
        {flags.map((f) => (
          <div key={f.ruleId}>
            {f.message}
            <div class="src">{f.ruleId} · {f.sourceRef}{f.sourceSection ? `, ${f.sourceSection}` : ""}</div>
          </div>
        ))}
      </div>
      <button class="btn danger" onClick={() => setOpen(true)}>Referral note</button>
      {open && (
        <Sheet title="Referral note" onClose={() => setOpen(false)}>
          <pre style={{ whiteSpace: "pre-wrap", font: "inherit" }}>{note()}</pre>
          <button class="btn primary big" onClick={() => navigator.clipboard?.writeText(note()).catch(() => undefined)}>Copy</button>
          {"share" in navigator && (
            <button class="btn big" onClick={() => navigator.share({ title: "Referral", text: note() }).catch(() => undefined)}>Share (WhatsApp, SMS…)</button>
          )}
        </Sheet>
      )}
    </section>
  );
}
