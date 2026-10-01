// Inline icons (no icon font, no network). 24px grid, 2px rounded strokes.
import type { JSX } from "preact";

const S = (p: { d: string | string[]; label?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden={p.label ? undefined : "true"} role={p.label ? "img" : undefined} aria-label={p.label}>
    {(Array.isArray(p.d) ? p.d : [p.d]).map((d) => <path d={d} key={d} />)}
  </svg>
);

export const I = {
  mic: () => <S d={["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M19 11a7 7 0 0 1-14 0", "M12 18v3"]} />,
  stop: () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" /></svg>,
  back: () => <S d="M15 5l-7 7 7 7" />,
  gear: () => <S d={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"]} />,
  check: () => <S d="M5 12.5l4.5 4.5L19 7.5" />,
  chev: () => <S d="M6 9l6 6 6-6" />,
  plus: () => <S d={["M12 5v14", "M5 12h14"]} />,
  arrow: () => <S d={["M5 12h14", "M13 6l6 6-6 6"]} />,
  alert: () => <S d={["M12 9v4", "M12 17h.01", "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"]} />,
  wifi: () => <S d={["M5 12.6a10 10 0 0 1 14 0", "M8.5 16.1a5 5 0 0 1 7 0", "M12 20h.01", "M2 9a15 15 0 0 1 20 0"]} />,
  off: () => <S d={["M2 2l20 20", "M8.5 16.1a5 5 0 0 1 7 0", "M12 20h.01", "M5 12.6a10 10 0 0 1 5.2-2.9", "M19 12.6a10 10 0 0 0-2.7-1.9"]} />,
  note: () => <S d={["M4 4h12l4 4v12H4z", "M8 12h8", "M8 16h5"]} />,
  pulse: () => <S d="M3 12h4l2-6 4 12 2-6h6" />,
  share: () => <S d={["M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7", "M16 6l-4-4-4 4", "M12 2v13"]} />,
  sparkle: () => <S d={["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"]} />,
} satisfies Record<string, () => JSX.Element>;
export type IconName = keyof typeof I;

/** The Takada mark: a page with a folded corner and three lines of writing, the last
 * one a voice wave. `draw` animates it on the welcome screen. */
export function Logo({ size = 72, draw = false }: { size?: number; draw?: boolean }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} class={draw ? "logo-draw breathe" : undefined} role="img" aria-label="Takada">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5eead4" />
          <stop offset="0.6" stop-color="#38bdf8" />
          <stop offset="1" stop-color="#fbbf24" />
        </linearGradient>
      </defs>
      <path class="l1" d="M26 12h32l16 16v52a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6z" fill="none" stroke="url(#lg)" stroke-width="5" stroke-linejoin="round" />
      <path class="l2" d="M58 12v16h16" fill="none" stroke="url(#lg)" stroke-width="5" stroke-linejoin="round" />
      <path class="l3" d="M32 44h30M32 56h22" fill="none" stroke="url(#lg)" stroke-width="5" stroke-linecap="round" />
      <path class="l4" d="M32 70h4l3-6 5 12 4-9 3 3h11" fill="none" stroke="url(#lg)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
