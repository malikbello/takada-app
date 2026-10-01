import { useEffect, useState } from "preact/hooks";
import type { Visit } from "@takada/protocol";
import { getLink, jobStatus, requestDraft, type JobStatus } from "../lib/sync";
import { useLive } from "../lib/store";
import { I } from "./icons";
import { ErrorNote } from "./ui";

// Ask the hub (or cloud) to draft the record from the recordings and notes. Status is
// polled and shown; failures are explained, never hidden.
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
    <section class="glass stack">
      <div class="row">
        <span style={{ color: "var(--mint)", width: "22px", height: "22px", display: "inline-flex" }}><I.sparkle /></span>
        <div class="grow"><div class="h" style={{ fontSize: "16px" }}>AI draft of the record</div>
          <div class="muted small">{link ? "From the recordings and notes, by the N-ATLaS model at your clinic hub." : "Pair with your clinic hub in Settings to turn on AI drafting."}</div></div>
      </div>
      {link && (
        <button class="btn block press" onClick={draft} disabled={busy || (!visit.audio.length && !visit.notes.length)}>
          {busy ? (job?.status === "running" ? "Drafting…" : `In the queue${job?.ahead ? ` · ${job.ahead} ahead` : ""}`) : visit.draft ? "Draft again" : "Draft the record"}
        </button>
      )}
      {job?.status === "failed" && <ErrorNote error={`Drafting failed: ${job.error ?? "unknown error"}. Try again.`} />}
      {visit.draft && <p class="ok-note">Draft ready from {visit.draft.model}. Check it in Review before confirming.</p>}
      <ErrorNote error={error} />
    </section>
  );
}
