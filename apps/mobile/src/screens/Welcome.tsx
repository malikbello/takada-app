import { useState } from "preact/hooks";
import { I, Logo, type IconName } from "../components/icons";
import { ErrorNote } from "../components/ui";
import { go } from "../lib/nav";
import { saveProfile, type Profile } from "../lib/store";

// First run: a calm welcome, three promises, then two fields. Under a minute.
export function Welcome({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [worker, setWorker] = useState("");
  const [facility, setFacility] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    if (!worker.trim() || !facility.trim()) return setError("Please fill in both");
    try {
      onDone(await saveProfile(worker.trim(), facility.trim()));
      go("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (step === 0) {
    return (
      <main class="page" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        <div class="center stack">
          <div class="hero-logo" style={{ display: "grid", placeItems: "center", marginBottom: "4px" }}><Logo size={96} draw /></div>
          <p class="eyebrow fade-up d1">Ẹ kú àbọ̀ · Welcome</p>
          <h1 class="display fade-up d1"><span class="gradient-text">Takada</span></h1>
          <p class="muted fade-up d2" style={{ fontSize: "19px", maxWidth: "26ch", margin: "8px auto 0" }}>Every visit written. Every danger sign seen.</p>
        </div>
        <div class="stack fade-up d3" style={{ marginTop: "24px" }}>
          {([
            ["mic", "Talk as you always do", "Yorùbá, Pidgin or English. Takada writes the record."],
            ["alert", "Danger signs, instantly", "Clear alerts with the protocol behind them, even offline."],
            ["sparkle", "Never miss a question", "A gentle guide to what to ask next."],
          ] as [IconName, string, string][]).map(([icon, t, d]) => (
            <div class="glass tight row" key={t}>
              <span class="avatar" style={{ width: "42px", height: "42px", color: "var(--mint)" }}><span style={{ width: "22px", height: "22px", display: "inline-flex" }}>{I[icon]()}</span></span>
              <div><div class="h" style={{ fontSize: "16px" }}>{t}</div><div class="muted small">{d}</div></div>
            </div>
          ))}
        </div>
        <button class="btn primary block xl press fade-up d4" style={{ marginTop: "20px" }} onClick={() => setStep(1)}>Get started <I.arrow /></button>
        <p class="faint tiny center fade-up d4" style={{ marginTop: "12px" }}>Records stay on this phone until they sync to your clinic. Use a phone screen lock.</p>
      </main>
    );
  }

  return (
    <main class="page" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <form class="stack" onSubmit={save}>
        <Logo size={56} />
        <p class="eyebrow">Step 1 of 1</p>
        <h1 class="title">Tell us who's caring today</h1>
        <label class="field"><span>Your name or staff ID</span><input class="input" value={worker} onInput={(e) => setWorker((e.target as HTMLInputElement).value)} autoComplete="name" autoFocus /></label>
        <label class="field"><span>Your facility code</span><input class="input" value={facility} placeholder="e.g. HFR number" onInput={(e) => setFacility((e.target as HTMLInputElement).value)} /></label>
        <ErrorNote error={error} />
        <button class="btn primary block xl press" type="submit">Continue <I.arrow /></button>
        <button class="link" type="button" onClick={() => setStep(0)}>Back</button>
      </form>
    </main>
  );
}
