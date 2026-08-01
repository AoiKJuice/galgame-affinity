from __future__ import annotations

import hashlib
import json
import shutil
import tarfile
from pathlib import Path

import polars as pl
import zstandard as zstd


def sha256_file(path: Path, block_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(block_size):
            digest.update(block)
    return digest.hexdigest()


def extract_archive(archive: Path, destination: Path) -> Path:
    """Extract a VNDB .tar.zst archive once and return its root directory."""
    marker = destination / ".complete"
    if marker.exists():
        return destination
    destination.mkdir(parents=True, exist_ok=True)
    temporary_tar = destination.parent / f"{destination.name}.tar"
    with archive.open("rb") as source, temporary_tar.open("wb") as target:
        zstd.ZstdDecompressor().copy_stream(source, target)
    try:
        with tarfile.open(temporary_tar, "r") as bundle:
            bundle.extractall(destination, filter="data")
    finally:
        temporary_tar.unlink(missing_ok=True)
    marker.write_text(sha256_file(archive), encoding="utf-8")
    return destination


def table_columns(root: Path, table: str) -> list[str]:
    return (root / "db" / f"{table}.header").read_text(encoding="utf-8").strip().split("\t")


def scan_table(root: Path, table: str, columns: list[str] | None = None) -> pl.LazyFrame:
    all_columns = table_columns(root, table)
    frame = pl.scan_csv(
        root / "db" / table,
        separator="\t",
        has_header=False,
        new_columns=all_columns,
        null_values=[r"\N"],
        quote_char=None,
        infer_schema=False,
        truncate_ragged_lines=True,
    )
    return frame.select(columns) if columns else frame


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(path)


def copy_license_files(root: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for name in ("LICENSE-ODBL.txt", "LICENSE-DBCL.txt", "README.txt", "TIMESTAMP"):
        source = root / name
        if source.exists():
            shutil.copy2(source, destination / name)

