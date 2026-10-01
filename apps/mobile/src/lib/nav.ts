import { useEffect, useState } from "preact/hooks";

// Tiny hash router: #/ (today), #/visit/<id>, #/review/<id>, #/setup.
export type Route = { name: "today" } | { name: "visit"; id: string } | { name: "review"; id: string } | { name: "setup" } | { name: "settings" };

export function parse(hash: string): Route {
  const [, page, id] = hash.replace(/^#/, "").split("/");
  if ((page === "visit" || page === "review") && id) return { name: page, id };
  if (page === "setup") return { name: "setup" };
  if (page === "settings") return { name: "settings" };
  return { name: "today" };
}

export function go(path: string): void {
  // Native-feeling page transitions where supported (View Transitions API).
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (d.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) d.startViewTransition(() => (window.location.hash = path));
  else window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
