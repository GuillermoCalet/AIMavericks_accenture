"""FastAPI wrapper around the deterministic CP-SAT solver core."""

from __future__ import annotations

from fastapi import FastAPI

from models import SolveRequest, SolveResponse
from solver_core import solve

app = FastAPI(title="AI Fashion Copilot — CP-SAT Solver", version="2.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "solver", "engine": "ortools-cp-sat"}


@app.post("/solve", response_model=SolveResponse)
def solve_endpoint(req: SolveRequest) -> SolveResponse:
    return solve(req)
