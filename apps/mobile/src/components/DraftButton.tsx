import { m } from "motion/react";
import { useEffect, useState } from "react";
import type { Visit } from "@takada/protocol";
import { useLive } from "../lib/store";
import { getLink, jobStatus, requestDraft, syncOnce, type JobStatus } from "../lib/sync";
import { I } from "./icons";
import { ErrorNote } from "./ui";

// Ask the hub (or cloud) to draft the record from recordings and notes. Status is polled
// and shown; failures are explained, never hidden.
export function DraftButton({ visit }: { visit: Visit }) {
  const { data: link } = useLive(getLink);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const j = await jobStatus(visit.id);
        if (!stop) setJob(j);
        if (j && (j.status === "queued" || j.status === "running") && !stop) setTimeout(poll, 4000);
        else if (j?.status === "done" && !stop) void syncOnce({ ifIdle: true }); // bring the draft in now
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    void poll();
    return () => void (stop = true);
  }, [visit.id, job?.id]);
  async function draft() {
    setError(null);
    try {
      setJob(await requestDraft(visit.id, visit.language));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const busy = job?.status === "queued" || job?.status === "running";
  return (
    <section className="card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span className="badge-ic" style={{ background: "var(--lavender)", color: "var(--plum)" }}><I.sparkle /></span>
        <div className="grow">
          <div className="h">AI draft of the record</div>
          <div className="muted small">{link ? "N-ATLaS turns the recording and notes into the record, at your clinic hub." : "Pair with your clinic hub in Settings to turn on AI drafting."}</div>
        </div>
      </div>
      {link && (
        <m.button className="btn soft block" style={{ marginTop: 14 }} onClick={draft} disabled={busy || (!visit.audio.length && !visit.notes.length)} whileTap={{ scale: 0.97 }}>
          {busy ? (job?.status === "running" ? "Drafting…" : `In the queue${job?.ahead ? ` · ${job.ahead} ahead` : ""}`) : visit.draft ? "Draft again" : "Draft the record"}
        </m.button>
      )}
      {job?.status === "failed" && <ErrorNote error={`Drafting failed: ${job.error ?? "unknown error"}. Try again.`} />}
      {visit.draft && (
        visit.draft.needsReview.length || !visit.findings.some((f) => f.origin === "model")
          ? <p className="err" style={{ marginTop: 12 }}>
              Draft ready, but check it closely: {visit.findings.some((f) => f.origin === "model") ? "" : "it found nothing to record. "}
              {visit.draft.needsReview.slice(0, 3).join(" · ")}
            </p>
          : <p className="ok-note" style={{ marginTop: 12 }}>Draft ready. Check it in Review before confirming.</p>
      )}
      <ErrorNote error={error} />
    </section>
  );
}
