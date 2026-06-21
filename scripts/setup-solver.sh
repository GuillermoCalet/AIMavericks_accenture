#!/usr/bin/env bash
# Idempotent setup for the Python OR-Tools solver service.
set -euo pipefail
cd "$(dirname "$0")/.."

SOLVER_DIR="solver"
VENV="$SOLVER_DIR/.venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required but was not found on PATH." >&2
  exit 1
fi

if [ ! -d "$VENV" ]; then
  echo "→ Creating Python virtual environment in $VENV"
  python3 -m venv "$VENV"
fi

echo "→ Installing solver dependencies (OR-Tools, FastAPI, …)"
"$VENV/bin/python" -m pip install --upgrade pip -q
"$VENV/bin/pip" install -q -r "$SOLVER_DIR/requirements.txt"

echo "✓ Solver environment ready. Verifying OR-Tools import…"
"$VENV/bin/python" -c "from ortools.sat.python import cp_model; print('  OR-Tools OK')"
echo "✓ Setup complete."
