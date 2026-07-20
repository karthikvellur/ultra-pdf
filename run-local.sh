#!/usr/bin/env bash
# Runs the full Ultra PDF stack locally: backend (FastAPI) + frontend (Vite).
#
# Usage:
#   ./run-local.sh              # start both, foreground, Ctrl+C stops both
#   ./run-local.sh --backend    # backend only
#   ./run-local.sh --frontend   # frontend only
#
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000  (health: /api/health)
set -uo pipefail
cd "$(dirname "$0")"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
RUN_BACKEND=1
RUN_FRONTEND=1

case "${1:-}" in
  --backend) RUN_FRONTEND=0 ;;
  --frontend) RUN_BACKEND=0 ;;
  -h|--help)
    sed -n '2,10p' "$0"
    exit 0
    ;;
esac

BACKEND_PID=""
FRONTEND_PID=""
CLEANED_UP=0

cleanup() {
  # trap fires on INT/TERM *and* the subsequent EXIT — guard so we only print
  # and kill once.
  [[ "$CLEANED_UP" -eq 1 ]] && return
  CLEANED_UP=1
  echo ""
  echo "Stopping ..."
  # Kill by port, not just $!: npm/uvicorn --reload spawn child processes that
  # don't always die with the wrapper's PID.
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null
  lsof -ti:"$FRONTEND_PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null
  lsof -ti:"$BACKEND_PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null
  wait 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT INT TERM

wait_for() {
  local url="$1" label="$2" tries=60
  until curl -sf "$url" >/dev/null 2>&1; do
    tries=$((tries - 1))
    if [[ "$tries" -le 0 ]]; then
      echo "✖ $label did not become ready in time (tried: $url)"
      return 1
    fi
    sleep 1
  done
  echo "✓ $label ready"
}

port_in_use() {
  lsof -ti:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

if [[ "$RUN_BACKEND" -eq 1 ]]; then
  if port_in_use "$BACKEND_PORT"; then
    echo "⚠ Port $BACKEND_PORT already in use — assuming backend is already running."
  else
    echo "Starting backend on :${BACKEND_PORT} ..."
    if [[ ! -d backend/.venv ]]; then
      echo "Creating backend virtualenv (first run only) ..."
      python3 -m venv backend/.venv
      backend/.venv/bin/pip install --upgrade pip >/dev/null
      backend/.venv/bin/pip install -r backend/requirements.txt
    fi
    (
      cd backend
      exec .venv/bin/uvicorn app.main:app --reload --port "$BACKEND_PORT"
    ) &
    BACKEND_PID=$!
    wait_for "http://localhost:$BACKEND_PORT/api/health" "Backend" || {
      echo "  Check that ghostscript/qpdf/tesseract/poppler are installed (brew install ghostscript tesseract qpdf poppler)."
      exit 1
    }
  fi
fi

if [[ "$RUN_FRONTEND" -eq 1 ]]; then
  if port_in_use "$FRONTEND_PORT"; then
    echo "⚠ Port $FRONTEND_PORT already in use — assuming frontend is already running."
  else
    echo "Starting frontend on :${FRONTEND_PORT} ..."
    npm run dev -- --port "$FRONTEND_PORT" &
    FRONTEND_PID=$!
    wait_for "http://localhost:$FRONTEND_PORT" "Frontend" || exit 1
  fi
fi

echo ""
echo "──────────────────────────────────────────"
[[ "$RUN_FRONTEND" -eq 1 ]] && echo "  Frontend:  http://localhost:$FRONTEND_PORT"
[[ "$RUN_BACKEND" -eq 1 ]]  && echo "  Backend:   http://localhost:$BACKEND_PORT/api/health"
echo "──────────────────────────────────────────"
echo "Press Ctrl+C to stop."
echo ""

wait
