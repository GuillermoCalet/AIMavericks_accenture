"""Deterministic CP-SAT optimization core (pure, import-friendly for pytest).

The LLM never reaches this code. Given real candidate products, real pairwise
compatibility scores and a fully specified integer objective, OR-Tools CP-SAT
selects the optimal combination — and several *diverse* alternatives.

Variables
    x[i] ∈ {0,1}   product i selected
    y[i,j] ∈ {0,1} both i and j selected (linearized: y≤x[i], y≤x[j], y≥x[i]+x[j]−1)
    has_c ∈ {0,1}  required category c present (has_c ≤ Σ members)

See models.py for the full objective. Relaxation flags are set by the backend's
progressive ladder; this core never relaxes anything on its own.
"""

from __future__ import annotations

import time

from ortools.sat.python import cp_model

from models import (
    DiversityOut,
    ItemContributionOut,
    ObjectiveBreakdownOut,
    OutfitOut,
    PairOut,
    ScoreVector,
    SolveRequest,
    SolveResponse,
    SolverMetricsOut,
)

_STATUS_MAP = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.MODEL_INVALID: "MODEL_INVALID",
    cp_model.UNKNOWN: "UNKNOWN",
}


def _budget_ref(req: SolveRequest) -> int:
    if req.budget_max and req.budget_max > 0:
        return req.budget_max
    prices = [c.price for c in req.candidates if c.price > 0]
    return max(prices) if prices else 1


class _Coeffs:
    """Pre-computed integer objective coefficients (identical to what is summed
    into the CP-SAT objective, so the reported breakdown matches exactly)."""

    def __init__(self, req: SolveRequest, previous: list[set[str]]):
        obj = req.objective
        ref = _budget_ref(req)
        self.quality: dict[str, int] = {}
        self.price_pen: dict[str, int] = {}
        self.optional_pen: dict[str, int] = {}
        self.div_pen: dict[str, int] = {}
        for c in req.candidates:
            self.quality[c.id] = c.scores.weighted(obj.weights)
            norm_price = round(obj.score_scale * c.price / ref) if ref else 0
            self.price_pen[c.id] = obj.price_penalty_weight * norm_price
            self.optional_pen[c.id] = c.optional_penalty if c.is_optional else 0
            appeared = 0 if c.is_anchor else sum(1 for s in previous if c.id in s)
            self.div_pen[c.id] = obj.diversity_penalty_weight * appeared
        self.complexity = obj.complexity_penalty_per_item

    def item_coeff(self, cid: str) -> int:
        return (
            self.quality[cid]
            - self.price_pen[cid]
            - self.optional_pen[cid]
            - self.complexity
            - self.div_pen[cid]
        )


