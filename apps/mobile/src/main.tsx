import { AnimatePresence, LazyMotion, MotionConfig, m } from "motion/react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { ErrorNote } from "./components/ui";
import { ease } from "./lib/motion";
import { useRoute } from "./lib/nav";
import { getProfile, type Profile } from "./lib/store";
import { startSync } from "./lib/sync";
import { Review } from "./screens/Review";
import { Settings } from "./screens/Settings";
import { Today } from "./screens/Today";
import { VisitScreen } from "./screens/VisitScreen";
import { Welcome } from "./screens/Welcome";
import "./styles.css";

registerSW({ immediate: true });
// The phone is the only copy of a record until it syncs: ask the browser to keep our data.
navigator.storage?.persist?.().catch(() => undefined);

function App() {
  const route = useRoute();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    getProfile().then(setProfile).catch(setError);
    return startSync();
  }, []);
  if (error) return <main className="page"><ErrorNote error={`Storage is unavailable on this phone: ${error.message}`} /></main>;
  if (profile === undefined) return null;
  if (profile === null || route.name === "setup") return <Welcome onDone={setProfile} />;
  const key = route.name === "visit" || route.name === "review" ? `${route.name}/${route.id}` : route.name;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease }}>
        {route.name === "visit" ? <VisitScreen id={route.id} profile={profile} />
          : route.name === "review" ? <Review id={route.id} profile={profile} />
          : route.name === "settings" ? <Settings profile={profile} />
          : <Today profile={profile} />}
      </m.div>
    </AnimatePresence>
  );
}

window.addEventListener("unhandledrejection", (e) => console.error("unhandled", e.reason));
createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <LazyMotion features={() => import("./lib/features").then((r) => r.default)} strict>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
