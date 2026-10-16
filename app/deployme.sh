#!/usr/bin/env bash
# H-06 owner runs this with credentials already provided in the environment.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT/app"
if ! command -v rsconnect >/dev/null 2>&1; then
  echo 'Install deployment tooling first: python3 -m pip install rsconnect-python' >&2
  exit 1
fi
TASK_AUTH_ARGS=()
if [[ -n "${CONNECT_SERVER:-}" && -n "${CONNECT_API_KEY:-}" ]]; then
  TASK_AUTH_ARGS=(--server "$CONNECT_SERVER" --api-key "$CONNECT_API_KEY")
elif [[ -n "${CONNECT_SERVER:-}${CONNECT_API_KEY:-}" ]]; then
  echo 'Set both deployment environment variables, or use your saved rsconnect account.' >&2
  exit 1
fi
rsconnect deploy fastapi "${TASK_AUTH_ARGS[@]}" --entrypoint app:app .
