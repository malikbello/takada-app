import { useState } from "preact/hooks";
import { ErrorNote } from "../components/ui";
import { go } from "../lib/nav";
import { saveProfile, type Profile } from "../lib/store";

export function Setup({ onDone }: { onDone: (p: Profile) => void }) {
  const [worker, setWorker] = useState("");
  const [facility, setFacility] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save(e: Event) {
    e.preventDefault();
    if (!worker.trim() || !facility.trim()) return setError("Enter both");
    try {
      onDone(await saveProfile(worker.trim(), facility.trim()));
      go("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <main class="wrap stack">
      <h1 style={{ fontSize: "28px", margin: "24px 0 0" }}>Welcome to Takada</h1>
      <p class="muted">Your antenatal visit assistant. It works without internet; records stay on this phone until they sync.</p>
      <form class="card stack" onSubmit={save}>
        <label class="field"><span>Your name or staff ID</span><input class="input" value={worker} onInput={(e) => setWorker((e.target as HTMLInputElement).value)} autoComplete="name" /></label>
        <label class="field"><span>Facility code (e.g. HFR number)</span><input class="input" value={facility} onInput={(e) => setFacility((e.target as HTMLInputElement).value)} /></label>
        <button class="btn primary big" type="submit">Continue</button>
        <ErrorNote error={error} />
      </form>
    </main>
  );
}
