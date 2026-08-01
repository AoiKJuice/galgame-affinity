from __future__ import annotations

import hashlib
import json
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from .io import write_json


SOURCES = {
    "database": "https://dl.vndb.org/dump/vndb-db-latest.tar.zst",
    "votes": "https://dl.vndb.org/dump/vndb-votes-latest.gz",
    "connector": "https://raw.githubusercontent.com/tuihub/tuihub-datasets/master/data/vndb_id_connector/2_automated.json",
}


def _download(url: str, path: Path) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    digest = hashlib.sha256()
    size = 0
    request = urllib.request.Request(url, headers={"User-Agent": "YoujianModelBuilder/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as target:
        while block := response.read(8 * 1024 * 1024):
            target.write(block)
            digest.update(block)
            size += len(block)
    temporary.replace(path)
    return {"url": url, "path": path.name, "bytes": size, "sha256": digest.hexdigest()}


def download_latest(destination: Path) -> dict:
    records = {
        "database": _download(SOURCES["database"], destination / "vndb-db-latest.tar.zst"),
        "votes": _download(SOURCES["votes"], destination / "vndb-votes-latest.gz"),
        "connector": _download(SOURCES["connector"], destination / "vndb-id-connector.json"),
    }
    manifest = {
        "downloadedAt": datetime.now(UTC).isoformat(),
        "sources": records,
    }
    write_json(destination / "source-manifest.json", manifest)
    return manifest
