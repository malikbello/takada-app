# Operating Takada

## The pieces
| Piece | Runs on | What it needs |
|---|---|---|
| Phone app | Any Android phone with Chrome | Nothing installed: it loads from the hub (or the cloud) and installs as an app. Works offline after first load. |
| Clinic hub | Laptop or mini-PC on the clinic Wi-Fi | Docker. `deploy/compose/hub.yml`: Takada server + phc-scribe API (+ the model, when ready) + HTTPS proxy. |
| Cloud | Any container platform (Kubernetes manifests in `deploy/k8s/`) | The same server image with `ROLE=cloud`, and a phc-scribe API with the GPU model. |

## Set up a clinic hub
1. `cp deploy/compose/hub.env.example deploy/compose/hub.env`, then fill it in. Generate each secret with `openssl rand -base64 32`; never reuse them across clinics.
2. Build the phc-scribe API image from the `phc-scribe` repo, tagged `phc-scribe-api:local`.
3. `docker compose -f deploy/compose/hub.yml --env-file deploy/compose/hub.env up -d`
4. Check it: `curl -k https://takada-hub.local/readyz` should return `{"ok":true,...}`.

**Why HTTPS on a local network.** Phones only allow the microphone and offline mode on a secure origin. The hub's proxy (Caddy) issues the hub's certificate from its own small certificate authority.
- Each phone trusts that authority **once**, at enrolment: Android Settings → Security → Install a certificate.
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
