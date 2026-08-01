from __future__ import annotations

import gzip
import json
from pathlib import Path

from galrec.catalog import build_catalog
from galrec.explicit import ExplicitConfig, build_explicit
from galrec.package import package_artifacts


def _table(root: Path, name: str, header: str, rows: list[str]) -> None:
    directory = root / "db"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{name}.header").write_text(header + "\n", encoding="utf-8")
    (directory / name).write_text("\n".join(rows) + "\n", encoding="utf-8")


def test_catalog_keeps_full_catalog_and_masks_adult_metadata(tmp_path: Path) -> None:
    _table(tmp_path, "vn", "id\timage\tolang\tc_rating\tc_average\tc_votecount\tc_length\tlength", ["v1\tcv1\tja\t812\t810\t40\t300\t2", "v2\t\\N\ten\t700\t690\t5\t80\t1"])
    _table(tmp_path, "vn_titles", "id\tlang\tofficial\ttitle\tlatin", ["v1\tzh-Hans\tt\t白色相簿\t\\N", "v1\tja\tt\tホワイトアルバム\t\\N", "v2\ten\tt\tSmall Story\t\\N"])
    _table(tmp_path, "releases", "id\treleased\tminage\thas_ero\tofficial", ["r1\t20200101\t18\tt\tt", "r2\t20210101\t0\tf\tt"])
    _table(tmp_path, "releases_vn", "id\tvid\trtype", ["r1\tv1\tcomplete", "r2\tv2\tcomplete"])
    _table(tmp_path, "releases_platforms", "id\tplatform", ["r1\twin", "r2\tweb"])
    _table(tmp_path, "vn_relations", "id\tvid\trelation\tofficial", ["v1\tv2\tseq\tt"])

    report = build_catalog(tmp_path, tmp_path / "out")
    catalog = json.loads((tmp_path / "out" / "catalog.json").read_text(encoding="utf-8"))
    assert report["items"] == 2
    assert catalog[0]["title"] == "白色相簿"
    assert catalog[0]["rating"] == 8.12
    assert catalog[0]["adult"] is True
    assert catalog[1]["allAgeAvailable"] is True


def test_explicit_index_and_shards_are_reproducible(tmp_path: Path) -> None:
    votes = tmp_path / "votes.gz"
    with gzip.open(votes, "wt", encoding="utf-8") as handle:
        for user in range(1, 7):
            for item, score in enumerate((20, 40, 60, 80, 100), start=1):
                handle.write(f"v{item} u{user} {score} 2026-01-{item:02d}\n")
    output = tmp_path / "model"
    report = build_explicit(
        votes,
        output,
        ExplicitConfig(min_user_ratings=3, min_user_std=0.5, min_user_bins=3, min_item_ratings=2),
    )
    assert report["ratings"] == 30
    assert (output / "explicit-knn.bin").read_bytes()[:8] == b"GALAFF01"

    (output / "catalog.json").write_text("[]", encoding="utf-8")
    manifest = package_artifacts(output, output / "release", tier="standard", model_version="test", shard_bytes=64)
    explicit = next(package for package in manifest["packages"] if package["id"] == "explicit-knn")
    assert len(explicit["shards"]) > 1
    assert all(len(shard["sha256"]) == 64 for shard in explicit["shards"])

