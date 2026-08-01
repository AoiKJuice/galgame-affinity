from __future__ import annotations

import gzip
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl
from scipy import sparse
from scipy.sparse.linalg import svds

from .binary import write_explicit_index, write_mf_index
from .io import write_json


@dataclass(frozen=True)
class ExplicitConfig:
    min_user_ratings: int = 20
    min_user_std: float = 0.75
    min_user_bins: int = 3
    min_item_ratings: int = 5
    bias_regularization: float = 10.0
    mf_dimensions: int = 48


def read_votes(path: Path) -> pl.DataFrame:
    rows: list[tuple[int, int, float, str | None]] = []
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip().split(" ")
            if len(parts) < 3:
                continue
            score = int(parts[2]) / 10.0
            if 1.0 <= score <= 10.0:
                rows.append(
                    (
                        int(parts[1].removeprefix("u")),
                        int(parts[0].removeprefix("v")),
                        score,
                        parts[3] if len(parts) > 3 else None,
                    )
                )
    return pl.DataFrame(
        rows,
        schema={
            "source_user_id": pl.UInt32,
            "vndb_id": pl.UInt32,
            "rating": pl.Float32,
            "rated_at": pl.String,
        },
        orient="row",
    )


def _eligible_users(frame: pl.DataFrame, config: ExplicitConfig) -> pl.DataFrame:
    return (
        frame.group_by("source_user_id")
        .agg(
            pl.len().alias("rating_count"),
            pl.col("rating").std(ddof=0).alias("rating_std"),
            pl.col("rating").round(0).n_unique().alias("rating_bins"),
        )
        .filter(
            (pl.col("rating_count") >= config.min_user_ratings)
            & (pl.col("rating_std") >= config.min_user_std)
            & (pl.col("rating_bins") >= config.min_user_bins)
        )
        .select("source_user_id")
    )


def clean_ratings(frame: pl.DataFrame, config: ExplicitConfig) -> pl.DataFrame:
    eligible = _eligible_users(frame, config)
    filtered = frame.join(eligible, on="source_user_id", how="semi")
    items = (
        filtered.group_by("vndb_id")
        .len(name="item_count")
        .filter(pl.col("item_count") >= config.min_item_ratings)
        .select("vndb_id")
    )
    filtered = filtered.join(items, on="vndb_id", how="semi")
    return filtered.join(_eligible_users(filtered, config), on="source_user_id", how="semi")


