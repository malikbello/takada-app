# Pilot-readiness review, 7 Oct 2026

Two days before the 9 Oct pilot, the whole system was exercised as a clinic would use it, and the code was read for what tests had not covered.

**Setup:**
- The full hub ran in a cloud sandbox, all real: llama.cpp b11387 with the shipped Q4 GGUF, the phc-scribe API with the fine-tuned ASR, and the Takada server serving the PWA. Nothing was mocked.
- The web app was driven in Chromium on a Pixel 7 profile, from onboarding to pairing, recording, drafting and review.
- The server was stress-tested with scripted phones.
- The native configuration and the phc-scribe API were read.

**Not done here:** an APK on a real phone (no Android SDK in the sandbox; the `native` CI workflow builds it), and the clinic network itself. Both belong in the laptop dry run.

## Pilot blockers found, and fixed in this change (13)

| # | What happened | Effect at the clinic | Fix |
|---|---|---|---|
| B1 | The facility typed at onboarding ("Ibadan North PHC") differs from the name in the pairing code ("PHC Ibadan North"). | **Every visit was refused** (`wrong_facility`), its recording upload returned 404, and the app showed only "Visit not found". Settings still said "Last synced". Reproduced in the browser. | The server files a visit under the paired facility, whatever was typed. Pairing switches the phone to the hub's facility name. |
| B2 | The phone sends unsynced events in random (UUID) order, and the server refuses a visit's events until its start is known. | When a batch of 200 had no visit starts in it, all 200 were refused, the phone gave up, and the same batch went first again next time. After a long offline day (more than 200 events), **sync stalled for good**. Reproduced against the hub. | The phone sends oldest first and skips refused events within a round. The server handles visit starts first within a batch. |
| B3 | Any request, including a recording upload, timed out after 30 s. | A long recording on slow clinic Wi-Fi could never upload. | Uploads get 30 s plus 10 s per MB. |
| B4 | One recording that failed to upload stopped the sync before the pull. | One bad recording stopped every draft and every update reaching that phone. | Each upload fails on its own, the failure is shown, and the pull still runs. |
| B5 | Asking for a draft while a background sync was running skipped the sync and queued the job anyway. | The job failed with `audio_missing` after its retries (about 90 s), so the nurse had to try again. | A draft waits for the running sync, runs a fresh one, and is queued only when the hub has the whole visit (its events and every recording). |
| B6 | Text longer than 8,000 characters (about 10 minutes of speech) was sent to phc-scribe in one request. | **Long visits failed outright** with `upstream_413`. Reproduced on the hub with a 9,180-character visit. | Long text is split at sentence ends and drafted in parts. Parts that disagree are listed under "Please check". For a finding, the more alarming answer is kept, so an "absent" in one part never hides a danger sign said in another. |
| B7 | A silent recording (muted or broken microphone) was transcribed. | Whisper **invented a sentence** ("are there cultural rituals that help orphaned individuals…"), the draft came back empty, and the app said "Draft ready". Reproduced on the hub. | Silent audio (RMS below about −60 dBFS) is never transcribed. If a visit has nothing else, the job fails with "the recording is silent: check the phone's microphone". The draft card warns when a draft found nothing or needs checking. |
| B8 | "Draft again" added the new draft's findings to the old draft's. | Two drafts could leave contradicting findings side by side (fever present and fever absent), and the danger rules saw both. A worker's tap after a draft did not replace the model's finding for that concept. | The newest draft replaces the earlier one. A worker's entry replaces the model's for that concept, in either order. The worker's typed vitals always win. |
| B9 | The Android and iPhone apps run at `https://localhost` and `capacitor://localhost`, but the hub allowed no other origin (no `CORS_ORIGINS` in `hub.yml`). | **The native apps could not talk to the hub at all.** | `hub.yml` allows both origins by default. `capacitor.config.ts` now says what iOS really uses: WKWebView cannot serve `https`, so Capacitor was silently falling back to `capacitor://`. |
| B10 | Nothing announces `takada-hub.local` on the clinic network. | Phones (and `curl` on the laptop) may not find the hub. | `docs/operations.md`: use the laptop hotspot's fixed address `192.168.137.1`, the laptop's own `.local` name, or router DNS, and test it on the pilot phones in the dry run. |
| B11 | The screen turned off during a recording. | The phone may pause the app and stop recording mid-visit. | A screen wake lock is held while recording. |
| B12 | A recording was decoded at 48 kHz stereo before conversion. | A 30-minute visit needed about 700 MB, which a low-memory phone cannot hold. | The phone decodes straight to 16 kHz mono, and one recording is capped at 20 minutes ("saved, tap to keep recording"). |
| B13 | Node's `fetch` gives up after 300 s without response headers (`UND_ERR_HEADERS_TIMEOUT`), whatever the 15-minute abort signal says, and phc-scribe sends its headers only when the draft is done. | **Every draft over 5 minutes failed** and was retried. On a slow laptop CPU that can be every long draft: the 15-minute wait set in PR #1 never took effect. Seen on the hub: the first attempt of the long visit failed at 301 s while the model was still writing (it finished at 311 s). Reproduced in isolation. | The scribe client uses its own HTTP agent, whose header and body limits equal its timeout (`undici` 6.29.0, the patched release of the line Node 22 bundles). Checked with a test API that answers after 330 s. |

