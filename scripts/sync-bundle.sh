#!/usr/bin/env bash
# Vendor the clinical bundle from a phc-scribe checkout (default: ../phc-scribe) and pin
# its checksum. The bundle is generated and tested there (scripts/export_clinical_bundle.py);
# never edit it here. Run the tests afterwards: they replay its vectors against the port.
set -euo pipefail
src="${1:-../phc-scribe}/exports/clinical-bundle.json"
dest="$(git rev-parse --show-toplevel)/packages/clinical/src"
cp "$src" "$dest/bundle.json"
sha256sum "$dest/bundle.json" | cut -d' ' -f1 > "$dest/bundle.sha256"
echo "bundle synced: $(cat "$dest/bundle.sha256")"