def _build(req: SolveRequest, previous: list[set[str]], quality_floor: int | None):
    model = cp_model.CpModel()
    cand_by_id = {c.id: c for c in req.candidates}
    ids = list(cand_by_id.keys())
    x = {cid: model.NewBoolVar(f"x_{cid}") for cid in ids}
    coeffs = _Coeffs(req, previous)
    applied: list[str] = []

    obj = req.objective

    # --- pair variables y[i,j] (linearized) -------------------------------
    excluded = {frozenset(p) for p in req.exclude_pairs}
    y_vars: list[tuple[str, str, cp_model.IntVar, int]] = []
    for p in req.pairs:
        if p.a not in x or p.b not in x or p.a == p.b:
            continue
        if frozenset((p.a, p.b)) in excluded:
            continue
        y = model.NewBoolVar(f"y_{p.a}_{p.b}")
        model.Add(y <= x[p.a])
        model.Add(y <= x[p.b])
        model.Add(y >= x[p.a] + x[p.b] - 1)
        y_vars.append((p.a, p.b, y, p.score * obj.pair_weight))
    if y_vars:
        applied.append("pair_compatibility")

    # --- anchors (immutable hard) -----------------------------------------
    for aid in req.anchor_ids:
        if aid in x:
            model.Add(x[aid] == 1)
    if req.anchor_ids:
        applied.append("anchor_inclusion")

    # --- budget (immutable hard, unless explicitly authorized) ------------
    if req.budget_max is not None and not req.over_budget_allowed:
        model.Add(sum(cand_by_id[i].price * x[i] for i in ids) <= req.budget_max)
        applied.append("budget_max")

    # --- category min/max -------------------------------------------------
    for lim in req.category_limits:
        members = [x[c.id] for c in req.candidates if c.category == lim.category]
        if not members:
            if lim.min > 0 and not req.drop_required_categories:
                model.AddBoolOr([])  # required category with no candidates -> infeasible
            continue
        model.Add(sum(members) <= lim.max)
        applied.append(f"category_max:{lim.category}<={lim.max}")
        if lim.min > 0 and not req.drop_required_categories:
            model.Add(sum(members) >= lim.min)
            applied.append(f"category_min:{lim.category}>={lim.min}")

    # --- incompatible pairs (immutable hard) ------------------------------
    for a, b in req.exclude_pairs:
        if a in x and b in x:
            model.Add(x[a] + x[b] <= 1)
    if req.exclude_pairs:
        applied.append("exclude_pairs")

    # --- item count -------------------------------------------------------
    eff_min = req.min_items_override if req.min_items_override is not None else req.min_items
    eff_min = max(0, eff_min)
    if eff_min > 0:
        model.Add(sum(x.values()) >= eff_min)
    model.Add(sum(x.values()) <= req.max_items)
    applied.append("item_count")

    # --- completeness bonus bools ----------------------------------------
    has_vars: list[cp_model.IntVar] = []
    if obj.completeness_bonus_per_required > 0:
        for cat in req.completeness_categories:
            members = [x[c.id] for c in req.candidates if c.category == cat]
            if not members:
                continue
            h = model.NewBoolVar(f"has_{cat}")
            model.Add(h <= sum(members))
            has_vars.append(h)
        if has_vars:
            applied.append("completeness_bonus")

    # --- diversity vs previous outfits -----------------------------------
    # Bound how many NON-ANCHOR products an alternative may share with each
    # previous outfit, and forbid repeating the exact same non-anchor set.
    if previous:
        for prev in previous:
            shared = [x[i] for i in prev if i in x and not cand_by_id[i].is_anchor]
            if shared:
                cap = min(req.diversity.max_shared_products, max(0, len(shared) - 1))
                model.Add(sum(shared) <= cap)
        applied.append("diversity_max_shared")

    # quality expression (for the quality floor + breakdown)
    quality_expr = sum(coeffs.quality[c.id] * x[c.id] for c in req.candidates)
    pairs_expr = sum(coeff * y for (_, _, y, coeff) in y_vars)
    quality_total_expr = quality_expr + pairs_expr
    if quality_floor is not None:
        model.Add(quality_total_expr >= quality_floor)
        applied.append("min_quality_ratio")

    # --- objective --------------------------------------------------------
    objective = sum(coeffs.item_coeff(c.id) * x[c.id] for c in req.candidates)
    objective += pairs_expr
    objective += obj.completeness_bonus_per_required * sum(has_vars)
    model.Maximize(objective)

    return model, x, y_vars, has_vars, coeffs, cand_by_id


def _solve_once(model: cp_model.CpModel, req: SolveRequest):
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = req.time_limit_s
    solver.parameters.random_seed = req.seed
    solver.parameters.num_search_workers = 1  # deterministic
    status = solver.Solve(model)
    return status, solver


