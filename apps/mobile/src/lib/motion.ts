// Motion presets (Framer Motion). Only transform and opacity animate, so the GPU does the
// work and low-end phones stay smooth. <MotionConfig reducedMotion="user"> in main.tsx
// turns movement off for people who ask their phone for less motion.
import type { Transition } from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;
export const spring: Transition = { type: "spring", stiffness: 420, damping: 30, mass: 0.8 };
export const soft: Transition = { type: "spring", stiffness: 160, damping: 22 };

export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease, delay },
});

export const tap = { whileTap: { scale: 0.97 }, transition: spring };
