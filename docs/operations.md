# Operating Takada

## The pieces
| Piece | Runs on | What it needs |
|---|---|---|
| Phone app | Android or iPhone | One codebase, three forms (ADR-0027): the **Android app** (APK), the **iPhone/Android web app** (installs from the browser) and, later, the store apps. Works offline. |
| Clinic hub | Laptop or mini-PC on the clinic Wi-Fi | Docker. `deploy/compose/hub.yml`: Takada server + phc-scribe API (+ the model, when ready) + HTTPS proxy. |
| Cloud | Any container platform (Kubernetes manifests in `deploy/k8s/`) | The same server image with `ROLE=cloud`, and a phc-scribe API with the GPU model. |

## Phone apps (ADR-0027)
| Form | Install | Notes |
|---|---|---|
| **Android app** | Download `takada-android-debug` from the latest **native** workflow run (GitHub → Actions). On the phone, allow "Install unknown apps" for the browser or Files, then open the APK. | Debug-signed: for the pilot and demo only. Before real use, build a release APK signed with a key kept as a GitHub secret. |
| **Web app** | iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install app. | From the hub (`https://takada-hub.local`) or the cloud preview. |
| **Store apps** | Google Play ($25 once; new personal accounts need 12 testers for 14 days) and the App Store ($99/year) | Not before 12 Oct; Malik decides. |

Build the Android app locally (JDK 21 + Android SDK 36):
```bash
pnpm --filter @takada/mobile build
cd apps/mobile && npx cap sync android && cd android && ./gradlew assembleDebug
```
iOS builds need a Mac with Xcode 26 (`npx cap open ios`). CI builds both (`.github/workflows/native.yml`).

## Cloud preview of the phone app
The phone app alone (no hub) is deployed to https://takada-app.vercel.app. `apps/mobile/public/vercel.json` holds its security headers and SPA rewrites:
```bash
pnpm --filter mobile build
npx vercel deploy apps/mobile/dist --prod
```
Without a paired hub it records, flags danger signs and runs the visit guide on the phone; AI drafting and sync need a hub.

## The public demo hub (the judges' sandbox)
**What it is:** a cloud hub so anyone can try AI drafting from https://takada-app.vercel.app. It runs the same server as a clinic hub with `ROLE=cloud` (`deploy/modal_demo_hub.py`). It drafts with the fine-tuned N-ATLaS on a GPU (phc-scribe `deploy/modal_demo.py`).

**How someone uses it:** **Try the AI demo** (Today screen or Settings) pairs the phone with the public code (`DEMO_CODE`). Each phone gets a demo clinic of its own, so no one sees another's visits. The app is labelled "Demo only: no real patients".

**Limits:**
- **Drafts:** 10 AI drafts per phone per hour (`DEMO_DRAFTS_PER_HOUR`) and 25 a day in all (`DEMO_DRAFTS_PER_DAY`), with a clear message when either is reached.
- **Retention:** recordings and transcripts are deleted after a day (`RETAIN_*_DAYS=1`).
- **Cost:** the GPU runs only while drafting (one container, scales to zero after a minute idle), and the Modal workspace spend limit is $0.

**Restarts:** the hub keeps its data on the container disk. After a restart, phones join again and resend their visits by themselves (`apps/mobile/src/lib/demo.ts`).

**Deploy:**
```bash
pnpm --filter @takada/server build && modal deploy deploy/modal_demo_hub.py   # the hub
VITE_DEMO_HUB=https://malikbello--takada-demo-hub.us-east.modal.run pnpm --filter mobile build
npx vercel deploy apps/mobile/dist --prod                                      # the app with the demo card
```
Clinic builds leave `VITE_DEMO_HUB` unset, so they never show the demo.

## Set up a clinic hub (works with no internet)
**What the hub is.** One laptop or mini-PC in the clinic that runs the AI and keeps the clinic's copy of every record. Phones talk to it over the clinic's own Wi-Fi; no internet is needed at any point in a visit.

