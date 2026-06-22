#!/usr/bin/env bash
# Start the Ultra PDF backend on port 8000.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  echo "Creating virtualenv…"
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi

exec .venv/bin/uvicorn app.main:app --reload --port "${PORT:-8000}"
