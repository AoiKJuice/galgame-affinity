from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl
from scipy import sparse
from scipy.sparse.linalg import svds

from .io import write_json


@dataclass(frozen=True)
class EvalConfig:
    top_k: int = 10
    max_users: int = 2000
    seed: int = 42


def _metrics(recommendations: list[np.ndarray], targets: np.ndarray, catalog_size: int, k: int) -> dict:
    hits = []
    ndcg = []
    recommended: set[int] = set()
    for ranked, target in zip(recommendations, targets, strict=True):
        top = ranked[:k]
        recommended.update(int(value) for value in top)
        positions = np.flatnonzero(top == target)
        hits.append(1.0 if positions.size else 0.0)
        ndcg.append(1.0 / np.log2(float(positions[0]) + 2.0) if positions.size else 0.0)
    return {
        f"HitRate@{k}": float(np.mean(hits)),
        f"Recall@{k}": float(np.mean(hits)),
        f"NDCG@{k}": float(np.mean(ndcg)),
        "catalogCoverage": len(recommended) / max(catalog_size, 1),
    }


def _ndcg_values(recommendations: list[np.ndarray], targets: np.ndarray, k: int) -> np.ndarray:
    values = np.zeros(len(targets), dtype=np.float64)
    for index, (ranked, target) in enumerate(zip(recommendations, targets, strict=True)):
        positions = np.flatnonzero(ranked[:k] == target)
        if positions.size:
            values[index] = 1.0 / np.log2(float(positions[0]) + 2.0)
    return values


def evaluate_explicit(clean_path: Path, output: Path, config: EvalConfig) -> dict:
    frame = pl.read_parquet(clean_path).sort("source_user_id", "rated_at")
    users = frame.select("source_user_id").unique().sort("source_user_id")
    items = frame.select("vndb_id").unique().sort("vndb_id")
    frame = frame.join(users.with_row_index("u"), on="source_user_id").join(items.with_row_index("i"), on="vndb_id")

    candidates = (
        frame.filter(pl.col("rating") >= 7.0)
        .group_by("u")
        .tail(1)
        .sort("u")
    )
    rng = np.random.default_rng(config.seed)
    selected = candidates.get_column("u").to_numpy()
    if len(selected) > config.max_users:
        selected = np.sort(rng.choice(selected, config.max_users, replace=False))
    held_out = candidates.filter(pl.col("u").is_in(selected)).select("u", "i")
    targets_by_user = dict(held_out.iter_rows())
    train = frame.join(held_out, on=["u", "i"], how="anti")
    user_means = train.group_by("u").agg(pl.col("rating").mean().alias("mean"))
    train = train.join(user_means, on="u").with_columns((pl.col("rating") - pl.col("mean")).alias("residual"))
    matrix = sparse.csr_matrix(
        (
            train.get_column("residual").to_numpy().astype(np.float32),
            (train.get_column("u").to_numpy(), train.get_column("i").to_numpy()),
        ),
        shape=(users.height, items.height),
    )
    seen = sparse.csr_matrix(
        (
            np.ones(train.height, dtype=np.float32),
            (train.get_column("u").to_numpy(), train.get_column("i").to_numpy()),
        ),
        shape=matrix.shape,
    )
    popularity = np.asarray(seen.sum(axis=0)).ravel()
    popularity_rank = np.argsort(-popularity)

    models: dict[str, list[np.ndarray]] = {"bayesian-popularity": [], "mean-centered-userknn": [], "surprise-userknn": [], "residual-mf": []}
    item_counts = np.maximum(popularity, 1.0)
    iuf = np.log((matrix.shape[0] + 1.0) / (item_counts + 1.0))
    weighted_matrix = matrix.multiply(iuf).tocsr()
    dimensions = min(48, min(matrix.shape) - 1)
    _, singular, vt = svds(matrix, k=dimensions, random_state=config.seed)
    order = np.argsort(singular)[::-1]
    user_factors = matrix @ vt[order].T
    item_factors = vt[order].T

    evaluation_users = np.array(sorted(targets_by_user), dtype=np.int64)
    for user in evaluation_users:
        seen_items = set(matrix[user].indices.tolist())
        models["bayesian-popularity"].append(np.array([item for item in popularity_rank if item not in seen_items], dtype=np.int64))
        for name, source in (("mean-centered-userknn", matrix), ("surprise-userknn", weighted_matrix)):
            query = source[user]
            similarities = (source @ query.T).toarray().ravel()
            overlaps = ((seen > 0) @ (seen[user] > 0).T).toarray().ravel()
            similarities *= overlaps / (overlaps + 10.0)
            neighbors = np.argpartition(similarities, -50)[-50:]
            scores = similarities[neighbors] @ matrix[neighbors]
            dense_scores = np.asarray(scores).ravel()
            dense_scores[list(seen_items)] = -np.inf
            models[name].append(np.argsort(-dense_scores))
        mf_scores = user_factors[user] @ item_factors.T
        mf_scores[list(seen_items)] = -np.inf
        models["residual-mf"].append(np.argsort(-mf_scores))

    targets = np.array([targets_by_user[int(user)] for user in evaluation_users])
    positive_popularity = popularity[popularity > 0]
    long_tail_threshold = float(np.quantile(positive_popularity, 0.8)) if positive_popularity.size else 0.0
    long_tail = set(np.flatnonzero(popularity <= long_tail_threshold).tolist())
    user_mainstream = np.array([
        float(np.mean(np.log1p(popularity[matrix[int(user)].indices]))) if matrix[int(user)].indices.size else 0.0
        for user in evaluation_users
    ])
    lowpop_mask = user_mainstream <= np.quantile(user_mainstream, 1 / 3)
    model_metrics: dict[str, dict] = {}
    for name, ranks in models.items():
        values = {**_metrics(ranks, targets, items.height, 10), **_metrics(ranks, targets, items.height, 20)}
        recommended_long_tail = {int(item) for ranked in ranks for item in ranked[:10] if int(item) in long_tail}
        values["longTailCoverage@10"] = len(recommended_long_tail) / max(len(long_tail), 1)
        values["LowPopNDCG@10"] = float(np.mean(_ndcg_values(ranks, targets, 10)[lowpop_mask]))
        model_metrics[name] = values

    baseline = _ndcg_values(models["mean-centered-userknn"], targets, 10)
    selected = _ndcg_values(models["residual-mf"], targets, 10)
    differences = selected - baseline
    bootstrap = np.empty(1000, dtype=np.float64)
    for index in range(len(bootstrap)):
        sample = rng.integers(0, len(differences), len(differences))
        bootstrap[index] = float(np.mean(differences[sample]))

    report = {
        "users": len(evaluation_users),
        "items": items.height,
        "protocol": "latest-high-rating-held-out",
        "long_tail_item_max_interactions": long_tail_threshold,
        "lowpop_users": int(lowpop_mask.sum()),
        "models": model_metrics,
        "selected_vs_userknn_ndcg10": {
            "mean_difference": float(np.mean(differences)),
            "bootstrap_95_ci": [float(np.quantile(bootstrap, 0.025)), float(np.quantile(bootstrap, 0.975))],
            "samples": len(bootstrap),
        },
    }
    write_json(output, report)
    return report
