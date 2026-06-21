#!/usr/bin/env bash
# Run the solver's pytest suite using the project venv.
set -euo pipefail
cd "$(dirname "$0")/../solver"

if [ ! -x ".venv/bin/pytest" ]; then
  echo "Solver venv not found. Run 'npm run setup' first." >&2
  exit 1
fi

exec .venv/bin/pytest -q
