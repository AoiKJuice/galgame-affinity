from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path

import numpy as np
import polars as pl

from .binary import write_embedding_index
from .io import scan_table, write_json


def _numeric(value: str) -> int:
    return int(value[1:])


def _feature_vector(key: str, dimensions: int) -> np.ndarray:
    seed = int.from_bytes(hashlib.blake2b(key.encode("utf-8"), digest_size=8).digest(), "little")
    rng = np.random.default_rng(seed)
    return rng.choice(np.array([-1.0, 1.0], dtype=np.float32), size=dimensions) / np.sqrt(dimensions)


def build_content(root: Path, output_dir: Path, dimensions: int = 64, min_tag_votes: int = 1) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    vn_ids = np.array(
        sorted(_numeric(value) for value in scan_table(root, "vn", ["id"]).collect().get_column("id")),
        dtype=np.uint32,
    )
    id_to_index = {int(value): index for index, value in enumerate(vn_ids)}
    vectors = np.zeros((len(vn_ids), dimensions), dtype=np.float32)

    tags = scan_table(root, "tags", ["id", "name", "cat", "searchable"]).collect()
    tag_names = {_numeric(tag): name for tag, name, _cat, searchable in tags.iter_rows() if str(searchable).lower() in {"t", "true", "1"}}
    tag_votes = (
        scan_table(root, "tags_vn", ["tag", "vid", "vote", "ignore", "lie"])
        .filter((pl.col("ignore") != "t") & (pl.col("lie") != "t"))
        .with_columns(pl.col("vote").cast(pl.Float32, strict=False))
        .group_by("tag", "vid")
        .agg(pl.len().alias("n"), pl.col("vote").mean().alias("score"))
        .filter((pl.col("n") >= min_tag_votes) & (pl.col("score") >= 1.0))
        .collect(engine="streaming")
    )
    top_tags: dict[int, list[tuple[str, float]]] = defaultdict(list)
    for tag, vid, _count, score in tag_votes.iter_rows():
        tag_id = _numeric(tag)
        vn_id = _numeric(vid)
        name = tag_names.get(tag_id)
        index = id_to_index.get(vn_id)
        if name is None or index is None or score is None:
            continue
        weight = max(float(score), 0.0) / 3.0
        vectors[index] += _feature_vector(f"tag:{tag_id}", dimensions) * weight
        top_tags[vn_id].append((name, float(score)))

    release_vns = scan_table(root, "releases_vn", ["id", "vid", "rtype"]).filter(pl.col("rtype") == "complete").collect()
    release_to_vns: dict[str, list[int]] = defaultdict(list)
    for rid, vid, _rtype in release_vns.iter_rows():
        release_to_vns[rid].append(_numeric(vid))

    for rid, platform in scan_table(root, "releases_platforms", ["id", "platform"]).collect().iter_rows():
        feature = _feature_vector(f"platform:{platform}", dimensions) * 0.25
        for vn_id in release_to_vns.get(rid, []):
            if vn_id in id_to_index:
                vectors[id_to_index[vn_id]] += feature

    for rid, producer, developer, _publisher in scan_table(root, "releases_producers", ["id", "pid", "developer", "publisher"]).collect().iter_rows():
        if str(developer).lower() not in {"t", "true", "1"}:
            continue
        feature = _feature_vector(f"producer:{producer}", dimensions) * 0.6
        for vn_id in release_to_vns.get(rid, []):
            if vn_id in id_to_index:
                vectors[id_to_index[vn_id]] += feature

    relation_pairs: list[tuple[int, int]] = []
    for source, target, _kind, _official in scan_table(root, "vn_relations", ["id", "vid", "relation", "official"]).collect().iter_rows():
        left, right = _numeric(source), _numeric(target)
        if left in id_to_index and right in id_to_index:
            relation_pairs.append((id_to_index[left], id_to_index[right]))
    base = vectors.copy()
    for left, right in relation_pairs:
        vectors[left] += base[right] * 0.35

    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors = vectors / np.maximum(norms, 1e-8)
    path = output_dir / "content-graph.bin"
    write_embedding_index(path, b"GALCON01", vn_ids, vectors)
    compact_tags = {
        str(vn_id): [name for name, _score in sorted(values, key=lambda value: value[1], reverse=True)[:8]]
        for vn_id, values in top_tags.items()
    }
    write_json(output_dir / "content-tags.json", compact_tags)
    report = {
        "items": len(vn_ids),
        "dimensions": dimensions,
        "tag_assignments": tag_votes.height,
        "relation_edges": len(relation_pairs),
        "artifact_bytes": path.stat().st_size,
    }
    write_json(output_dir / "content-report.json", report)
    return report
