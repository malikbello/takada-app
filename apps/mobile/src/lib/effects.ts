// Visual effects level. Glass (backdrop blur) is the costliest thing we draw, so phones
// with little memory get solid surfaces automatically; anyone can override in Settings.
export type Effects = "auto" | "full" | "lite";
const KEY = "takada:effects";

export function getEffects(): Effects {
  try {
    const v = localStorage.getItem(KEY);
    return v === "full" || v === "lite" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setEffects(v: Effects): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode: the choice lasts for this session only */
  }
}

export function isLowEnd(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2;
}

export function applyEffects(): void {
  const fx = getEffects();
  const lite = fx === "lite" || (fx === "auto" && isLowEnd());
  document.documentElement.classList.toggle("lite", lite);
}
