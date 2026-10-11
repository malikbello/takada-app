import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Visit } from "@takada/protocol";
import { useLive } from "../lib/store";
import { jobMessage } from "../lib/errors";
import { draftedAudio, getLink, hasUndraftedAudio, jobStatus, requestDraft, syncOnce, type JobStatus } from "../lib/sync";
import { I } from "./icons";
import { ErrorNote } from "./ui";

// Ask the hub (or cloud) to draft the record from recordings and notes. Status is polled
// and shown; failures are explained, never hidden.
export function DraftButton({ visit }: { visit: Visit }) {
  const { data: link } = useLive(getLink);
  const { data: drafted } = useLive(() => draftedAudio(visit.id), [visit.id]);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A saved recording is drafted by itself, once per set of recordings: a failure is shown
  // and the button stays for a retry, instead of asking the hub again and again.
  const tried = useRef("");
  const audioKey = visit.audio.map((a) => a.blobId).join(",");
  const auto = !!link && drafted !== undefined && hasUndraftedAudio(visit, drafted);
  useEffect(() => {
    if (!auto || job?.status === "queued" || job?.status === "running" || tried.current === audioKey) return;
    tried.current = audioKey;
    void draft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, audioKey, job?.status]);
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
          <div className="muted small">{link ? "N-ATLaS turns the recording and notes into the record, at your clinic hub. It starts by itself when you stop recording; carry on with the visit meanwhile." : "Pair with your clinic hub in Settings to turn on AI drafting."}</div>
        </div>
      </div>
      {link && (
        <m.button className="btn soft block" style={{ marginTop: 14 }} onClick={draft} disabled={busy || (!visit.audio.length && !visit.notes.length)} whileTap={{ scale: 0.97 }}>
          {busy ? (job?.status === "running" ? "Drafting…" : `In the queue${job?.ahead ? ` · ${job.ahead} ahead` : ""}`) : visit.draft ? "Draft again" : "Draft the record"}
        </m.button>
      )}
      {job?.status === "failed" && (() => {
        const { message, detail } = jobMessage(job.error);
        return <>
          <ErrorNote error={message} />
          {detail && <p className="faint tiny" style={{ margin: "6px 2px 0" }}>For your supervisor: {detail}</p>}
        </>;
      })()}
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
