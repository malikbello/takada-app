import { useEffect, useState } from "preact/hooks";
import type { Visit } from "@takada/protocol";
import { getLink, jobStatus, requestDraft, type JobStatus } from "../lib/sync";
import { useLive } from "../lib/store";
import { ErrorNote } from "./ui";

// Ask the hub (or cloud) to draft the record from the recording and notes. Status is
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
  if (!link) return <p class="muted small">Pair with the clinic hub (⚙ Settings) to draft the record from the recording.</p>;
  const busy = job?.status === "queued" || job?.status === "running";
  return (
    <div class="stack">
      <button class="btn primary" onClick={draft} disabled={busy || (!visit.audio.length && !visit.notes.length)}>
        {busy ? (job?.status === "running" ? "Drafting…" : `Queued${job?.ahead ? ` · ${job.ahead} ahead` : ""}`) : visit.draft ? "Draft again" : "Draft the record"}
      </button>
      {job?.status === "failed" && <ErrorNote error={`Drafting failed: ${job.error ?? "unknown error"}. Tap to try again.`} />}
      {visit.draft && <p class="pill ok">Draft ready from {visit.draft.model}. Review it before confirming.</p>}
      <ErrorNote error={error} />
    </div>
  );
}
