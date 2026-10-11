# Takada

**An offline-first antenatal visit assistant for Nigeria's primary-health-care workers.**
*Takada* is from the Hausa *takarda*, "paper": the paper that writes itself.

A nurse or community health worker runs an antenatal visit as usual. Takada:
- **records the visit** and drafts the structured record from speech (Yoruba, Pidgin, English) using N-ATLaS;
- **flags danger signs instantly, even offline**, citing the national protocol, with a referral note;
- **guides the visit**: what to ask at this contact, what is already covered, and the follow-ups a finding calls for (from the WHO antenatal guideline and the National Standing Orders, signed off by a clinician; the AI never invents questions);
- **keeps the record** on the phone, syncs it when there is a network, and exports it as FHIR R4 and the monthly DHIS2 report.

The health worker confirms every record. Takada never diagnoses or recommends treatment.

> Part of the PHC Scribe entry to the National AI Innovation Challenge 2026 (PS3, sectoral fine-tuning: primary health care). The model, benchmark, rules engine and `/v1` API live in [`malikbello/phc-scribe`](https://github.com/malikbello/phc-scribe); the design decision is its ADR-0023.

## How it fits together
```
Nurse phones ──(clinic Wi-Fi)──► Clinic hub (laptop / mini-PC) ──(when online)──► Cloud (master copy) ──► FHIR / DHIS2
  instant, offline: recording,      queue: speech → record with the             fast model when online
  danger alerts, visit guide        local N-ATLaS model
  └──(direct, when online) ──────────────────────────────────────────────────►
```
- **Phone:** everything that must be instant runs here, offline: recording, the record store, danger-sign rules, the visit guide.
- **Clinic hub:** the heavy step (speech → structured record) as a priority queue. Never a single point of failure: phones keep working without it, and work waits on the phone.
- **Cloud:** the master copy, integrations, backups. Used first whenever there is internet.
- **Sync:** append-only, content-addressed events (an amendment points to what it changes), so devices can't conflict or lose data offline. Phones pair with a hub by QR code.

## Repository layout
| Path | What |
|---|---|
| `packages/clinical` | Danger-sign rules engine, text folding and visit guide, ported from phc-scribe and tested against vectors computed by its Python reference. `src/bundle.json` is vendored from phc-scribe (`scripts/sync-bundle.sh`); never edit it here. |
| `apps/mobile` | The phone app (offline-first PWA). |
| `apps/server` | Hub and cloud service: pairing, sync, job queue, FHIR/DHIS2 export. |
| `deploy/` | Docker images, Compose for the clinic hub, Kubernetes manifests. |

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