def build_explicit(votes_path: Path, output_dir: Path, config: ExplicitConfig) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    ratings = clean_ratings(read_votes(votes_path), config)
    global_mean = float(ratings.get_column("rating").mean())

    user_stats = (
        ratings.group_by("source_user_id")
        .agg(pl.len().alias("n"), pl.col("rating").sum().alias("sum"))
        .sort("source_user_id")
        .with_row_index("user_index")
        .with_columns(
            ((pl.col("sum") - pl.col("n") * global_mean) / (pl.col("n") + config.bias_regularization)).alias("user_bias")
        )
    )
    calibrated = ratings.join(
        user_stats.select("source_user_id", "user_index", "user_bias"),
        on="source_user_id",
    )
    item_stats = (
        calibrated.with_columns((pl.col("rating") - global_mean - pl.col("user_bias")).alias("centered"))
        .group_by("vndb_id")
        .agg(pl.len().alias("n"), pl.col("centered").sum().alias("sum"))
        .sort("vndb_id")
        .with_row_index("item_index")
        .with_columns((pl.col("sum") / (pl.col("n") + config.bias_regularization)).alias("item_bias"))
    )
    calibrated = calibrated.join(
        item_stats.select("vndb_id", "item_index", "item_bias"),
        on="vndb_id",
    ).with_columns(
        (pl.col("rating") - global_mean - pl.col("user_bias") - pl.col("item_bias")).alias("raw_residual")
    )
    user_scale = calibrated.group_by("user_index").agg(
        pl.col("raw_residual").std(ddof=0).fill_null(0.5).clip(lower_bound=0.5).alias("scale")
    )
    calibrated = calibrated.join(user_scale, on="user_index").with_columns(
        (pl.col("raw_residual") / pl.col("scale")).cast(pl.Float32).alias("residual")
    )

    by_user = calibrated.sort("user_index", "item_index")
    user_index = by_user.get_column("user_index").to_numpy().astype(np.uint32)
    user_counts = np.bincount(user_index, minlength=user_stats.height).astype(np.uint32)
    user_offsets = np.concatenate((np.array([0], dtype=np.uint32), np.cumsum(user_counts, dtype=np.uint32)))

    by_item = calibrated.sort("item_index", "user_index")
    item_index = by_item.get_column("item_index").to_numpy().astype(np.uint32)
    item_counts = np.bincount(item_index, minlength=item_stats.height).astype(np.uint32)
    item_offsets = np.concatenate((np.array([0], dtype=np.uint32), np.cumsum(item_counts, dtype=np.uint32)))
    residuals_by_item = by_item.get_column("residual").to_numpy().astype(np.float32)

    n_users = user_stats.height
    iuf = np.log((n_users + 1.0) / (item_counts.astype(np.float32) + 1.0)).astype(np.float32)
    surprises = np.zeros((item_stats.height, 3), dtype=np.float32)
    for item in range(item_stats.height):
        values = residuals_by_item[item_offsets[item] : item_offsets[item + 1]]
        buckets = np.where(values <= -0.75, 0, np.where(values >= 0.75, 2, 1))
        counts = np.bincount(buckets, minlength=3).astype(np.float32)
        surprises[item] = -np.log((counts + 1.0) / (len(values) + 3.0))

    index_path = output_dir / "explicit-knn.bin"
    write_explicit_index(
        index_path,
        item_ids=item_stats.get_column("vndb_id").to_numpy().astype(np.uint32),
        user_offsets=user_offsets,
        user_items=by_user.get_column("item_index").to_numpy().astype(np.uint32),
        user_values=by_user.get_column("residual").to_numpy().astype(np.float32),
        item_offsets=item_offsets,
        item_users=by_item.get_column("user_index").to_numpy().astype(np.uint32),
        item_values=residuals_by_item,
        item_iuf=iuf,
        item_surprise=surprises,
    )

    matrix = sparse.csr_matrix(
        (
            by_user.get_column("residual").to_numpy().astype(np.float32),
            (
                by_user.get_column("user_index").to_numpy(),
                by_user.get_column("item_index").to_numpy(),
            ),
        ),
        shape=(user_stats.height, item_stats.height),
    )
    dimensions = min(config.mf_dimensions, min(matrix.shape) - 1)
    _, singular, vt = svds(matrix, k=dimensions, random_state=42)
    item_factors = vt[np.argsort(singular)[::-1]].T.astype(np.float32)
    user_factors = np.asarray(matrix @ item_factors, dtype=np.float32)
    item_norms = np.einsum("ij,ij->i", item_factors, item_factors)
    user_ids = by_user.get_column("user_index").to_numpy().astype(np.int64)
    item_indices = by_user.get_column("item_index").to_numpy().astype(np.int64)
    residual_values = by_user.get_column("residual").to_numpy().astype(np.float32)
    numerator = 0.0
    denominator = 0.0
    for start in range(0, len(residual_values), 100_000):
        end = min(start + 100_000, len(residual_values))
        batch_users = user_ids[start:end]
        batch_items = item_indices[start:end]
        raw = np.einsum("ij,ij->i", user_factors[batch_users], item_factors[batch_items])
        raw -= residual_values[start:end] * item_norms[batch_items]
        numerator += float(np.dot(raw, residual_values[start:end]))
        denominator += float(np.dot(raw, raw))
    calibration = numerator / max(denominator, 1e-8)
    mf_path = output_dir / "explicit-mf.bin"
    write_mf_index(
        mf_path,
        item_stats.get_column("vndb_id").to_numpy().astype(np.uint32),
        item_factors,
        calibration,
    )
    ratings.select("source_user_id", "vndb_id", "rating", "rated_at").write_parquet(output_dir / "explicit-clean.parquet")
    report = {
        "algorithm": "residual-mf-with-userknn-evidence",
        "selected_ranker": "residual-mf",
        "global_mean": global_mean,
        "users": user_stats.height,
        "items": item_stats.height,
        "ratings": ratings.height,
        "config": config.__dict__,
        "artifact_bytes": index_path.stat().st_size,
        "mf_artifact_bytes": mf_path.stat().st_size,
        "mf_calibration": calibration,
    }
    write_json(output_dir / "explicit-report.json", report)
    return report
