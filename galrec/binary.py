from __future__ import annotations

import struct
from pathlib import Path

import numpy as np


def _write_array(handle, values: np.ndarray, dtype: str) -> None:
    array = np.asarray(values, dtype=np.dtype(dtype).newbyteorder("<"))
    handle.write(array.tobytes(order="C"))


def write_explicit_index(
    path: Path,
    *,
    item_ids: np.ndarray,
    user_offsets: np.ndarray,
    user_items: np.ndarray,
    user_values: np.ndarray,
    item_offsets: np.ndarray,
    item_users: np.ndarray,
    item_values: np.ndarray,
    item_iuf: np.ndarray,
    item_surprise: np.ndarray,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("wb") as handle:
        handle.write(b"GALAFF01")
        handle.write(struct.pack("<IIII", 1, len(user_offsets) - 1, len(item_ids), len(user_items)))
        _write_array(handle, item_ids, "u4")
        _write_array(handle, user_offsets, "u4")
        _write_array(handle, user_items, "u4")
        _write_array(handle, user_values, "f4")
        _write_array(handle, item_offsets, "u4")
        _write_array(handle, item_users, "u4")
        _write_array(handle, item_values, "f4")
        _write_array(handle, item_iuf, "f4")
        _write_array(handle, item_surprise.reshape(-1), "f4")
    temporary.replace(path)


def write_embedding_index(path: Path, magic: bytes, item_ids: np.ndarray, vectors: np.ndarray) -> None:
    if len(magic) != 8:
        raise ValueError("magic must be eight bytes")
    vectors = np.asarray(vectors, dtype=np.float32)
    scale = np.maximum(np.max(np.abs(vectors), axis=1), 1e-8) / 127.0
    quantized = np.rint(vectors / scale[:, None]).clip(-127, 127).astype(np.int8)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("wb") as handle:
        handle.write(magic)
        handle.write(struct.pack("<III", 1, len(item_ids), vectors.shape[1]))
        _write_array(handle, item_ids, "u4")
        _write_array(handle, scale, "f4")
        handle.write(quantized.tobytes(order="C"))
    temporary.replace(path)


def write_mf_index(path: Path, item_ids: np.ndarray, vectors: np.ndarray, calibration: float) -> None:
    vectors = np.asarray(vectors, dtype=np.float32)
    scale = np.maximum(np.max(np.abs(vectors), axis=1), 1e-8) / 127.0
    quantized = np.rint(vectors / scale[:, None]).clip(-127, 127).astype(np.int8)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("wb") as handle:
        handle.write(b"GALMFX01")
        handle.write(struct.pack("<IIIf", 1, len(item_ids), vectors.shape[1], calibration))
        _write_array(handle, item_ids, "u4")
        _write_array(handle, scale, "f4")
        handle.write(quantized.tobytes(order="C"))
    temporary.replace(path)
