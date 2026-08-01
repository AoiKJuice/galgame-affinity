from __future__ import annotations

import gzip
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from .io import scan_table, sha256_file, write_json


STATUS_NAMES = {
    1: "playing",
    2: "finished",
    3: "stalled",
    4: "dropped",
    5: "wishlist",
    6: "blacklist",
    7: "voted",
}


def _parse_labels(raw: str | None) -> list[int]:
    if not raw:
        return []
    return [int(value) for value in raw.strip("{}").split(",") if value]


def audit(root: Path, votes_path: Path, output: Path) -> dict:
    vn_count = scan_table(root, "vn", ["id"]).select("id").collect().height
    release_count = scan_table(root, "releases", ["id"]).select("id").collect().height
    public_lists = scan_table(root, "ulist_vns", ["uid", "vid", "vote", "labels"]).collect()

    statuses: Counter[str] = Counter()
    rated_list_entries = 0
    for vote, labels in public_lists.select("vote", "labels").iter_rows():
        if vote is not None and str(vote).strip() not in {"", "0"}:
            rated_list_entries += 1
        for label in _parse_labels(labels):
            if label in STATUS_NAMES:
                statuses[STATUS_NAMES[label]] += 1

    user_scores: dict[int, list[float]] = defaultdict(list)
    item_counts: Counter[int] = Counter()
    explicit_count = 0
    with gzip.open(votes_path, "rt", encoding="utf-8") as handle:
        for line in handle:
            vid_text, uid_text, vote_text, *_ = line.rstrip().split(" ")
            score = int(vote_text) / 10.0
            if 1 <= score <= 10:
                uid = int(uid_text.removeprefix("u"))
                vid = int(vid_text.removeprefix("v"))
                user_scores[uid].append(score)
                item_counts[vid] += 1
                explicit_count += 1

    eligible_users = 0
    for scores in user_scores.values():
        array = np.asarray(scores, dtype=np.float32)
        bins = len(set(np.rint(array).astype(np.int8).tolist()))
        if array.size >= 20 and float(array.std()) >= 0.75 and bins >= 3:
            eligible_users += 1

    report = {
        "schema_version": 1,
        "source": {
            "votes_sha256": sha256_file(votes_path),
        },
        "catalog": {
            "visual_novels": vn_count,
            "releases": release_count,
        },
        "public_lists": {
            "entries": public_lists.height,
            "users": public_lists.get_column("uid").n_unique(),
            "rated_entries": rated_list_entries,
            "status_counts": dict(statuses),
        },
        "explicit": {
            "ratings": explicit_count,
            "users": len(user_scores),
            "rated_titles": len(item_counts),
            "eligible_users_20_std075_bins3": eligible_users,
            "titles_with_5": sum(count >= 5 for count in item_counts.values()),
            "titles_with_20": sum(count >= 20 for count in item_counts.values()),
        },
    }
    write_json(output, report)
    return report

