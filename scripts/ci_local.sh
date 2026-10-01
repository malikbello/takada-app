#!/usr/bin/env bash
# Run CI's exact checks locally (also run by .githooks/pre-push; a failing push is blocked).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pnpm install --frozen-lockfile --silent
pnpm audit --prod --audit-level high
pnpm -r typecheck
pnpm -r test
pnpm -r build
echo "ci_local: all checks passed"
