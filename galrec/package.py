from __future__ import annotations

import gzip
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from .io import write_json


PACKAGE_FILES = {
    "catalog": "catalog.json",
    "explicit-knn": "explicit-knn.bin",
    "explicit-mf": "explicit-mf.bin",
    "implicit-recall": "implicit-recall.bin",
    "content-graph": "content-graph.bin",
    "content-tags": "content-tags.json",
}


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def package_artifacts(
    source_dir: Path,
    destination: Path,
    *,
    tier: str,
    model_version: str,
    shard_bytes: int = 12 * 1024 * 1024,
) -> dict:
    destination.mkdir(parents=True, exist_ok=True)
    packages = []
    for package_id, filename in PACKAGE_FILES.items():
        source = source_dir / filename
        if not source.exists():
            continue
        raw = source.read_bytes()
        compression = "gzip" if source.suffix == ".json" else "none"
        payload = gzip.compress(raw, compresslevel=9) if compression == "gzip" else raw
        shards = []
        for index, offset in enumerate(range(0, len(payload), shard_bytes)):
            chunk = payload[offset : offset + shard_bytes]
            name = f"{package_id}.{index:04d}.part"
            (destination / name).write_bytes(chunk)
            shards.append({"url": name, "size": len(chunk), "sha256": _digest(chunk)})
        packages.append(
            {
                "id": package_id,
                "format": "json" if source.suffix == ".json" else "binary",
                "compression": compression,
                "uncompressedSize": len(raw),
                "compressedSize": len(payload),
                "sha256": _digest(raw),
                "shards": shards,
            }
        )
    reports = {}
    for report_path in source_dir.glob("*-report.json"):
        reports[report_path.stem] = json.loads(report_path.read_text(encoding="utf-8"))
    manifest = {
        "schemaVersion": 1,
        "modelVersion": model_version,
        "tier": tier,
        "createdAt": datetime.now(UTC).isoformat(),
        "packages": packages,
        "reports": reports,
    }
    write_json(destination / "manifest.json", manifest)
    return manifest