def _make_outfit(
    req: SolveRequest,
    coeffs: _Coeffs,
    cand_by_id: dict,
    selected: list[str],
    active_pairs: list[tuple[str, str, int]],
    objective_value: int,
    previous: list[set[str]],
) -> OutfitOut:
    obj = req.objective
    sel = set(selected)

    # aggregate score breakdown (sum of raw dimension scores over the selection)
    agg = ScoreVector()
    for cid in selected:
        s = cand_by_id[cid].scores
        agg.contextFit += s.contextFit
        agg.styleFit += s.styleFit
        agg.colorCompatibility += s.colorCompatibility
        agg.wardrobeCompatibility += s.wardrobeCompatibility
        agg.complementarity += s.complementarity
        agg.versatility += s.versatility
        agg.budgetEfficiency += s.budgetEfficiency

    quality_score = sum(coeffs.quality[cid] for cid in selected)
    pair_score = sum(p[2] for p in active_pairs)
    # completeness actually realized
    completeness = 0
    if obj.completeness_bonus_per_required > 0:
        for cat in req.completeness_categories:
            if any(cand_by_id[cid].category == cat for cid in selected):
                completeness += obj.completeness_bonus_per_required
    price_penalty = sum(coeffs.price_pen[cid] for cid in selected)
    optional_penalty = sum(coeffs.optional_pen[cid] for cid in selected)
    complexity_penalty = coeffs.complexity * len(selected)
    diversity_penalty = sum(coeffs.div_pen[cid] for cid in selected)
    final = (
        quality_score + pair_score + completeness
        - price_penalty - optional_penalty - complexity_penalty - diversity_penalty
    )

    # per-item contributions (pair bonus split evenly between the two members)
    pair_share: dict[str, int] = {}
    for a, b, sc in active_pairs:
        pair_share[a] = pair_share.get(a, 0) + sc // 2
        pair_share[b] = pair_share.get(b, 0) + sc // 2
    contributions: list[ItemContributionOut] = []
    for cid in selected:
        c = cand_by_id[cid]
        gross = coeffs.quality[cid] + pair_share.get(cid, 0)
        penalty = (
            coeffs.price_pen[cid] + coeffs.optional_pen[cid]
            + coeffs.complexity + coeffs.div_pen[cid]
        )
        net = gross - penalty
        contributions.append(
            ItemContributionOut(
                product_id=cid,
                gross_score=gross,
                penalty=penalty,
                net=net,
                optional=c.is_optional,
                reused=c.is_anchor,
                redundant=c.is_optional and net <= 0,
            )
        )

    total_price = sum(cand_by_id[cid].price for cid in selected)
    over_budget = req.budget_max is not None and total_price > req.budget_max

    # diversity metrics vs the most similar previous outfit
    shared_count = 0
    jaccard_pct = 0
    if previous:
        best_overlap = 0.0
        for prev in previous:
            inter = len(sel & prev)
            union = len(sel | prev) or 1
            non_anchor_shared = len([i for i in (sel & prev) if not cand_by_id[i].is_anchor])
            shared_count = max(shared_count, non_anchor_shared)
            best_overlap = max(best_overlap, inter / union)
        jaccard_pct = round(best_overlap * 100)

    return OutfitOut(
        product_ids=selected,
        objective_score=objective_value,
        score_breakdown=agg,
        total_price=total_price,
        over_budget=over_budget,
        item_contributions=contributions,
        active_pairs=[PairOut(a=a, b=b, score=sc) for (a, b, sc) in active_pairs],
        objective_breakdown=ObjectiveBreakdownOut(
            quality_score=quality_score,
            pair_compatibility_score=pair_score,
            completeness_bonus=completeness,
            price_penalty=price_penalty,
            optional_item_penalty=optional_penalty,
            complexity_penalty=complexity_penalty,
            diversity_penalty=diversity_penalty,
            final_objective_score=final,
        ),
        diversity=DiversityOut(
            shared_product_count=shared_count,
            jaccard_similarity_pct=jaccard_pct,
            diversity_penalty=diversity_penalty,
        ),
    )


def _empty_response(reason: str, n: int, ms: int, status: str = "INFEASIBLE") -> SolveResponse:
    return SolveResponse(
        status=status,
        evaluated_candidates=n,
        solving_time_ms=ms,
        applied_constraints=[],
        rejected_constraints=[],
        relaxed_preferences=[],
        conflicting_constraints=[reason],
        metrics=SolverMetricsOut(
            candidate_count=n, pair_variable_count=0, constraint_count=0,
            solve_time_ms=ms, solver_status=status,
        ),
        outfits=[],
    )


