#!/usr/bin/env bash
# Launch the FastAPI + OR-Tools solver using the project venv.
set -euo pipefail
cd "$(dirname "$0")/../solver"

if [ ! -x ".venv/bin/uvicorn" ]; then
  echo "Solver venv not found. Run 'npm run setup' first." >&2
  exit 1
fi

PORT="${SOLVER_PORT:-8000}"
exec .venv/bin/uvicorn app:app --host 127.0.0.1 --port "$PORT" --reload
