#!/usr/bin/env bash
# Run from the repository root: bash app/testme.sh
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"
PYTHON_BIN="${PYTHON_BIN:-python3}"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
"$PYTHON_BIN" -c 'import fastapi, uvicorn, app.qc' || {
  echo 'Install backend dependencies: python3 -m pip install -r app/requirements.txt' >&2
  exit 1
}
if [[ "${BACKEND_ONLY:-0}" == '1' ]]; then
  exec "$PYTHON_BIN" -m uvicorn app.app:app --host 127.0.0.1 --port "$API_PORT"
fi
if [[ ! -x app/frontend/node_modules/.bin/vite ]]; then
  echo 'Install frontend dependencies first: npm --prefix app/frontend ci' >&2
  exit 1
fi
api_pid=''
web_pid=''
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$web_pid" ]] || kill "$web_pid" 2>/dev/null || true
  [[ -z "$api_pid" ]] || kill "$api_pid" 2>/dev/null || true
  [[ -z "$web_pid" ]] || wait "$web_pid" 2>/dev/null || true
  [[ -z "$api_pid" ]] || wait "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$PYTHON_BIN" -m uvicorn app.app:app --host 127.0.0.1 --port "$API_PORT" &
api_pid=$!
# Call Vite directly so the process we own is also the process we stop.
VITE_API_URL="http://127.0.0.1:$API_PORT" VITE_MOCK=0 \
  node app/frontend/node_modules/vite/bin/vite.js app/frontend \
  --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort &
web_pid=$!
echo "Frontend: http://127.0.0.1:$FRONTEND_PORT; API docs: http://127.0.0.1:$API_PORT/docs"
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done
echo 'A service stopped; shutting down the other service.' >&2
exit 1