def solve(req: SolveRequest) -> SolveResponse:
    started = time.perf_counter()
    if not req.candidates:
        return _empty_response("empty_candidate_pool", 0, 0)

    relaxed: list[str] = []
    if req.drop_required_categories:
        relaxed.append("required_categories")
    if req.min_items_override is not None and req.min_items_override < req.min_items:
        relaxed.append("min_items")
    if req.over_budget_allowed:
        relaxed.append("budget_max")

    outfits: list[OutfitOut] = []
    previous: list[set[str]] = []
    quality_floor: int | None = None
    last_status = cp_model.UNKNOWN
    applied: list[str] = []
    pair_var_count = 0
    constraint_count = 0

    for k in range(max(1, req.max_results)):
        model, x, y_vars, _has, coeffs, cand_by_id = _build(req, previous, quality_floor)
        status, solver = _solve_once(model, req)
        if k == 0:
            last_status = status
            applied = []  # captured below from a fresh build's applied list
            pair_var_count = len(y_vars)
            constraint_count = len(model.Proto().constraints)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            break
        selected = [cid for cid in x if solver.Value(x[cid]) == 1]
        if not selected:
            break
        active_pairs = [(a, b, sc) for (a, b, yv, sc) in y_vars if solver.Value(yv) == 1]
        outfit = _make_outfit(
            req, coeffs, cand_by_id, selected, active_pairs,
            int(solver.ObjectiveValue()), previous,
        )
        outfits.append(outfit)
        previous.append(set(selected))

        if k == 0:
            # set the minimum-quality floor for the diverse alternatives
            qpart = outfit.objective_breakdown.quality_score + outfit.objective_breakdown.pair_compatibility_score
            quality_floor = qpart * req.diversity.min_quality_ratio_pct // 100

    # capture applied-constraint names from a representative build
    repr_model, _x, _y, _h, _c, _cb = _build(req, [], None)
    applied = _applied_names(req, repr_model, _y)

    if not outfits:
        conflicts = []
        if req.budget_max is not None and not req.over_budget_allowed:
            conflicts.append("budget_max")
        if req.anchor_ids:
            conflicts.append("anchor_inclusion")
        if any(l.max < 99 for l in req.category_limits):
            conflicts.append("category_max")
        if req.exclude_pairs:
            conflicts.append("exclude_pairs")
        ms = int((time.perf_counter() - started) * 1000)
        return SolveResponse(
            status="INFEASIBLE",
            evaluated_candidates=len(req.candidates),
            solving_time_ms=ms,
            applied_constraints=applied,
            rejected_constraints=[],
            relaxed_preferences=relaxed,
            conflicting_constraints=conflicts or ["unknown"],
            metrics=SolverMetricsOut(
                candidate_count=len(req.candidates), pair_variable_count=pair_var_count,
                constraint_count=constraint_count, solve_time_ms=ms,
                solver_status=_STATUS_MAP.get(last_status, "UNKNOWN"),
            ),
            outfits=[],
        )

    ms = int((time.perf_counter() - started) * 1000)
    return SolveResponse(
        status=_STATUS_MAP.get(last_status, "UNKNOWN"),
        evaluated_candidates=len(req.candidates),
        solving_time_ms=ms,
        applied_constraints=applied,
        rejected_constraints=[],
        relaxed_preferences=relaxed,
        conflicting_constraints=[],
        metrics=SolverMetricsOut(
            candidate_count=len(req.candidates), pair_variable_count=pair_var_count,
            constraint_count=constraint_count, solve_time_ms=ms,
            solver_status=_STATUS_MAP.get(last_status, "UNKNOWN"),
        ),
        outfits=outfits,
    )


def _applied_names(req: SolveRequest, model, y_vars) -> list[str]:
    names: list[str] = []
    if y_vars:
        names.append("pair_compatibility")
    if req.anchor_ids:
        names.append("anchor_inclusion")
    if req.budget_max is not None and not req.over_budget_allowed:
        names.append("budget_max")
    for lim in req.category_limits:
        if any(c.category == lim.category for c in req.candidates):
            names.append(f"category_max:{lim.category}<={lim.max}")
            if lim.min > 0 and not req.drop_required_categories:
                names.append(f"category_min:{lim.category}>={lim.min}")
    if req.exclude_pairs:
        names.append("exclude_pairs")
    names.append("item_count")
    if req.objective.completeness_bonus_per_required > 0 and req.completeness_categories:
        names.append("completeness_bonus")
    return names
