import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet stack" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="row">
          <h2 class="grow">{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Press and hold to confirm: prevents accidental taps on irreversible steps. */
export function HoldButton({ label, ms = 1200, onDone, disabled }: { label: string; ms?: number; onDone: () => void; disabled?: boolean }) {
  const [p, setP] = useState(0);
  const timer = useRef<number | null>(null);
  const start = () => {
    if (disabled) return;
    const t0 = performance.now();
    const tick = () => {
      const x = Math.min(1, (performance.now() - t0) / ms);
      setP(x);
      if (x >= 1) {
        timer.current = null;
        setP(0);
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
    <button class="btn primary big hold" disabled={disabled}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !timer.current && start()} onKeyUp={stop}
      aria-label={`${label} (press and hold)`}>
      <span class="fill" style={{ transform: `scaleX(${p})` }} />
      <span style={{ position: "relative" }}>{p > 0 ? "Keep holding…" : label}</span>
    </button>
  );
}

export function ErrorNote({ error }: { error: Error | string | null }) {
  if (!error) return null;
  return <p class="err" role="alert">{typeof error === "string" ? error : error.message}</p>;
}
