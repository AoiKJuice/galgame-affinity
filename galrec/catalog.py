from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import polars as pl

from .io import scan_table, write_json


def _numeric_id(value: str) -> int:
    return int(value[1:])


def _cover_url(value: str | None) -> str | None:
    if not value:
        return None
    image_id = int(str(value).removeprefix("cv"))
    return f"https://t.vndb.org/cv/{image_id % 100:02d}/{image_id}.jpg"


def _load_cross_ids(path: Path | None) -> tuple[dict[int, list[int]], dict[int, list[int]]]:
    bangumi: dict[int, list[int]] = defaultdict(list)
    steam: dict[int, list[int]] = defaultdict(list)
    if not path or not path.exists():
        return bangumi, steam
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("entries", payload.get("data", []))
    for row in rows:
        ids = row.get("ids", row) if isinstance(row, dict) else {}
        raw_vndb = ids.get("vndb") or ids.get("vndb_id")
        if raw_vndb is None:
            continue
        vndb_id = int(str(raw_vndb).removeprefix("v"))
        raw_bgm = ids.get("bangumi") or ids.get("bangumi_id")
        raw_steam = ids.get("steam") or ids.get("steam_id")
        if raw_bgm not in (None, "") and int(raw_bgm) not in bangumi[vndb_id]:
            bangumi[vndb_id].append(int(raw_bgm))
        if raw_steam not in (None, "") and int(raw_steam) not in steam[vndb_id]:
            steam[vndb_id].append(int(raw_steam))
    return dict(bangumi), dict(steam)


def build_catalog(root: Path, output_dir: Path, connector_path: Path | None = None) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    vns = scan_table(
        root,
        "vn",
        ["id", "image", "olang", "c_rating", "c_average", "c_votecount", "c_length", "length"],
    ).collect()
    titles = scan_table(root, "vn_titles", ["id", "lang", "official", "title", "latin"]).collect()
    releases = scan_table(root, "releases", ["id", "released", "minage", "has_ero", "official"]).collect()
    release_vns = scan_table(root, "releases_vn", ["id", "vid", "rtype"]).collect()
    release_platforms = scan_table(root, "releases_platforms", ["id", "platform"]).collect()
    relations = scan_table(root, "vn_relations", ["id", "vid", "relation", "official"]).collect()

    title_map: dict[int, dict[str, str]] = defaultdict(dict)
    for vid, lang, official, title, latin in titles.iter_rows():
        numeric = _numeric_id(vid)
        value = title or latin
        if value and (lang not in title_map[numeric] or str(official).lower() in {"t", "true", "1"}):
            title_map[numeric][lang] = value

    release_meta: dict[str, dict] = defaultdict(lambda: {"platforms": set()})
    for rid, released, minage, has_ero, official in releases.iter_rows():
        release_meta[rid].update(
            {
                "released": released,
                "minage": int(minage) if minage not in (None, "") else None,
                "has_ero": str(has_ero).lower() in {"t", "true", "1"},
                "official": str(official).lower() in {"t", "true", "1"},
            }
        )
    for rid, platform in release_platforms.iter_rows():
        release_meta[rid]["platforms"].add(platform)

    vn_releases: dict[int, list[dict]] = defaultdict(list)
    for rid, vid, rtype in release_vns.iter_rows():
        if rtype != "complete" or rid not in release_meta:
            continue
        vn_releases[_numeric_id(vid)].append(release_meta[rid])

    relation_map: dict[int, list[dict]] = defaultdict(list)
    for source, target, relation, official in relations.iter_rows():
        relation_map[_numeric_id(source)].append(
            {"target": _numeric_id(target), "type": relation, "official": str(official).lower() in {"t", "true", "1"}}
        )

    bangumi_ids, steam_ids = _load_cross_ids(connector_path)
    tag_path = output_dir / "content-tags.json"
    tag_summary = json.loads(tag_path.read_text(encoding="utf-8")) if tag_path.exists() else {}
    rows: list[dict] = []
    for row in vns.iter_rows(named=True):
        vid = _numeric_id(row["id"])
        localized = title_map.get(vid, {})
        releases_for_vn = vn_releases.get(vid, [])
        adult = any(meta.get("has_ero") or (meta.get("minage") or 0) >= 18 for meta in releases_for_vn)
        all_age = any(not meta.get("has_ero") and (meta.get("minage") is None or meta["minage"] < 18) for meta in releases_for_vn)
        released_values = [meta["released"] for meta in releases_for_vn if meta.get("released") and str(meta["released"])[:4].isdigit()]
        platforms = sorted({platform for meta in releases_for_vn for platform in meta["platforms"]})
        cover = _cover_url(row["image"])
        rows.append(
            {
                "id": vid,
                "title": localized.get("zh-Hans") or localized.get("zh-Hant") or localized.get("ja") or localized.get("en") or f"v{vid}",
                "titleNative": localized.get(row["olang"]) or localized.get("ja"),
                "titleEnglish": localized.get("en"),
                "coverUrl": cover,
                "year": min((int(str(value)[:4]) for value in released_values), default=None),
                "rating": float(row["c_rating"]) / 100.0 if row["c_rating"] else None,
                "ratingCount": int(row["c_votecount"] or 0),
                "lengthMinutes": int(row["c_length"] or 0) or None,
                "lengthCategory": int(row["length"] or 0) or None,
                "adult": adult,
                "allAgeAvailable": all_age,
                "platforms": platforms,
                "tags": tag_summary.get(str(vid), []),
                "relations": relation_map.get(vid, []),
                "bangumiIds": bangumi_ids.get(vid, []),
                "steamIds": steam_ids.get(vid, []),
            }
        )
    write_json(output_dir / "catalog.json", rows)
    report = {
        "items": len(rows),
        "adult_items": sum(bool(row["adult"]) for row in rows),
        "all_age_available": sum(bool(row["allAgeAvailable"]) for row in rows),
        "with_chinese_title": sum(bool(title_map.get(row["id"], {}).get("zh-Hans") or title_map.get(row["id"], {}).get("zh-Hant")) for row in rows),
        "with_bangumi_id": sum(bool(row["bangumiIds"]) for row in rows),
        "with_steam_id": sum(bool(row["steamIds"]) for row in rows),
    }
    write_json(output_dir / "catalog-report.json", report)
    return report