```
 phones (Android app / web app)
      │  clinic Wi-Fi only (a $20–30 router, or the laptop's own hotspot)
      ▼
 hub laptop ── Takada server: pairing, sync, record store, drafting queue
            ── phc-scribe API: N-ATLaS ASR (speech → text) + fine-tuned N-ATLaS (text → note)
            ── Caddy: HTTPS on the local network
      │  only when any internet appears (mobile data, once a day is enough)
      ▼
 cloud copy (optional) → FHIR R4 export (DHIS2 reporting is planned)
```

**What runs where:**
- **On the phone, always offline:** recording, the visit guide (what to ask next, the summary so far, follow-ups) and the danger-sign rules. A danger sign is flagged on the phone even if the hub is off.
- **On the hub, offline:** speech to text (fine-tuned N-ATLaS ASR, Whisper-Small) and the note draft (fine-tuned N-ATLaS 8B, 4-bit, llama.cpp on the CPU). The draft returns to the phone, and the nurse confirms it.
- **In the cloud, only when online:** a second copy of the records, and the FHIR R4 export.

**Hardware (reference: Dell Latitude 5400, i7-8665U, 16 GB RAM, no GPU), measured 10–11 Oct:**
- **16 GB RAM.** The 8B note model takes about 5.5 GB in 4-bit. Speech takes 3.9 GB with all three fp32 models loaded, or **1.9 GB with the int8 models** (phc-scribe ADR-0032). 8 GB laptops cannot run the 8B note model; a 3-bit version was tested and rejected, so they wait for a distilled model.
- **About 25 GB free disk** for models, images and records.
- **Speed:**
  - **Speech to text:** fp32 is slower than real time (a 20 s recording takes about 56 s). **int8 takes about 6 s** for the same recording (`PHC_ASR=ct2`, below).
  - **Note draft:** about 2 minutes at the median, 4 minutes at p95. The first draft after start-up takes about 7 minutes, so send one warm-up visit before clinic hours.
  - Drafts are queued: the draft starts by itself when the nurse stops recording, and she carries on. From these times, one drafting worker handles roughly 15–25 visits an hour; the load test will confirm the number per hardware tier.
- **Power:** the laptop battery covers outages; a small UPS or solar pack keeps the router up.

**One-time setup on a Windows laptop** (found in the 10–11 Oct dry runs):
1. **Give Docker enough memory.** Docker Desktop's default (half the RAM) is too small. Create `%UserProfile%\.wslconfig` with:
   ```
   [wsl2]
   memory=12GB
   swap=4GB
   ```
   Then run `wsl --shutdown` and restart Docker Desktop.
2. **Let phones reach the hub, and only from the hotspot.** In an administrator PowerShell:
   ```powershell
   New-NetFirewallRule -DisplayName "Takada hub (laptop hotspot only)" -Direction Inbound -Protocol TCP `
     -LocalPort 80,443 -LocalAddress 192.168.137.1 -RemoteAddress 192.168.137.0/24 -Action Allow
   ```
3. **Keep the hotspot on.** Settings → Network & internet → Mobile hotspot → **Power saving: Off**. Otherwise Windows turns the hotspot off after a few minutes with no phone connected. This happened three times in one afternoon.
4. **On each phone, once:**
   - install the hub's certificate (below);
   - keep the Wi-Fi connection when Android says "no internet" (Samsung: Connections → Wi-Fi → Intelligent Wi-Fi → **Switch to mobile data: Off**). Otherwise the phone sends hub requests over mobile data, where the hub does not exist (phc-scribe ADR-0035 removes this step in the Android app).
5. **Windows `curl.exe`** cannot check revocation for the hub's own certificate authority. Use `curl.exe --ssl-no-revoke --cacert takada-hub-root.crt https://192.168.137.1/healthz`.

