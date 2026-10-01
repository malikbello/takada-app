import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { registerSW } from "virtual:pwa-register";
import { ErrorNote } from "./components/ui";
import { useRoute } from "./lib/nav";
import { getProfile, type Profile } from "./lib/store";
import { Review } from "./screens/Review";
import { Welcome } from "./screens/Welcome";
import { Today } from "./screens/Today";
import { Settings } from "./screens/Settings";
import { VisitScreen } from "./screens/VisitScreen";
import { startSync } from "./lib/sync";
import "./styles.css";

registerSW({ immediate: true });

// Ask the browser to keep this site's data even under storage pressure: the phone is
// the only copy of a record until it syncs.
navigator.storage?.persist?.().catch(() => undefined);

function App() {
  const route = useRoute();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    getProfile().then(setProfile).catch(setError);
    return startSync();
  }, []);
  if (error) return <main class="page"><ErrorNote error={`Storage is unavailable on this phone: ${error.message}`} /></main>;
  if (profile === undefined) return null;
  if (profile === null || route.name === "setup") return <Welcome onDone={setProfile} />;
  if (route.name === "visit") return <VisitScreen id={route.id} profile={profile} />;
  if (route.name === "review") return <Review id={route.id} profile={profile} />;
  if (route.name === "settings") return <Settings profile={profile} />;
  return <Today profile={profile} />;
}

window.addEventListener("unhandledrejection", (e) => console.error("unhandled", e.reason));
render(<><div class="aurora" aria-hidden="true" /><App /></>, document.getElementById("app")!);
