import { m } from "motion/react";
import { useState, type FormEvent } from "react";
import { I, Logo } from "../components/icons";
import { ErrorNote, TopBar } from "../components/ui";
import { LANGS } from "../lib/greet";
import { applyEffects, getEffects, setEffects, type Effects } from "../lib/effects";
import { getProfile, saveProfile, useLive, type Profile } from "../lib/store";
import { DEMO_HUB, isDemo, joinDemo } from "../lib/demo";
import { getLink, pair, syncOnce, useSyncState } from "../lib/sync";

export function Settings({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const { data: link } = useLive(getLink);
  const sync = useSyncState();
  const [url, setUrl] = useState(() => (location.port === "8080" || location.hostname.endsWith(".local") ? location.origin : ""));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fx, setFx] = useState<Effects>(getEffects());
  async function doDemo() {
    setBusy(true);
    setError(null);
    try {
      await joinDemo(profile);
      const updated = await getProfile();
      if (updated) onProfile(updated);
      await syncOnce();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doPair(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await pair(url, code, profile.deviceId, profile.worker);
      const updated = await getProfile(); // pairing sets the facility to the hub's name for it
      if (updated) onProfile(updated);
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
          <div className="h">Greet me in</div>
          <div className="chips">
            {LANGS.map(([k, l]) => (
              <m.button type="button" key={k} className="chip" aria-pressed={profile.lang === k} whileTap={{ scale: 0.94 }}
                onClick={async () => onProfile(await saveProfile(profile.worker, profile.facility, k))}>{l}</m.button>
            ))}
          </div>
        </section>
        <section className="card stack">
          <div className="h">Visual effects</div>
          <div className="chips">
            {([["auto", "Auto"], ["full", "Full glass"], ["lite", "Light (saves battery)"]] as [Effects, string][]).map(([k, l]) => (
              <m.button type="button" key={k} className="chip" aria-pressed={fx === k} whileTap={{ scale: 0.94 }}
                onClick={() => { setEffects(k); setFx(k); applyEffects(); }}>{l}</m.button>
            ))}
          </div>
          <p className="faint tiny" style={{ margin: 0 }}>Auto uses the light style on phones with little memory, so the app never lags.</p>
        </section>
        {DEMO_HUB && !isDemo(link) && (
          <section className="card stack">
            <div className="row"><span className="badge-ic" style={{ background: "var(--lavender)", color: "var(--plum)" }}><I.sparkle /></span><div className="h grow">Try the AI demo</div></div>
            <p className="small" style={{ margin: 0 }}>No clinic hub? Join the demo hub in the cloud. It turns your recording into the antenatal record with the fine-tuned N‑ATLaS, usually in about a minute.</p>
            <p className="faint tiny" style={{ margin: 0 }}>For trying Tákàdá only: use made-up visits, never real patients. Demo recordings are deleted after a day.</p>
            <m.button className="btn primary block" onClick={() => void doDemo()} disabled={busy} whileTap={{ scale: 0.97 }}>{busy ? "Joining…" : "Use the AI demo"} <I.arrow /></m.button>
          </section>
        )}
        <section className="card stack">
          <div className="row"><span className="badge-ic" style={{ background: "var(--lavender)", color: "var(--plum)" }}><I.shield /></span><div className="h grow">{isDemo(link) ? "Demo hub (cloud)" : "Clinic hub"}</div>
            {link && <span className={`pill ${sync.error ? "danger" : "sage"}`}><span className="dot" />{sync.error ? "Problem" : "Paired"}</span>}</div>
          {link ? (
            <>
              <p className="small" style={{ margin: 0 }}>Paired with <b>{link.node}</b> · {link.facility}</p>
              {isDemo(link) && <p className="faint tiny" style={{ margin: 0 }}>Demo only: no real patients. Recordings are deleted after a day.</p>}
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
        <div className="center faint tiny" style={{ paddingTop: 10 }}><Logo size={28} mono /><p style={{ margin: "6px 0 0" }}>Tákàdá · clinical content is a draft until signed off</p></div>
      </main>
    </>
  );
}