**Every clinic day: keep the laptop for the hub.**
- **Close other programs** (browsers with many tabs, editors, video tools) before the first visit. The note model needs about 6 GB of memory to itself.
- **What happens without it:** in the 12 Oct end-to-end test, with under 2 GB free, one draft took 12.9 minutes instead of the usual 2–4.
- **The hub waits for slow drafts:** the model call is given up to 14 minutes (`PHC_LLAMACPP_TIMEOUT`, default 840 s in `hub.yml`). Before that change, phc-scribe's 600 s default cancelled long drafts, and each of the 3 attempts started over.
- **Check free memory** in Task Manager → Performance → Memory ("Available").

**Faster speech with int8 (recommended; checked on dev and test data, phc-scribe ADR-0032):**
- Step 4's `fetch_models` also installs the int8 builds into `asr-int8/en`, `asr-int8/yo` and `asr-int8/pcm`, each checked to be complete. On its own: `... scribe python -m phc_scribe.fetch_models --only int8`.
- Set these in `hub.env`:
  ```
  PHC_ASR=ct2
  PHC_ASR_INT8_MODELS=en=/models/asr-int8/en,yo=/models/asr-int8/yo,pcm=/models/asr-int8/pcm
  ```
- All three passed their checks: word error rates are within 1 point of fp32, and each clip transcribes 6–7× faster. A language not listed keeps its fp32 model (`PHC_ASR_MODELS`).

**Steps:**
1. Install Docker (Windows: Docker Desktop with WSL2).
2. `cp deploy/compose/hub.env.example deploy/compose/hub.env`, then fill it in. Generate each secret with `openssl rand -base64 32`; never reuse them across clinics.
3. Build the two images, from a `phc-scribe` checkout next to this repo:
   ```bash
   docker build -f ../phc-scribe/deploy/api.Dockerfile -t phc-scribe-api:local ../phc-scribe
   docker compose -f deploy/compose/hub.yml build llm     # llama.cpp b11387, about 10 minutes
   ```
4. Fetch the models into the `models` volume, once, while online (about 8 GB with the int8 builds). The model repos are gated, with automatic approval: accept the N-ATLaS Terms on each model page once, then use a Hugging Face read token of that account, for this one run only:
   ```bash
   docker compose -f deploy/compose/hub.yml --env-file deploy/compose/hub.env \
     run --rm -e HF_TOKEN -e HF_HUB_OFFLINE=0 scribe python -m phc_scribe.fetch_models
   ```
   It installs:
   - `takada-anc.gguf`: the fine-tuned N-ATLaS Q4_K_M. Its SHA-256 must match the published manifest, or it is not installed.
   - `asr-ft/yo` and `asr-ft/pcm`: the fine-tuned N-ATLaS ASR (ADR-0026), each checked to be complete.
   - `NCAIR1/NigerianAccentedEnglish` in the Hugging Face cache under `hf/`, for English.

   After that the hub runs with `HF_HUB_OFFLINE=1`, so a missing model fails loudly instead of downloading.
5. Start the hub with the model:
   ```bash
   docker compose -f deploy/compose/hub.yml --env-file deploy/compose/hub.env --profile model up -d
   ```
   Without `--profile model` (and with `PHC_EXTRACTOR=keyword`), the hub drafts with the keyword extractor only.
6. Check it: `curl -k https://takada-hub.local/readyz` should return `{"ok":true,...}`.

**The hub's name must resolve on the clinic network: check this in the dry run, on the pilot phones.** Nothing in the compose file announces `takada-hub.local`; a phone finds it only if something answers for that name. Pick one before the pilot:
- **Laptop hotspot (simplest).** Windows Mobile Hotspot always gives the laptop `192.168.137.1`. Set `HUB_HOSTNAME=192.168.137.1` in `hub.env`: Caddy then issues the certificate for that address, and phones use `https://192.168.137.1`. No name resolution involved.
- **The laptop's own name.** Windows 10/11 and macOS answer for `<computer-name>.local` by themselves. Set `HUB_HOSTNAME` to that name. Android resolves `.local` names from Android 12; older phones do not, so use the address instead for them.
- **A router with local DNS.** Add `takada-hub.local` → the hub's fixed address.

