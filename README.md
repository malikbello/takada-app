# Takada

**An offline-first antenatal visit assistant for Nigeria's primary-health-care workers.**
*Takada* is from the Hausa *takarda*, "paper": the paper that writes itself.

A nurse or community health worker runs an antenatal visit as usual. Takada:
- **records the visit** and drafts the structured record from speech (Yoruba, Pidgin, English) using N-ATLaS;
- **flags danger signs instantly, even offline**, citing the national protocol, with a referral note;
- **guides the visit**: what to ask at this contact, what is already covered, and the follow-ups a finding calls for (from the WHO antenatal guideline and the National Standing Orders, reviewed by the team's nurses; the AI never invents questions);
- **keeps the record** on the phone, syncs it over the clinic Wi-Fi, and exports each visit as FHIR R4.

The health worker confirms every record. Takada never diagnoses or recommends treatment.

> Part of the PHC Scribe entry to the National AI Innovation Challenge 2026 (PS3, sectoral fine-tuning: primary health care). The model, benchmark, rules engine and `/v1` API live in [`malikbello/phc-scribe`](https://github.com/malikbello/phc-scribe); the design decision is its ADR-0023.

## How it fits together
```
Nurse phones ──(clinic Wi-Fi, no internet)──► Clinic hub (a laptop running Docker)
  instant, offline: recording, the record,      sync server + drafting queue
  danger alerts, visit guide                    → PHC Scribe API: speech recognition → fine-tuned
                                                  N-ATLaS 8B (llama.cpp, CPU) → checks → rules
```
- **Phone:** everything that must be instant runs here, offline: recording, the record store, danger-sign rules, the visit guide.
- **Clinic hub:** the heavy step (speech → structured record) as a queue. Never a single point of failure: phones keep working without it, and work waits on the phone.
- **Sync:** append-only, content-addressed events (an amendment points to what it changes), so devices can't conflict or lose data offline. A phone pairs with a hub using a one-time code from the supervisor.
- **Cloud:** the same server runs with `ROLE=cloud` (Kubernetes manifests in `deploy/k8s`), and the PHC Scribe API runs as a private cloud service, for clinics with internet. Hub-to-cloud replication and the monthly DHIS2 report are designed (phc-scribe ADR-0023) but not built yet.

## Repository layout
| Path | What |
|---|---|
| `packages/clinical` | Danger-sign rules engine, text folding and visit guide, ported from phc-scribe and tested against vectors computed by its Python reference. `src/bundle.json` is vendored from phc-scribe (`scripts/sync-bundle.sh`); never edit it here. |
| `apps/mobile` | The phone app (offline-first PWA). |
| `apps/server` | Hub and cloud service: pairing, sync, drafting queue, retention of recordings, FHIR R4 export. |
| `deploy/` | Docker images, Compose for the clinic hub, Kubernetes manifests. |

## Run a clinic hub
Set up a laptop as the hub, pair phones, and run clinic days: [`docs/operations.md`](docs/operations.md).

## Development
```bash
corepack enable            # pnpm, pinned in package.json
pnpm install
./scripts/ci_local.sh      # CI's exact checks; also run by the pre-push hook
```

## Status
**Handoff between work sessions: [`docs/status.md`](docs/status.md)** (and phc-scribe `docs/status.md`, "START HERE").

Clinical content is a **draft, not for clinical use**, until every rule and visit-guide item is signed off by the clinical adviser.

## Licence
- **Code:** [Apache License 2.0](LICENSE).
- **Models** (on the hub, not in this repository): N-ATLaS and its derivatives are governed by the N-ATLaS Terms of Use. See [`NOTICE`](NOTICE).
