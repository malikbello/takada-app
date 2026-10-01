import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { I } from "./icons";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet stack" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="grab" aria-hidden="true" />
        <div class="between">
          <h2 class="title" style={{ fontSize: "22px" }}>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TopBar({ title, back, right }: { title?: string; back?: string; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      {back && <a class="icon-btn press" href={back} aria-label="Back"><I.back /></a>}
      <div class="t">{title}</div>
      {right}
    </header>
  );
}

/** Press and hold to confirm: prevents accidental taps on irreversible steps. */
export function HoldButton({ label, ms = 1100, onDone, disabled }: { label: string; ms?: number; onDone: () => void; disabled?: boolean }) {
  const [p, setP] = useState(0);
  const timer = useRef<number | null>(null);
  const start = () => {
    if (disabled || timer.current !== null) return;
    const t0 = performance.now();
    const tick = () => {
      const x = Math.min(1, (performance.now() - t0) / ms);
      setP(x);
      if (x >= 1) {
        timer.current = null;
        setP(0);
        navigator.vibrate?.(30);
        onDone();
      } else timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (timer.current !== null) cancelAnimationFrame(timer.current);
    timer.current = null;
    setP(0);
  };
  return (
    <button class="btn primary block xl hold" disabled={disabled}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && start()} onKeyUp={stop}
      aria-label={`${label} (press and hold)`}>
      <span class="fill" style={{ transform: `scaleX(${p})` }} />
      <span>{p > 0 ? "Keep holding…" : label}</span>
    </button>
  );
}

export function ErrorNote({ error }: { error: Error | string | null | undefined }) {
  if (!error) return null;
  return <p class="err" role="alert">{typeof error === "string" ? error : error.message}</p>;
}

export function Ring({ value, total }: { value: number; total: number }) {
  const r = 22, c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg class="ring" viewBox="0 0 52 52" role="img" aria-label={`${value} of ${total} covered`}>
      <circle class="track" cx="26" cy="26" r={r} />
      <circle class="val" cx="26" cy="26" r={r} stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} />
      <text x="26" y="30" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">{value}</text>
    </svg>
  );
}
