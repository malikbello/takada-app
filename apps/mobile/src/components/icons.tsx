// Inline icons (no icon font, no network). 24px grid, 2px rounded strokes.
import { m } from "motion/react";
import { ease } from "../lib/motion";

function S({ d, fill }: { d: string[]; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p) => <path d={p} key={p} fill={fill ? "currentColor" : undefined} />)}
    </svg>
  );
}

export const I = {
  mic: () => <S d={["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M19 11a7 7 0 0 1-14 0", "M12 18v3"]} />,
  stop: () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="3" fill="currentColor" /></svg>,
  back: () => <S d={["M15 5l-7 7 7 7"]} />,
  gear: () => <S d={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"]} />,
  check: () => <S d={["M5 12.5l4.5 4.5L19 7.5"]} />,
  chev: () => <S d={["M6 9l6 6 6-6"]} />,
  plus: () => <S d={["M12 5v14", "M5 12h14"]} />,
  arrow: () => <S d={["M5 12h14", "M13 6l6 6-6 6"]} />,
  alert: () => <S d={["M12 9v4", "M12 17h.01", "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"]} />,
  note: () => <S d={["M4 4h12l4 4v12H4z", "M8 12h8", "M8 16h5"]} />,
  pulse: () => <S d={["M3 12h4l2-6 4 12 2-6h6"]} />,
  share: () => <S d={["M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7", "M16 6l-4-4-4 4", "M12 2v13"]} />,
  sparkle: () => <S d={["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"]} />,
  heart: () => <S d={["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"]} />,
  shield: () => <S d={["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"]} />,
  wifiOff: () => <S d={["M2 2l20 20", "M8.5 16.4a5 5 0 0 1 7 0", "M12 20h.01", "M5 12.9a10 10 0 0 1 5-2.7", "M19 12.9a10 10 0 0 0-2.5-1.8"]} />,
};
export type IconName = keyof typeof I;

const T_STEM = "M47 22V66c0 18 12 30 29 30 14 0 23-8 25-20";
const T_BAR = "M32 43h30";

/** The Takada mark: a lowercase "t" whose stem curves into a cradling arm, holding a baby.
 * Peach to rose to violet: warmth, mother and child. `animate` draws it on first launch. */
export function Logo({ size = 48, animate = false, mono = false }: { size?: number; animate?: boolean; mono?: boolean }) {
  const id = `tk${size}${animate ? "a" : ""}${mono ? "m" : ""}`;
  const stroke = mono ? "#5B3AA5" : "#fff";
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Takada" style={{ flex: "none", overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1=".1" y1="0" x2=".9" y2="1">
          <stop offset="0" stopColor="#FFB199" />
          <stop offset=".45" stopColor="#F07AA0" />
          <stop offset="1" stopColor="#7B4CC2" />
        </linearGradient>
      </defs>
      {!mono && (
        <m.rect width="120" height="120" rx="36" fill={`url(#${id})`}
          initial={animate ? { scale: 0.6, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 16 }} style={{ transformOrigin: "60px 60px" }} />
      )}
      <m.path d={T_STEM} fill="none" stroke={stroke} strokeWidth={13} strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease, delay: 0.35 }} />
      <m.path d={T_BAR} fill="none" stroke={stroke} strokeWidth={13} strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease, delay: 1.1 }} />
      <m.circle cx="79" cy="68" r="12" fill={mono ? "#F07AA0" : "#fff"} fillOpacity={mono ? 1 : 0.94}
        initial={animate ? { scale: 0 } : false} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 12, delay: 1.35 }} style={{ transformOrigin: "79px 68px" }} />
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.035em", color: "var(--ink)" }}>takada</span>;
}
