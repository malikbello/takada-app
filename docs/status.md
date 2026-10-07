# Takada: status and handoff

_Last updated: 7 Oct 2026 (session 9, end). The project-wide handoff is phc-scribe `docs/status.md` → "START HERE (7 Oct)": read that first. This file covers only this repo._

## Resume prompt (paste into a new session)
> Read `docs/status.md` in `malikbello/takada-app`, then phc-scribe `docs/status.md` "START HERE (7 Oct)". Follow the phc-scribe working agreement:
> - commits as `malikbello <139644523+malikbello@users.noreply.github.com>`, no AI attribution;
> - no secrets in chat, code or logs;
> - `./scripts/ci_local.sh` before every push.
>
> Then continue from "Next steps" below. Ask me before anything outward-facing (app stores, public URLs, the pilot).

## State (7 Oct)
- **`main`:** the PWA, the hub and cloud server, the Android and iPhone apps (Capacitor 8, ADR-0027) and the hub image. CI and the `native` workflow (debug APK; iOS simulator build) are green on `main`.
- **Branch `claude/awesome-mccarthy-xk2bgl`:** two commits ahead, for the 9 Oct pilot:
  - `deploy/llm.Dockerfile`: llama.cpp server built from release **b11387** (commit `8330e96`), the build the shipped model was evaluated with. No prebuilt image exists for it.
  - `deploy/compose/hub.yml`: the `llm` service uses that build with the evaluation's settings (`--jinja`, 8,192 context) and `--parallel 1`, read-only, with no capabilities.
  - `deploy/compose/hub.env.example`: `PHC_EXTRACTOR=llamacpp` by default.
  - `deploy/compose/hub.check.yml`: publishes the scribe API on loopback, for `hub_check.py` only.
  - `docs/operations.md`: build both images, then fetch the models with `python -m phc_scribe.fetch_models`.
  - `apps/server/src/upstream.ts`: removed-field details reach the phone, and the draft wait is 15 minutes.
  - `apps/server/test/upstream.test.ts`: new.
  - **Open a PR and merge it when CI is green.**
- **Tested end to end in a cloud session (7 Oct):** this llama.cpp image + phc-scribe's API image + the real GGUF. About 100 s per draft on 4 vCPUs, and 222 s for the first, cold draft. Details are in phc-scribe's status.
- **The clinical bundle** (`packages/clinical/src/bundle.json`) is identical to phc-scribe's `exports/clinical-bundle.json` (checked 7 Oct).
- **Known local-test quirk:** `apps/server/test/wav.test.ts` can time out (5 s limit) when the machine is busy, for example while compiling llama.cpp. It passes on an idle machine. It is not a code fault.

## Next steps
1. **Agent:** PR for `claude/awesome-mccarthy-xk2bgl` → `main`. Run `./scripts/ci_local.sh` on an idle machine, then merge.
2. **Malik, 7–8 Oct:** laptop hub dry run and latency. Exact commands are in phc-scribe "START HERE (7 Oct)", step 4. It needs the Yoruba tokenizer fix first (phc-scribe, step 1), or `fetch_models` stops at the Yoruba model by design.
3. **Before 9 Oct:**
   - install the debug APK on the nurses' Android phones (artifact of the latest `native` workflow run, or build locally: `cd apps/mobile && pnpm build && npx cap sync android && cd android && ./gradlew assembleDebug`);
   - each phone trusts the hub's local CA once (`docs/operations.md`);
   - pair the phones with codes from `POST /v1/admin/pairing-codes`;
   - iPhones use the web app (Add to Home Screen).
4. **9 Oct pilot:** record each visit, draft it on the hub and confirm it. Note the time per record and the usability issues, and record the demo.
5. **Malik:** lock takada-app.vercel.app behind Vercel Authentication (Settings → Deployment Protection → All Deployments).
6. **After 12 Oct:** the store routes (Google Play needs 12 testers for 14 days; the App Store is $99 a year), and the load test (visits per hour per hardware tier, ADR-0023 §3).

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
