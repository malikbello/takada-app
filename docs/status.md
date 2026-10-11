# Takada: status and handoff

_Last updated: 11 Oct 2026 (session 11). The project-wide handoff is phc-scribe `docs/status.md` → "START HERE (11 Oct)": read that first. This file covers only this repo._

## Resume prompt (paste into a new session)
> Read `docs/status.md` in `malikbello/takada-app`, then phc-scribe `docs/status.md` "START HERE (11 Oct)". Follow the phc-scribe working agreement:
> - commits as `malikbello <139644523+malikbello@users.noreply.github.com>`, no AI attribution;
> - no secrets in chat, code or logs;
> - `./scripts/ci_local.sh` before every push.
>
> Then continue from "Next steps" below. Ask me before anything outward-facing (app stores, public URLs, the pilot).

## State (11 Oct)
- **Merged on 11 Oct, from the first full phone test** (Galaxy S22 → laptop hotspot → hub):
  - PR #6: the draft starts by itself when recording stops; Review says "AI draft not back yet";
  - PR #7: consent tick before recording; retention of recordings and transcripts (phc-scribe ADR-0033);
  - PR #8: "update available" banner; `hub.yml` passes `PHC_ASR_INT8_MODELS` and the retention days;
  - PRs #9 and #11: operations with measured hub numbers, the Windows one-time setup, int8 speech through `fetch_models`;
  - PR #10: Apache-2.0 licence for the code.
- **The laptop hub** runs `main`, with int8 English speech (`PHC_ASR=ct2`). Its secrets were rotated on 11 Oct.
- **Vercel** (11 Oct): Root Directory `apps/mobile`, and git-triggered builds skipped (`exit 0`). The preview is deployed from the built `dist/` as documented in operations, so pushes no longer show a failed Vercel check. Deployment Protection is on.

## State (7 Oct, evening)
- **`main`:** the PWA, the hub and cloud server, the Android and iPhone apps (Capacitor 8, ADR-0027), the hub image and the llama.cpp b11387 build the model was evaluated with (merged as PR #1). CI and the `native` workflow are green.
- **Pilot-readiness review (7 Oct): `docs/reviews/2026-10-07-pilot-readiness.md`. Read it before the dry run.**
  - The full hub (real model, real ASR) was driven from a browser and with scripted phones.
  - It found 13 pilot blockers (B1–B13), all fixed with tests in the review PR. The worst:
    - a typed facility name refused every visit;
    - sync stalled after a long offline day;
    - visits over about 10 minutes failed to draft;
    - any draft over 5 minutes was cut off by Node's fetch (B13).
  - Open findings O1–O9 still need decisions. **O1: the model wrote a false "reduced fetal movement" from "the baby moves well"**, so nurses must check every model finding.
- **8 Oct, PR #3 merged:**
  - **crash-safe recordings** (review O3): chunks are saved every second and recovered on the next start;
  - **plain error messages** for nurses (O9);
  - **a live "No sound is reaching the microphone" warning**;
  - phc-scribe's `grounding.checks` shown under "Please check";
  - empty transcripts treated as no speech;
  - even audio parts.
- **Waiting on Malik:** phc-scribe PR 27 (ADR-0030 polarity check, ADR-0031 speech gate), Proposed. After merge, rebuild `phc-scribe-api:local` on the hub.
- **The clinical bundle** (`packages/clinical/src/bundle.json`) is identical to phc-scribe's `exports/clinical-bundle.json` (checked 7 Oct).

## Next steps
1. **Agent:** merge the review PR when CI (including `native`) is green.
2. **Malik, 7–8 Oct:** laptop hub dry run (phc-scribe "START HERE (7 Oct)", step 4), plus the five checks at the end of the review, **on the pilot phones**. The most important is the first: the hub's name must resolve on the clinic Wi-Fi.
3. **Before 9 Oct:**
   - install the debug APK on the nurses' Android phones (artifact of the latest `native` workflow run, or build locally: `cd apps/mobile && pnpm build && npx cap sync android && cd android && ./gradlew assembleDebug`);
   - each phone trusts the hub's local CA once (`docs/operations.md`);
   - pair the phones with codes from `POST /v1/admin/pairing-codes`;
   - iPhones use the web app (Add to Home Screen);
   - send one warm-up draft after starting the hub (the first, cold draft takes about 7 minutes).
4. **9 Oct pilot:**
   - tell the nurses that every model finding must be checked (review O1);
   - record each visit, draft it on the hub and confirm it;
   - note the time per record and the usability issues, and record the demo.
5. **Malik:** lock takada-app.vercel.app behind Vercel Authentication (Settings → Deployment Protection → All Deployments).
6. **After 12 Oct:**
   - review findings O2–O9 (O3, recording persistence, and O4, audio retention, first);
   - the store routes (Google Play needs 12 testers for 14 days; the App Store is $99 a year);
   - the load test (ADR-0023 §3).

## Where things are
| Path | What |
|---|---|
| `apps/mobile` | Phone app: PWA, plus `android/` and `ios/` (Capacitor). |
| `apps/server` | Hub and cloud service: pairing, sync, job queue (drafts via phc-scribe `/v1`), FHIR/DHIS2 export. |
| `packages/clinical` | Danger-sign rules and visit guide, ported from phc-scribe and tested against its vectors. `bundle.json` is vendored (`scripts/sync-bundle.sh`). |
| `packages/protocol` | Event schema and hashing for sync. |
| `deploy/` | Server image, `llm.Dockerfile`, Compose for the clinic hub, Kubernetes manifests. |
| `docs/operations.md` | Running a hub, pairing phones, health checks, backups, known limits. |
| `docs/design.md` | Design system. |
