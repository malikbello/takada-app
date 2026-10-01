import { useState } from "preact/hooks";
import { flagsOf } from "@takada/protocol";
import { ErrorNote, Sheet } from "../components/ui";
import { go } from "../lib/nav";
import { useOnline } from "../lib/online";
import { allVisits, append, pendingCount, useLive, type Profile } from "../lib/store";
import { useSyncState } from "../lib/sync";

export function Today({ profile }: { profile: Profile }) {
  const { data: visits, error } = useLive(allVisits);
  const { data: pending } = useLive(pendingCount);
  const online = useOnline();
  const sync = useSyncState();
  const [starting, setStarting] = useState(false);
  return (
    <>
      <header class="bar">
        <h1>Takada</h1>
        <a href="#/settings" class={`pill ${sync.error ? "danger" : online ? "ok" : "warn"}`} role="status" style={{ textDecoration: "none" }}>
          {sync.pushing ? "Syncing…" : online ? "Online" : "Offline"}{pending ? ` · ${pending} to sync` : ""}{sync.error ? " · sync problem" : ""}
        </a>
        <a href="#/settings" class="icon-btn" aria-label="Settings" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>⚙</a>
      </header>
      <main class="wrap stack">
        <p class="muted">{profile.worker} · {profile.facility}</p>
        <button class="btn primary big" onClick={() => setStarting(true)}>＋ Start visit</button>
        <ErrorNote error={error} />
        <h2 style={{ marginTop: "20px" }}>Visits</h2>
        {visits?.length === 0 && <p class="muted">No visits yet.</p>}
        {visits?.map((v) => {
          const flags = flagsOf(v);
          return (
            <a key={v.id} href={`#/visit/${v.id}`} class="card row" style={{ textDecoration: "none", color: "inherit" }}>
              <div class="grow">
                <b>{v.patientRef}</b>
                <div class="muted small">{new Date(v.startedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}{v.weeks !== null ? ` · ${v.weeks} wk` : ""}</div>
              </div>
              {flags.length > 0 && <span class="pill danger">Danger sign</span>}
              <span class={`pill ${v.confirmed ? "ok" : "warn"}`}>{v.confirmed ? "Confirmed" : "Open"}</span>
            </a>
          );
        })}
      </main>
      {starting && <StartVisit profile={profile} onClose={() => setStarting(false)} />}
    </>
  );
}

function StartVisit({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [patientRef, setRef] = useState("");
  const [weeks, setWeeks] = useState("");
  const [first, setFirst] = useState<"yes" | "no" | "unknown">("unknown");
  const [language, setLanguage] = useState<"yo" | "pcm" | "en" | "auto">("auto");
  const [error, setError] = useState<string | null>(null);
  async function start(e: Event) {
    e.preventDefault();
    if (!patientRef.trim()) return setError("Enter the ANC card number or initials");
    const w = weeks.trim() === "" ? null : Number(weeks);
    if (w !== null && (!Number.isFinite(w) || w < 0 || w > 45)) return setError("Weeks must be between 0 and 45");
    const visitId = crypto.randomUUID();
    try {
      await append({
        visitId, deviceId: profile.deviceId, worker: profile.worker, type: "visit.started",
        payload: { facility: profile.facility, patientRef: patientRef.trim(), language, firstContact: first === "unknown" ? null : first === "yes", weeks: w },
      });
      go(`/visit/${visitId}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Sheet title="New visit" onClose={onClose}>
      <form class="stack" onSubmit={start}>
        <label class="field"><span>ANC card number or initials (never the full name)</span><input class="input" value={patientRef} onInput={(e) => setRef((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Weeks pregnant (if known)</span><input class="input" type="number" inputMode="numeric" value={weeks} onInput={(e) => setWeeks((e.target as HTMLInputElement).value)} /></label>
        <fieldset class="field" style={{ border: 0, padding: 0 }}><span>First antenatal visit?</span>
          <div class="tabs" role="tablist">
            {(["yes", "no", "unknown"] as const).map((x) => (
              <button type="button" role="tab" key={x} aria-selected={first === x} onClick={() => setFirst(x)}>{x === "unknown" ? "Not sure" : x[0]!.toUpperCase() + x.slice(1)}</button>
            ))}
          </div>
        </fieldset>
        <label class="field"><span>Language</span>
          <select class="input" value={language} onChange={(e) => setLanguage((e.target as HTMLSelectElement).value as typeof language)}>
            <option value="auto">Detect</option><option value="yo">Yorùbá</option><option value="pcm">Pidgin</option><option value="en">English</option>
          </select>
        </label>
        <button class="btn primary big" type="submit">Start</button>
        <ErrorNote error={error} />
      </form>
    </Sheet>
  );
}