**Also fixed:**
- Pairing codes are rate limited: 20 wrong codes per address per 10 minutes. On the hub the address is the phone's, taken from Caddy's `X-Forwarded-For`, so one nurse's typos never lock out the others.
- `needsReview` entries are capped at the event schema's limits. Previously, one long removed-field detail made the draft impossible to store, and the job failed with `internal`.
- A finished job now pulls its draft at once, instead of on the next 20-second sync.
- `wav.test.ts` deep-compared a 1 MB buffer, which timed out under load. It now checks identity.

Every fix has a test, and each new test was run against the old code to confirm it fails there:
- **Mobile:** 5 of 5 new sync tests fail on the old code.
- **Server:** facility, batch order, silence, long visits and the rate limit.
- **Protocol:** draft replacement and worker override.

## What held up
- **Push storm:** 20 phones × 500 events at once. All 10,000 were accepted in about 8 s, a re-push was idempotent, `/healthz` answered in about 40 ms during the storm, and the pull returned every event once, in order, across 21 pages.
- **Hostile input refused with clear reasons:** invalid JSON, oversized bodies, 501 events, `null` events, another device's events, tampered hashes, writes into another facility's visit, negative cursors, and missing or revoked tokens.
- **A long visit on the real hub** (9,180 characters) was drafted in 2 parts and merged.
  - It found the headache, blurred vision, no bleeding and BP 160/110, and Review shows "drafted in 2 parts".
  - Each part took about 80–95 s once the prompt was cached.
- **Real speech, end to end:** an 11-second English visit was transcribed word for word, and the record drafted in about 80 s (warm).
  - The cold first draft after the model loads took about 7 minutes. Start the hub, then send one warm-up draft before the first patient.

## Open findings: not fixed here, need a decision or more work

| # | Finding | Severity | Owner / next step |
|---|---|---|---|
| O1 | **Model false alarm.** On "is the baby moving well? yes, the baby moves well", the shipped model wrote `reduced_fetal_movement: present` with that sentence as evidence. Grounding checks that the evidence exists, not its polarity. | High (a false danger sign), mitigated because the nurse reviews every draft. | phc-scribe: add this pattern to the error analysis, and consider a negation/polarity check in grounding (ADR). Brief the nurses on 9 Oct: every model finding must be checked. |
| O2 | Whisper invents text from non-speech noise (pocket, crowd), not only from digital silence. B7 covers only true silence. | Medium | phc-scribe ASR: no-speech probability or a VAD gate. |
| O3 | A recording lives only in the phone's memory until Stop. If the app is killed mid-visit, it is lost. | Medium | Persist chunks to IndexedDB every few seconds, and recover them on start. |
| O4 | Audio and transcripts are kept forever on the hub and the phone. | Medium (NDPA) | A retention policy (for example, delete audio after confirmation plus N days), as an ADR. |
| O5 | Throughput is one draft at a time: about 80–100 s warm on 4 vCPUs, plus transcription. That is roughly 30–40 visits an hour at best, and a queue builds at busy clinics. | Low for the pilot | The load test after 12 Oct (ADR-0023 §3). |
| O6 | The phone silently drops pulled events it cannot parse (for example, a newer hub's event type). | Low | Count them and show "update the app". |
| O7 | Events are ordered by device clocks. A phone with a wrong clock can order its confirmation before a draft. | Low | Server receive order as a tiebreak, or a clock-skew warning at pairing. |
| O8 | Re-pairing with an existing device id takes over that id (it needs a valid code). | Low | Bind the device id to its first token, or make admin revoke the old one first. |
| O9 | Job errors reach the nurse with their code prefix (`silent_audio: …`). | Cosmetic | Map the codes to plain messages. |

## Dry-run checklist this adds (laptop, before 9 Oct)
1. On a pilot phone, on the clinic Wi-Fi: `https://<HUB_HOSTNAME>/healthz` opens with no certificate warning.
2. Pair one phone with the facility typed differently from the code, record 30 s, draft. It must succeed (B1).
3. Leave a phone offline, record 3 visits with notes, reconnect. Everything syncs (B2).
4. Record a 12-minute visit and draft it. It succeeds, and Review shows "drafted in 2 parts" (B6).
5. Warm the model with one draft before the first patient (about 7 minutes cold).
