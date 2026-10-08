import { AnimatePresence, LazyMotion, MotionConfig, m } from "motion/react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { ErrorNote } from "./components/ui";
import { ease } from "./lib/motion";
import { useRoute } from "./lib/nav";
import { getProfile, type Profile } from "./lib/store";
import { recoverRecordings } from "./lib/recordings";
import { startSync } from "./lib/sync";
import { applyEffects } from "./lib/effects";
import { isNative, startNative } from "./lib/platform";
import { Review } from "./screens/Review";
import { Settings } from "./screens/Settings";
import { Today } from "./screens/Today";
import { VisitScreen } from "./screens/VisitScreen";
import { Welcome } from "./screens/Welcome";
import "./styles.css";

// The web app installs a service worker for offline use; the native apps carry their files.
if (!isNative) registerSW({ immediate: true });
void startNative();
applyEffects();
// The phone is the only copy of a record until it syncs: ask the browser to keep our data.
navigator.storage?.persist?.().catch(() => undefined);

function App() {
  const route = useRoute();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);
  useEffect(() => {
    getProfile().then(setProfile).catch(setError);
    // Finish any recording the app was closed in the middle of (lib/recordings.ts).
    recoverRecordings()
      .then(({ recovered: n, failed }) => {
        if (n) setRecovered(`${n} recording${n > 1 ? "s were" : " was"} interrupted when the app closed, and ${n > 1 ? "have" : "has"} been saved to ${n > 1 ? "their visits" : "its visit"}.`);
        if (failed) setRecovered(`${failed} interrupted recording${failed > 1 ? "s" : ""} could not be converted. ${failed > 1 ? "They are" : "It is"} kept on this phone.`);
      })
      .catch(() => undefined);
    return startSync();
  }, []);
  if (error) return <main className="page"><ErrorNote error={`Storage is unavailable on this phone: ${error.message}`} /></main>;
  if (profile === undefined) return null;
  if (profile === null || route.name === "setup") return <Welcome onDone={setProfile} />;
  const key = route.name === "visit" || route.name === "review" ? `${route.name}/${route.id}` : route.name;
  return (
    <>
    {recovered && (
      <button type="button" className="ok-note" role="status" onClick={() => setRecovered(null)}
        style={{ position: "fixed", top: 12, left: 16, right: 16, zIndex: 50, textAlign: "left", border: 0, font: "inherit" }}>
        {recovered} <span className="faint tiny">Tap to close.</span>
      </button>
    )}
    <AnimatePresence mode="wait" initial={false}>
      <m.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease }}>
        {route.name === "visit" ? <VisitScreen id={route.id} profile={profile} />
          : route.name === "review" ? <Review id={route.id} profile={profile} />
          : route.name === "settings" ? <Settings profile={profile} onProfile={setProfile} />
          : <Today profile={profile} />}
      </m.div>
    </AnimatePresence>
    </>
  );
}

window.addEventListener("unhandledrejection", (e) => console.error("unhandled", e.reason));
createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <div className="blobs" aria-hidden="true"><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
    <LazyMotion features={() => import("./lib/features").then((r) => r.default)} strict>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
