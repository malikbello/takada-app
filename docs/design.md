# Takada design system ("warm care", v3)

## Intent
Takada sits between a nurse and a pregnant woman. It should feel like care, not software:
- **calm** enough for a busy clinic;
- **warm** enough to feel motherly;
- **clinically clear** when something is wrong.

One obvious action per screen. Plain words. Nothing that lags on a cheap phone.

## Logo
A lowercase **t** whose stem curves into a cradling arm, holding a baby (the dot). It stands for:
- Takada, "paper" (*takarda*);
- a mother's embrace;
- a pen stroke.

The tile runs peach → rose → violet; the one-colour version is plum with a rose dot. Source: `apps/mobile/src/components/icons.tsx` (`Logo`) and `apps/mobile/public/icon.svg`. On first launch it draws itself: the tile springs in, the stem and bar are drawn, then the baby dot pops in.

## Colour
White is the default.

| Role | Token | Use |
|---|---|---|
| Canvas | `#FFFDFB` warm white, `#FBF4F0` cream | backgrounds |
| Ink | `#2A1B3D` plum-black | text (contrast 15:1) |
| Brand | `#FFB199` peach → `#F07AA0` rose → `#7B4CC2` violet | logo, hero cards, highlights |
| Action | `#5B3AA5` plum | primary buttons (white text 7.6:1) |
| Health / done | `#2F8F73` sage | synced, confirmed, asked |
| Follow-up | `#9A5B00` on `#FFF3DC` honey | follow-up prompts, items to confirm |
| **Danger** | `#C81E3A` crimson | **danger signs only**, so an alert is never mistaken for decoration |

## Type
Plus Jakarta Sans (variable), bundled with the app so it works offline, with the Latin-extended and Vietnamese subsets for Yorùbá letters (ẹ, ọ, ṣ). Sizes:
- display: 40 / 800;
- title: 24 / 750;
- body: 16.5 / 500;
- overline: 12.5 uppercase.

## Motion (Framer Motion)
- **Purposeful only:**
  - arrival (cards rise in, staggered);
  - feedback (tap squeeze, the "Asked" ring filling);
  - continuity (sheets slide, the segmented pill glides, the next question slides in);
  - alarm (the danger card shakes once and the phone vibrates).
- **Cheap:** only transform and opacity animate. The animation features load after first paint (`LazyMotion`). Ambient motion (welcome blobs, the orb's halo) is CSS keyframes.
- **Respectful:** `MotionConfig reducedMotion="user"` follows the phone's reduce-motion setting.

## Budgets
- First load ≤ 200 KB gzipped, enforced by `scripts/check-budget.mjs`; currently about 161 KB.
- Tap targets ≥ 48 px.
- WCAG 2.2 AA contrast.
