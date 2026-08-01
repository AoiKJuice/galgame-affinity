from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl
from scipy import sparse
from scipy.sparse.linalg import svds

from .binary import write_embedding_index
from .io import scan_table, write_json


STATUS_WEIGHTS = {
    1: 0.55,
    2: 1.00,
    3: 0.15,
    4: -0.35,
    5: 0.35,
    6: -1.00,
    7: 0.80,
}


@dataclass(frozen=True)
class ImplicitConfig:
    dimensions: int = 48
    regularization: float = 0.05
    iterations: int = 20
    min_item_interactions: int = 3
    min_user_interactions: int = 2


def _status_frame(root: Path) -> pl.DataFrame:
    return (
        scan_table(root, "ulist_vns", ["uid", "vid", "lastmod", "labels"])
        .with_columns(
            pl.col("uid").str.slice(1).cast(pl.UInt32).alias("user_id"),
            pl.col("vid").str.slice(1).cast(pl.UInt32).alias("vndb_id"),
            pl.col("labels").str.strip_chars("{}").str.split(",").alias("label"),
        )
        .explode("label")
        .with_columns(pl.col("label").cast(pl.UInt8, strict=False))
        .filter(pl.col("label").is_in(list(STATUS_WEIGHTS)))
        .with_columns(
            pl.col("label").replace_strict(STATUS_WEIGHTS).cast(pl.Float32).alias("weight")
        )
        .group_by("user_id", "vndb_id")
        .agg(
            pl.col("weight").sort_by(pl.col("weight").abs(), descending=True).first(),
            pl.col("lastmod").max(),
        )
        .collect(engine="streaming")
    )


def _prepare_matrix(frame: pl.DataFrame, config: ImplicitConfig) -> tuple[sparse.csr_matrix, np.ndarray, pl.DataFrame]:
    positives = frame.filter(pl.col("weight") > 0)
    users = (
        positives.group_by("user_id").len(name="n").filter(pl.col("n") >= config.min_user_interactions).select("user_id")
    )
    items = (
        positives.group_by("vndb_id").len(name="n").filter(pl.col("n") >= config.min_item_interactions).select("vndb_id")
    )
    eligible = positives.join(users, on="user_id", how="semi").join(items, on="vndb_id", how="semi")
    user_map = eligible.select("user_id").unique().sort("user_id").with_row_index("user_index")
    item_map = eligible.select("vndb_id").unique().sort("vndb_id").with_row_index("item_index")
    indexed = frame.join(user_map, on="user_id").join(item_map, on="vndb_id")
    matrix = sparse.csr_matrix(
        (
            indexed.get_column("weight").to_numpy().astype(np.float32),
            (
                indexed.get_column("user_index").to_numpy(),
                indexed.get_column("item_index").to_numpy(),
            ),
        ),
        shape=(user_map.height, item_map.height),
        dtype=np.float32,
    )
    return matrix, item_map.get_column("vndb_id").to_numpy().astype(np.uint32), indexed


def _train_vectors(matrix: sparse.csr_matrix, config: ImplicitConfig, algorithm: str) -> tuple[np.ndarray, str]:
    if algorithm in {"als", "bpr"}:
        try:
            import implicit  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError("ALS/BPR 需要安装可选依赖: pip install -e '.[als]'") from exc
        if algorithm == "als":
            model = implicit.als.AlternatingLeastSquares(
                factors=config.dimensions,
                regularization=config.regularization,
                iterations=config.iterations,
                random_state=42,
            )
        else:
            model = implicit.bpr.BayesianPersonalizedRanking(
                factors=config.dimensions,
                regularization=config.regularization,
                iterations=config.iterations * 5,
                random_state=42,
            )
        model.fit(matrix, show_progress=True)
        return np.asarray(model.item_factors, dtype=np.float32), algorithm

    dimensions = min(config.dimensions, min(matrix.shape) - 1)
    _, singular_values, vt = svds(matrix.astype(np.float32), k=dimensions, random_state=42)
    order = np.argsort(singular_values)[::-1]
    vectors = vt[order].T * np.sqrt(singular_values[order])[None, :]
    return np.asarray(vectors, dtype=np.float32), "svd"


def build_implicit(root: Path, output_dir: Path, config: ImplicitConfig, algorithm: str = "svd") -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    statuses = _status_frame(root)
    matrix, item_ids, indexed = _prepare_matrix(statuses, config)
    vectors, used_algorithm = _train_vectors(matrix, config, algorithm)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors = vectors / np.maximum(norms, 1e-8)
    path = output_dir / "implicit-recall.bin"
    write_embedding_index(path, b"GALIMP01", item_ids, vectors)
    report = {
        "algorithm": used_algorithm,
        "users": matrix.shape[0],
        "items": matrix.shape[1],
        "positive_interactions": int(indexed.filter(pl.col("weight") > 0).height),
        "negative_interactions": int(indexed.filter(pl.col("weight") < 0).height),
        "all_public_status_interactions": statuses.height,
        "dimensions": vectors.shape[1],
        "artifact_bytes": path.stat().st_size,
        "status_weights": STATUS_WEIGHTS,
        "config": config.__dict__,
    }
    write_json(output_dir / "implicit-report.json", report)
    indexed.select("user_id", "vndb_id", "weight", "lastmod").write_parquet(output_dir / "implicit-clean.parquet")
    return report
