import { m } from "motion/react";
import { useState, type FormEvent } from "react";
import { I, Logo } from "../components/icons";
import { ErrorNote, TopBar } from "../components/ui";
import { useLive, type Profile } from "../lib/store";
import { getLink, pair, syncOnce, useSyncState } from "../lib/sync";

export function Settings({ profile }: { profile: Profile }) {
  const { data: link } = useLive(getLink);
  const sync = useSyncState();
  const [url, setUrl] = useState(() => (location.port === "8080" || location.hostname.endsWith(".local") ? location.origin : ""));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function doPair(e: FormEvent) {
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
      <TopBar back="#/" title="Settings" />
      <main className="page stack">
        <section className="card row" style={{ gap: 14 }}>
          <span className="avatar" style={{ width: 54, height: 54, fontSize: 18 }}>{profile.worker.slice(0, 1).toUpperCase()}</span>
          <div className="grow"><div className="h">{profile.worker}</div><div className="muted small">{profile.facility}</div></div>
        </section>
        <section className="card stack">
          <div className="row"><span className="badge-ic" style={{ background: "var(--lavender)", color: "var(--plum)" }}><I.shield /></span><div className="h grow">Clinic hub</div>
            {link && <span className={`pill ${sync.error ? "danger" : "sage"}`}><span className="dot" />{sync.error ? "Problem" : "Paired"}</span>}</div>
          {link ? (
            <>
              <p className="small" style={{ margin: 0 }}>Paired with <b>{link.node}</b> · {link.facility}</p>
              <p className="faint tiny" style={{ margin: 0 }}>{link.url}</p>
              <p className="small muted" style={{ margin: 0 }}>{sync.pushing ? "Syncing…" : sync.at ? `Last synced ${new Date(sync.at).toLocaleTimeString("en-NG", { timeStyle: "short" })}` : "Not synced yet"}</p>
              {sync.rejected > 0 && <p className="err">{sync.rejected} change(s) were refused by the hub. Ask your supervisor.</p>}
              <ErrorNote error={sync.error} />
              <m.button className="btn soft" onClick={() => void syncOnce()} disabled={sync.pushing} whileTap={{ scale: 0.97 }}>{sync.pushing ? "Syncing…" : "Sync now"}</m.button>
            </>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Not paired yet. Records stay safely on this phone. Pair to share them with your clinic and turn on AI drafting.</p>
          )}
          <form className="stack" onSubmit={doPair}>
            <label className="field"><span>Hub address</span><input className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://takada-hub.local" /></label>
            <label className="field"><span>Pairing code</span><input className="input" value={code} autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} placeholder="8 letters, from your supervisor" /></label>
            <m.button className="btn primary block" type="submit" disabled={busy || !url || !code} whileTap={{ scale: 0.97 }}>{busy ? "Pairing…" : link ? "Pair again" : "Pair this phone"} <I.arrow /></m.button>
            <ErrorNote error={error} />
          </form>
        </section>
        <div className="center faint tiny" style={{ paddingTop: 10 }}><Logo size={28} mono /><p style={{ margin: "6px 0 0" }}>Takada · clinical content is a draft until signed off</p></div>
      </main>
    </>
  );
}
