"""Pydantic contracts for the OR-Tools CP-SAT solver service.

INTEGER MODEL. Every score arrives scaled by `score_scale` (default 1000) and
every price as integer minor units (cents), because CP-SAT is integer-only. The
TypeScript backend owns the scaling; this service validates and optimizes.

Objective (maximized, all integer):

    Σ x[i]·quality_i                      # weighted soft-preference score
  + Σ y[i,j]·pairScore_ij·pairWeight      # real pairwise compatibility
  + Σ_c completenessBonus·has_c           # outfit completeness (per required cat)
  − priceWeight·Σ x[i]·normPrice_i        # cost (do not spend the whole budget)
  − Σ x[i]·optionalPenalty_i              # discourage unnecessary complements
  − complexityPenalty·Σ x[i]             # discourage oversized outfits
  − diversityWeight·Σ x[i]·appeared_i     # push alternatives apart
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SolverStatus = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN"]


class ScoreVector(BaseModel):
    contextFit: int = 0
    styleFit: int = 0
    colorCompatibility: int = 0
    wardrobeCompatibility: int = 0
    complementarity: int = 0
    versatility: int = 0
    budgetEfficiency: int = 0

    def weighted(self, w: "ScoreVector") -> int:
        return (
            self.contextFit * w.contextFit
            + self.styleFit * w.styleFit
            + self.colorCompatibility * w.colorCompatibility
            + self.wardrobeCompatibility * w.wardrobeCompatibility
            + self.complementarity * w.complementarity
            + self.versatility * w.versatility
            + self.budgetEfficiency * w.budgetEfficiency
        )


class Candidate(BaseModel):
    id: str
    category: str
    price: int = Field(ge=0, description="Integer minor units (cents). Anchors use 0.")
    is_anchor: bool = False
    is_optional: bool = False
    optional_penalty: int = 0
    scores: ScoreVector = ScoreVector()


class PairInput(BaseModel):
    a: str
    b: str
    score: int = Field(ge=0, description="Pair compatibility, scaled 0..score_scale.")


class CategoryLimit(BaseModel):
    category: str
    min: int = 0
    max: int = 99


class ObjectiveConfig(BaseModel):
    weights: ScoreVector = ScoreVector(
        contextFit=1, styleFit=1, colorCompatibility=1, wardrobeCompatibility=1,
        complementarity=1, versatility=1, budgetEfficiency=1,
    )
    pair_weight: int = 1
    completeness_bonus_per_required: int = 0
    complexity_penalty_per_item: int = 0
    price_penalty_weight: int = 0
    diversity_penalty_weight: int = 0
    score_scale: int = 1000


class DiversityConfig(BaseModel):
    max_shared_products: int = 99
    # integer percent (0..100) to keep everything integer/deterministic
    min_quality_ratio_pct: int = 0


class SolveRequest(BaseModel):
    candidates: list[Candidate]
    pairs: list[PairInput] = []
    budget_max: int | None = None
    category_limits: list[CategoryLimit] = []
    completeness_categories: list[str] = []
    anchor_ids: list[str] = []
    exclude_pairs: list[tuple[str, str]] = []
    min_items: int = 1
    max_items: int = 8
    objective: ObjectiveConfig = ObjectiveConfig()
    diversity: DiversityConfig = DiversityConfig()
    max_results: int = 3
    time_limit_s: float = 5.0
    seed: int = 42
    # Relaxation flags set by the backend's progressive ladder (never silent):
    drop_required_categories: bool = False
    min_items_override: int | None = None
    over_budget_allowed: bool = False


class ItemContributionOut(BaseModel):
    product_id: str
    gross_score: int
    penalty: int
    net: int
    optional: bool
    reused: bool
    redundant: bool


class PairOut(BaseModel):
    a: str
    b: str
    score: int


class ObjectiveBreakdownOut(BaseModel):
    quality_score: int
    pair_compatibility_score: int
    completeness_bonus: int
    price_penalty: int
    optional_item_penalty: int
    complexity_penalty: int
    diversity_penalty: int
    final_objective_score: int


class DiversityOut(BaseModel):
    shared_product_count: int
    jaccard_similarity_pct: int
    diversity_penalty: int


class OutfitOut(BaseModel):
    product_ids: list[str]
    objective_score: int
    score_breakdown: ScoreVector
    total_price: int
    over_budget: bool
    item_contributions: list[ItemContributionOut]
    active_pairs: list[PairOut]
    objective_breakdown: ObjectiveBreakdownOut
    diversity: DiversityOut


class SolverMetricsOut(BaseModel):
    candidate_count: int
    pair_variable_count: int
    constraint_count: int
    solve_time_ms: int
    solver_status: SolverStatus


class SolveResponse(BaseModel):
    status: SolverStatus
    evaluated_candidates: int
    solving_time_ms: int
    applied_constraints: list[str]
    rejected_constraints: list[str]
    relaxed_preferences: list[str]
    conflicting_constraints: list[str]
    metrics: SolverMetricsOut
    outfits: list[OutfitOut]
