import { useState } from "preact/hooks";
import { flagsOf } from "@takada/protocol";
import { I, Logo } from "../components/icons";
import { ErrorNote, Sheet } from "../components/ui";
import { greeting } from "../lib/greet";
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
  const g = greeting();
  const today = new Date().toDateString();
  const todays = (visits ?? []).filter((v) => new Date(v.startedAt).toDateString() === today);
  const open = (visits ?? []).filter((v) => !v.confirmed).length;
  const danger = todays.filter((v) => flagsOf(v).length).length;
  const status = sync.error ? { dot: "bad", text: "Sync problem" } : !online ? { dot: "warn", text: "Offline · safe" } : pending ? { dot: "warn", text: `${pending} to sync` } : { dot: "ok", text: "All synced" };

  return (
    <main class="page stack">
      <div class="between" style={{ paddingTop: "8px" }}>
        <div class="row"><Logo size={34} /><span class="h">Takada</span></div>
        <div class="row">
          <a href="#/settings" class="pill press" role="status"><span class={`dot ${status.dot}`} />{status.text}</a>
          <a href="#/settings" class="icon-btn press" aria-label="Settings"><I.gear /></a>
        </div>
      </div>

      <div style={{ padding: "18px 2px 6px" }}>
        <p class="eyebrow">{g.yo}</p>
        <h1 class="display">{g.en},<br /><span class="gradient-text">{profile.worker.split(" ")[0]}</span></h1>
        <p class="muted" style={{ margin: "8px 0 0" }}>{profile.facility}</p>
      </div>

      <button class="glass press" onClick={() => setStarting(true)} style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: "16px", color: "inherit", boxShadow: "var(--glow)" }}>
        <span class="orb" style={{ width: "64px", height: "64px", flex: "none" }} aria-hidden="true"><span style={{ width: "28px", height: "28px", display: "inline-flex" }}><I.plus /></span></span>
        <span class="grow"><span class="title" style={{ fontSize: "22px", display: "block" }}>Start a visit</span><span class="muted small">Record, check danger signs, guide the questions</span></span>
        <span style={{ width: "24px", height: "24px", display: "inline-flex", color: "var(--mint)" }}><I.arrow /></span>
      </button>

      <div class="stats">
        <div class="stat"><b>{todays.length}</b><span class="muted tiny">Visits today</span></div>
        <div class="stat"><b style={{ color: open ? "var(--amber)" : undefined }}>{open}</b><span class="muted tiny">To confirm</span></div>
        <div class="stat"><b style={{ color: danger ? "var(--rose)" : undefined }}>{danger}</b><span class="muted tiny">Danger today</span></div>
      </div>

      <ErrorNote error={error} />
      {visits && visits.length > 0 && <h2 class="h" style={{ marginTop: "22px" }}>Recent visits</h2>}
      {visits?.length === 0 && <p class="faint center" style={{ marginTop: "28px" }}>Your visits will appear here.</p>}
      {visits?.map((v, i) => {
        const flags = flagsOf(v);
        return (
          <a key={v.id} href={`#/visit/${v.id}`} class="glass tight visit-card press fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <span class="avatar">{v.patientRef.slice(-3)}</span>
            <span class="grow">
              <b>{v.patientRef}</b>
              <span class="faint tiny" style={{ display: "block" }}>{new Date(v.startedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}{v.weeks !== null ? ` · ${v.weeks} weeks` : ""}</span>
            </span>
            {flags.length > 0 && <span class="pill" style={{ color: "var(--rose)" }}><span class="dot bad" />Danger</span>}
            <span class="pill"><span class={`dot ${v.confirmed ? "ok" : "warn"}`} />{v.confirmed ? "Done" : "Open"}</span>
          </a>
        );
      })}
      {starting && <StartVisit profile={profile} onClose={() => setStarting(false)} />}
    </main>
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
    if (!patientRef.trim()) return setError("Enter her ANC card number or initials");
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
        <label class="field"><span>ANC card number or initials</span><input class="input" value={patientRef} onInput={(e) => setRef((e.target as HTMLInputElement).value)} autoFocus /></label>
        <p class="faint tiny" style={{ margin: "-6px 0 0 4px" }}>Never her full name: records only use a card number.</p>
        <label class="field"><span>Weeks pregnant (if known)</span><input class="input" type="number" inputMode="numeric" value={weeks} onInput={(e) => setWeeks((e.target as HTMLInputElement).value)} /></label>
        <div class="field"><span>First antenatal visit?</span>
          <div class="seg" role="group" aria-label="First antenatal visit">
            {(["yes", "no", "unknown"] as const).map((x) => (
              <button type="button" key={x} aria-pressed={first === x} onClick={() => setFirst(x)}>{x === "unknown" ? "Not sure" : x === "yes" ? "Yes" : "No"}</button>
            ))}
          </div>
        </div>
        <div class="field"><span>Language</span>
          <div class="seg" role="group" aria-label="Language">
            {([["auto", "Auto"], ["yo", "Yorùbá"], ["pcm", "Pidgin"], ["en", "English"]] as const).map(([k, l]) => (
              <button type="button" key={k} aria-pressed={language === k} onClick={() => setLanguage(k)}>{l}</button>
            ))}
          </div>
        </div>
        <ErrorNote error={error} />
        <button class="btn primary block xl press" type="submit">Begin visit <I.arrow /></button>
      </form>
    </Sheet>
  );
}