Test from a pilot phone, on the clinic Wi-Fi, before the day: open `https://<HUB_HOSTNAME>/healthz` in Chrome. It must show `{"ok":true,...}` with no certificate warning (after the CA is installed, below).

**Why HTTPS on a local network.** Phones only allow the microphone and offline mode on a secure origin. The hub's proxy (Caddy) issues the hub's certificate from its own small certificate authority.
- Each phone trusts that authority **once**, at enrolment: Android Settings → Security → Install a certificate (the Android app trusts it too, ADR-0027); iPhone: install the profile, then Settings → General → About → Certificate Trust Settings.
- The root certificate is in the `caddy-data` volume, at `pki/authorities/local/root.crt`.
- Production plan: give each hub a name under a domain we own with a public certificate, so no manual step is needed. This is how Plex and Home Assistant solve the same problem.

## Pair a phone
On the hub:
```bash
curl -sk -X POST https://takada-hub.local/v1/admin/pairing-codes \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"facility": "<HFR code>", "ttlMinutes": 30}'
```
On the phone: Takada → ⚙ Settings → hub address + the 8-character code.
- Codes work once and expire. After 10 wrong codes from one address, pairing pauses for 10 minutes.
- The visit's facility is the one in the pairing code: after pairing, the phone shows and uses that name, whatever was typed at onboarding. Visits started before pairing are accepted under it too.
- A lost phone is cut off at once: `POST /v1/admin/devices/<deviceId>/revoke`.

## Health, monitoring and backups
- **Health checks:**
  - `/healthz`: liveness.
  - `/readyz`: database plus the drafting queue's counts by status; returns 503 if the database is unusable.
- **Logs:** structured JSON with method, route, status and timing only. They never contain clinical text or tokens.
- **Uptime:** the cloud service is checked every 5 minutes with an alert on failure. The service is yet to be chosen at $0 (GitHub Actions schedule or a free uptime monitor); the target SLO is in architecture B6.
- **Backups:**
  - The hub's `takada-data` volume holds the SQLite database and recordings; copy it nightly to external storage.
  - The cloud copy of every synced event is the second copy.
  - Phones never delete an event until the hub has acknowledged it. Recordings and full transcripts are deleted on purpose after their retention time (below), so backups hold them for at most that long plus the backup age.

## Recordings, transcripts and consent (phc-scribe ADR-0033)
- **Consent first:** the new-visit form asks "She agrees to the visit being recorded". Without the tick, the record button is off for that visit and typed notes still work.
- **The phone** deletes its copy of a recording once the hub has stored it and the record's confirmation has reached the hub.
- **The hub** deletes recordings and empties full transcripts (findings and their short quotes stay):
  - `RETAIN_AUDIO_DAYS` (default 7) after a record is confirmed. That is the window for "Correct this record" with a fresh draft; after it, a correction is typed;
  - `RETAIN_UNCONFIRMED_DAYS` (default 30) after an unfinished visit started.
- **The purge runs** at start-up and every hour. It logs counts only, and records each purge in the `purges` table.
- **Before a real pilot:** turn on BitLocker on the hub laptop, check that phones are encrypted (the default on current Android), and complete a data-protection impact assessment with the facility.

## Known limits (honest list)
- **One server replica.** The server stores events in SQLite. Running several replicas in the cloud first needs the move to Postgres (architecture B4); the manifests say so.
- **Drafting throughput under load is not measured yet.** Single drafts are measured (above); a load test against the hub will publish visits per hour per hardware tier (ADR-0023 §3).
- **Clinical content is a draft:** the rules and the visit guide are not for clinical use until the clinical adviser signs them off in the review app.
