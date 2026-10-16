#!/usr/bin/env bash
# Hayden owns the generated manifest; run only during the H-06 handoff.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT/app"
if ! command -v rsconnect >/dev/null 2>&1; then
  echo 'Install deployment tooling first: python3 -m pip install rsconnect-python' >&2
  exit 1
fi
rsconnect write-manifest fastapi . --entrypoint app:app
