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
 cloud copy (optional) → FHIR / DHIS2
```

**What runs where:**
- **On the phone, always offline:** recording, the visit guide (what to ask next, the summary so far, follow-ups) and the danger-sign rules. A danger sign is flagged on the phone even if the hub is off.
- **On the hub, offline:** speech to text (fine-tuned N-ATLaS ASR, Whisper-Small) and the note draft (fine-tuned N-ATLaS 8B, 4-bit, llama.cpp on the CPU). The draft returns to the phone, and the nurse confirms it.
- **In the cloud, only when online:** a second copy of the records and reporting (FHIR, DHIS2).

**Hardware (reference: Dell Latitude 5400, i7-8665U, 16 GB RAM, no GPU):**
- 16 GB RAM: the 8B model takes about 5 GB in 4-bit. 8 GB laptops cannot run it.
- About 25 GB free disk for models, images and records.
- **Speed:**
  - Speech to text runs at roughly real time on 4 CPU cores (a 6 s clip takes about 8 s), so a 10-minute visit takes about 13 minutes.
  - The note draft is not measured yet (laptop latency is scheduled for 7 Oct).
  - Drafts are queued, so the nurse carries on with the next patient. One hub serves several nurses at a small clinic; the load test will give the number per hardware tier.
- **Power:** the laptop battery covers outages; a small UPS or solar pack keeps the router up.

**Steps:**
1. Install Docker (Windows: Docker Desktop with WSL2).
2. `cp deploy/compose/hub.env.example deploy/compose/hub.env`, then fill it in. Generate each secret with `openssl rand -base64 32`; never reuse them across clinics.
3. Build the phc-scribe API image from the `phc-scribe` repo, tagged `phc-scribe-api:local`. Copy the models into the `models` volume: the ASR models and `takada-anc.gguf`. This is a one-time download while online; after that, nothing needs the internet.
4. Start the hub. Without `--profile model`, the hub uses the keyword extractor:
   ```bash
   docker compose -f deploy/compose/hub.yml --env-file deploy/compose/hub.env --profile model up -d
   ```
5. Check it: `curl -k https://takada-hub.local/readyz` should return `{"ok":true,...}`.

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
- Codes work once and expire.
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
  - Phones never delete an event until the hub has acknowledged it.

## Known limits (honest list)
- **One server replica.** The server stores events in SQLite. Running several replicas in the cloud first needs the move to Postgres (architecture B4); the manifests say so.
- **Drafting throughput on a laptop CPU is not measured yet.** A load test against the hub will publish visits per hour per hardware tier (ADR-0023 §3).
- **Clinical content is a draft:** the rules and the visit guide are not for clinical use until the clinical adviser signs them off in the review app.
