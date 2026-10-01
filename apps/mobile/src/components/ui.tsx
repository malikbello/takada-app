import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ease, spring } from "../lib/motion";
import { I } from "./icons";

/** Bottom sheet: slides up with a spring, backdrop fades; Escape or tapping outside closes. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div className="backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <m.div className="sheet stack" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
            <div className="grab" aria-hidden="true" />
            <div className="between">
              <h2 className="title" style={{ fontSize: 22 }}>{title}</h2>
              <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
            </div>
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function TopBar({ title, back, right }: { title?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      {back && <m.a className="icon-btn" href={back} aria-label="Back" whileTap={{ scale: 0.9 }} transition={spring}><I.back /></m.a>}
      <div className="t">{title}</div>
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
    <m.button className="btn primary block xl hold" disabled={disabled} whileTap={{ scale: 0.98 }}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && start()} onKeyUp={stop}
      aria-label={`${label} (press and hold)`}>
      <span className="fill" style={{ transform: `scaleX(${p})` }} />
      <span>{p > 0 ? "Keep holding…" : <><I.shield /> {label}</>}</span>
    </m.button>
  );
}

export function ErrorNote({ error }: { error: Error | string | null | undefined }) {
  return (
    <AnimatePresence>
      {error ? (
        <m.p className="err" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease }}>
          {typeof error === "string" ? error : error.message}
        </m.p>
      ) : null}
    </AnimatePresence>
  );
}

export function Ring({ value, total }: { value: number; total: number }) {
  const r = 22, c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg className="ring" viewBox="0 0 54 54" role="img" aria-label={`${value} of ${total} covered`}>
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F07AA0" /><stop offset="1" stopColor="#7B4CC2" /></linearGradient>
      </defs>
      <circle className="track" cx="27" cy="27" r={r} />
      <m.circle className="val" cx="27" cy="27" r={r} strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.8, ease }} />
      <text x="27" y="31" textAnchor="middle" fontSize="13" fontWeight="800" fill="#2A1B3D">{value}/{total}</text>
    </svg>
  );
}

/** Animated segmented control: the white pill slides between options. */
export function Segmented<T extends string>({ value, options, onChange, label, id }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; id: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button type="button" key={k} aria-pressed={value === k} onClick={() => onChange(k)}>
          {value === k && <m.span layoutId={`seg-${id}`} className="seg-bg" transition={spring} />}
          <span>{l}</span>
        </button>
      ))}
    </div>
  );
}

/** Card that folds open; the body animates in. */
export function Disclosure({ icon, tint, title, meta, children, defaultOpen = false }: { icon: ReactNode; tint: [string, string]; title: string; meta?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card disc">
      <button className="sum" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="badge-ic" style={{ background: tint[0], color: tint[1] }}>{icon}</span>
        <span className="grow"><span className="h" style={{ display: "block" }}>{title}</span>{meta ? <span className="faint tiny">{meta}</span> : null}</span>
        <m.span className="chev" animate={{ rotate: open ? 180 : 0 }} transition={spring}><I.chev /></m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }} style={{ overflow: "hidden" }}>
            <div style={{ paddingTop: 12 }}>{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}
