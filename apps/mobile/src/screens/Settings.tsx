import { useState } from "preact/hooks";
import { ErrorNote } from "../components/ui";
import { go } from "../lib/nav";
import { useLive, type Profile } from "../lib/store";
import { getLink, pair, syncOnce, useSyncState } from "../lib/sync";

export function Settings({ profile }: { profile: Profile }) {
  const { data: link } = useLive(getLink);
  const sync = useSyncState();
  // When the hub serves this app, its own address is the hub address.
  const [url, setUrl] = useState(() => (location.port === "8080" || location.hostname.endsWith(".local") ? location.origin : ""));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function doPair(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await pair(url, code, profile.deviceId, profile.worker);
      setCode("");
      await syncOnce();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header class="bar">
        <button class="icon-btn" onClick={() => go("/")} aria-label="Back to today">←</button>
        <h1>Settings</h1>
      </header>
      <main class="wrap stack">
        <section class="card stack">
          <h2>This phone</h2>
          <p>{profile.worker} · {profile.facility}</p>
          <p class="muted small">Device {profile.deviceId}</p>
        </section>
        <section class="card stack">
          <h2>Clinic hub</h2>
          {link ? (
            <>
              <p>Paired with <b>{link.node}</b> ({link.facility})</p>
              <p class="muted small">{link.url}</p>
              <p class="small">{sync.pushing ? "Syncing…" : sync.at ? `Last synced ${new Date(sync.at).toLocaleTimeString("en-NG")}` : "Not synced yet"}</p>
              {sync.rejected > 0 && <p class="err">{sync.rejected} change(s) were refused by the hub. Ask your supervisor.</p>}
              <ErrorNote error={sync.error} />
              <button class="btn" onClick={() => void syncOnce()} disabled={sync.pushing}>Sync now</button>
            </>
          ) : (
            <p class="muted">Not paired. Records stay on this phone and are safe. Pair to share them and to draft records from recordings.</p>
          )}
          <form class="stack" onSubmit={doPair}>
            <label class="field"><span>Hub address (shown on the hub screen)</span><input class="input" inputMode="url" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} placeholder="https://hub.clinic.local:8080" /></label>
            <label class="field"><span>Pairing code</span><input class="input" value={code} autoCapitalize="characters" onInput={(e) => setCode((e.target as HTMLInputElement).value)} /></label>
            <button class="btn primary" type="submit" disabled={busy || !url || !code}>{link ? "Pair again" : "Pair"}</button>
            <ErrorNote error={error} />
          </form>
        </section>
      </main>
    </>
  );
}
