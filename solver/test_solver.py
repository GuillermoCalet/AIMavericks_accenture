"""Pytest suite for the CP-SAT solver core and FastAPI endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import app
from models import (
    Candidate,
    CategoryLimit,
    DiversityConfig,
    ObjectiveConfig,
    PairInput,
    ScoreVector,
    SolveRequest,
)
from solver_core import solve

client = TestClient(app)

WEIGHTS = ScoreVector(
    contextFit=3, styleFit=2, colorCompatibility=2, wardrobeCompatibility=2,
    complementarity=1, versatility=1, budgetEfficiency=1,
)


def _cand(id, category, price, ctx=0, style=0, anchor=False, optional=False, opt_pen=0):
    return Candidate(
        id=id, category=category, price=price, is_anchor=anchor,
        is_optional=optional, optional_penalty=opt_pen,
        scores=ScoreVector(contextFit=ctx, styleFit=style),
    )


def _obj(**kw):
    base = dict(
        weights=WEIGHTS, pair_weight=1, completeness_bonus_per_required=2000,
        complexity_penalty_per_item=1500, price_penalty_weight=3,
        diversity_penalty_weight=1500, score_scale=1000,
    )
    base.update(kw)
    return ObjectiveConfig(**base)


def _request(**kw):
    candidates = [
        _cand("top-a", "top", 3000, ctx=800, style=500),
        _cand("top-b", "top", 2000, ctx=300, style=900),
        _cand("shoe-a", "footwear", 4000, ctx=700),
        _cand("shoe-b", "footwear", 9000, ctx=900),
        _cand("bag-good", "bag", 2000, ctx=1000, style=1000, optional=True, opt_pen=2000),
        _cand("bag-bad", "bag", 9000, ctx=200, optional=True, opt_pen=8000),
        _cand("jeans-anchor", "bottom", 0, ctx=600, anchor=True),
    ]
    pairs = [
        PairInput(a="top-a", b="shoe-a", score=900),
        PairInput(a="top-a", b="bag-good", score=850),
        PairInput(a="jeans-anchor", b="top-a", score=800),
    ]
    defaults = dict(
        candidates=candidates, pairs=pairs, budget_max=20000,
        category_limits=[
            CategoryLimit(category="top", min=1, max=1),
            CategoryLimit(category="footwear", min=1, max=1),
            CategoryLimit(category="bag", min=0, max=1),
            CategoryLimit(category="bottom", min=0, max=1),
        ],
        completeness_categories=["top", "footwear"],
        anchor_ids=["jeans-anchor"], min_items=3, max_items=6,
        objective=_obj(), diversity=DiversityConfig(max_shared_products=2, min_quality_ratio_pct=60),
        max_results=3, time_limit_s=3.0, seed=42,
    )
    defaults.update(kw)
    return SolveRequest(**defaults)


def test_feasible_optimal_and_anchor_included():
    r = solve(_request())
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert len(r.outfits) >= 1
    best = r.outfits[0]
    assert "jeans-anchor" in best.product_ids
    assert sum(1 for p in best.product_ids if p.startswith("shoe")) == 1
    assert best.total_price <= 20000


def test_objective_breakdown_matches_real_score():
    r = solve(_request())
    for o in r.outfits:
        assert o.objective_score == o.objective_breakdown.final_objective_score


def test_y_pair_variables_activate_only_when_both_selected():
    r = solve(_request(max_results=1))
    best = r.outfits[0]
    sel = set(best.product_ids)
    for p in best.active_pairs:
        assert p.a in sel and p.b in sel
    assert r.metrics.pair_variable_count >= 1


def test_compatible_pair_beats_incompatible():
    # two equal-quality tops; only top-a has strong pairs -> top-a wins
    cands = [
        _cand("top-a", "top", 3000, ctx=500),
        _cand("top-c", "top", 3000, ctx=500),
        _cand("shoe-a", "footwear", 4000, ctx=500),
        _cand("anchor", "bottom", 0, ctx=500, anchor=True),
    ]
    pairs = [PairInput(a="top-a", b="shoe-a", score=950), PairInput(a="anchor", b="top-a", score=900)]
    r = solve(_request(candidates=cands, pairs=pairs, completeness_categories=["top", "footwear"],
                       category_limits=[CategoryLimit(category="top", min=1, max=1),
                                        CategoryLimit(category="footwear", min=1, max=1),
                                        CategoryLimit(category="bottom", min=0, max=1)],
                       anchor_ids=["anchor"], min_items=3, max_results=1))
    assert "top-a" in r.outfits[0].product_ids
    assert "top-c" not in r.outfits[0].product_ids


def test_negative_net_optional_is_excluded():
    r = solve(_request())
    for o in r.outfits:
        assert "bag-bad" not in o.product_ids


def test_valuable_optional_is_included_when_allowed():
    # min_items forces one optional; the valuable bag (good pairs, low penalty) is chosen
    r = solve(_request(max_results=1))
    assert "bag-good" in r.outfits[0].product_ids


def test_budget_respected():
    r = solve(_request(budget_max=7000))
    best = r.outfits[0]
    assert best.total_price <= 7000
    assert "shoe-a" in best.product_ids  # expensive shoe unaffordable


def test_minimum_items_policy_drops_optionals():
    # huge optional penalty + no pair bonus -> only required items + anchor
    r = solve(_request(objective=_obj(pair_weight=0, complexity_penalty_per_item=8000),
                       candidates=[
                           _cand("top-a", "top", 3000, ctx=800),
                           _cand("shoe-a", "footwear", 4000, ctx=700),
                           _cand("bag-good", "bag", 2000, ctx=900, optional=True, opt_pen=30000),
                           _cand("jeans-anchor", "bottom", 0, ctx=600, anchor=True),
                       ],
                       pairs=[], min_items=3, max_results=1))
    ids = r.outfits[0].product_ids
    assert "bag-good" not in ids
    assert set(["top-a", "shoe-a", "jeans-anchor"]).issubset(set(ids))


def test_at_most_one_bag_and_exclude_pairs():
    r = solve(_request(exclude_pairs=[("top-a", "shoe-a")]))
    for o in r.outfits:
        assert sum(1 for p in o.product_ids if p.startswith("bag")) <= 1
        assert not ("top-a" in o.product_ids and "shoe-a" in o.product_ids)


def test_multiple_distinct_diverse_outfits():
    r = solve(_request(max_results=3))
    sigs = {tuple(sorted(o.product_ids)) for o in r.outfits}
    assert len(sigs) == len(r.outfits)  # all distinct
    # diversity metrics reported on the alternatives
    if len(r.outfits) > 1:
        assert r.outfits[1].diversity.jaccard_similarity_pct <= 100


def test_infeasible_without_relaxation():
    r = solve(_request(budget_max=1000))
    assert r.status == "INFEASIBLE"
    assert r.outfits == []
    assert "budget_max" in r.conflicting_constraints


def test_explicit_relaxation_drops_required():
    r = solve(_request(budget_max=1000, drop_required_categories=True))
    assert "required_categories" in r.relaxed_preferences


def test_empty_pool_infeasible():
    r = solve(_request(candidates=[], pairs=[], anchor_ids=[], category_limits=[], min_items=0))
    assert r.status == "INFEASIBLE"
    assert "empty_candidate_pool" in r.conflicting_constraints


def test_metrics_reported():
    r = solve(_request())
    assert r.metrics.candidate_count == 7
    assert r.metrics.constraint_count > 0
    assert r.metrics.solver_status in ("OPTIMAL", "FEASIBLE")


def test_health_and_endpoint():
    assert client.get("/health").json()["status"] == "ok"
    body = client.post("/solve", json=_request().model_dump()).json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(body["outfits"]) >= 1
    assert body["metrics"]["pair_variable_count"] >= 1
