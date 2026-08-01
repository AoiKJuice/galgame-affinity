from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "public" / "model" / "demo"


CATALOG = [
    [11, "Fate/stay night", "Fate/stay night", 2004, 8.62, 18989, "https://t.vndb.org/cv/98/75598.jpg", True, ["魔法", "战斗", "奇幻"]],
    [2002, "命运石之门", "STEINS;GATE", 2009, 9.02, 16555, "https://t.vndb.org/cv/19/77819.jpg", False, ["时间旅行", "悬疑", "科幻"]],
    [92, "Muv-Luv Alternative", "Muv-Luv Alternative", 2006, 8.99, 11176, "https://t.vndb.org/cv/60/75660.jpg", True, ["战争", "机甲", "剧情"]],
    [7771, "WHITE ALBUM2", "WHITE ALBUM2", 2010, 9.03, 4389, "https://t.vndb.org/cv/62/88962.jpg", True, ["恋爱", "音乐", "剧情"]],
    [4, "CLANNAD", "CLANNAD", 2004, 8.72, 11269, "https://t.vndb.org/cv/95/75895.jpg", False, ["家庭", "校园", "催泪"]],
    [5, "Little Busters!", "リトルバスターズ！", 2007, 8.63, 9156, "https://t.vndb.org/cv/12/75612.jpg", False, ["友情", "校园", "催泪"]],
    [12402, "海市蜃楼之馆", "ファタモルガーナの館", 2012, 8.80, 7413, "https://t.vndb.org/cv/31/77731.jpg", False, ["心理", "悬疑", "剧情"]],
    [67, "寒蝉鸣泣之时", "ひぐらしのなく頃に", 2002, 8.62, 10993, "https://t.vndb.org/cv/00/75600.jpg", False, ["悬疑", "恐怖", "乡村"]],
    [24, "海猫鸣泣之时", "うみねこのなく頃に", 2007, 8.87, 13590, "https://t.vndb.org/cv/23/85323.jpg", False, ["推理", "悬疑", "魔法"]],
    [97, "沙耶之歌", "沙耶の唄", 2003, 7.87, 23527, "https://t.vndb.org/cv/68/93368.jpg", True, ["恐怖", "心理", "短篇"]],
    [3144, "美好的每一天", "素晴らしき日々", 2010, 8.68, 11639, "https://t.vndb.org/cv/17/90017.jpg", True, ["哲学", "心理", "校园"]],
    [19829, "9-nine-九次九日九重色", "9-nine-ここのつここのかここのいろ", 2017, 7.08, 4920, "https://t.vndb.org/cv/33/95133.jpg", True, ["恋爱", "超能力", "校园"]],
    [12849, "苍之彼方的四重奏", "蒼の彼方のフォーリズム", 2014, 8.26, 6500, "https://t.vndb.org/cv/55/79855.jpg", True, ["竞技", "恋爱", "校园"]],
    [562, "樱之诗", "サクラノ詩", 2015, 8.74, 2474, "https://t.vndb.org/cv/63/79663.jpg", True, ["艺术", "校园", "剧情"]],
    [7, "月姬", "月姫", 2000, 8.18, 11330, "https://t.vndb.org/cv/48/90048.jpg", True, ["吸血鬼", "战斗", "悬疑"]],
    [777, "魔法使之夜", "魔法使いの夜", 2012, 8.64, 5265, "https://t.vndb.org/cv/24/85324.jpg", False, ["魔法", "战斗", "剧情"]],
    [20424, "Summer Pockets", "Summer Pockets", 2018, 8.46, 4665, "https://t.vndb.org/cv/30/85430.jpg", False, ["夏日", "海岛", "催泪"]],
    [5154, "灰色的果实", "グリザイアの果実", 2011, 8.34, 12791, "https://t.vndb.org/cv/55/90355.jpg", True, ["校园", "心理", "恋爱"]],
    [27448, "ATRI -My Dear Moments-", "ATRI -My Dear Moments-", 2020, 7.77, 3522, "https://t.vndb.org/cv/12/76012.jpg", False, ["科幻", "夏日", "催泪"]],
    [20802, "Rance X -决战-", "ランス10", 2018, 9.02, 1135, "https://t.vndb.org/cv/91/88391.jpg", True, ["奇幻", "战争", "策略"]],
]

USERS = [
    {"4": 10, "5": 9, "7771": 9.5, "20424": 9, "5154": 8, "12849": 8},
    {"4": 9, "5": 9.5, "7771": 10, "20424": 8.5, "562": 9, "19829": 7.5},
    {"4": 9.5, "5": 8.5, "20424": 9.5, "27448": 8.5, "12849": 8.5, "5154": 7.5},
    {"2002": 10, "24": 9.5, "67": 9, "12402": 10, "3144": 8.5, "97": 7.5},
    {"2002": 9.5, "24": 10, "67": 9.5, "12402": 9, "3144": 9.5, "777": 8},
    {"24": 9, "67": 10, "12402": 9.5, "3144": 10, "97": 8, "7": 8.5},
    {"11": 9.5, "92": 10, "7": 9, "777": 9, "20802": 9.5, "2002": 8.5},
    {"11": 10, "92": 9.5, "7": 9.5, "777": 8.5, "20802": 9, "3144": 8},
    {"92": 10, "20802": 10, "11": 8.5, "777": 8, "24": 8.5, "5154": 7},
    {"19829": 9, "12849": 9.5, "20424": 9, "27448": 8.5, "5154": 8, "4": 8.5},
    {"19829": 8.5, "12849": 10, "20424": 8.5, "27448": 9, "7771": 8, "5": 8},
    {"562": 10, "3144": 9.5, "7771": 9.5, "12402": 9, "4": 8, "24": 8.5},
    {"562": 9.5, "3144": 10, "7771": 10, "12402": 8.5, "97": 8, "5154": 7.5},
    {"2002": 9, "27448": 9, "20424": 8.5, "777": 9.5, "11": 8, "12849": 7.5},
    {"67": 9.5, "24": 9.5, "97": 9, "3144": 8.5, "12402": 9, "2002": 8.5},
    {"11": 9, "7": 9.5, "777": 10, "2002": 9, "92": 8.5, "24": 8},
    {"4": 10, "7771": 9, "562": 8.5, "5": 9, "20424": 8, "27448": 7.5},
    {"20802": 10, "92": 9, "11": 8, "5154": 8.5, "7": 8.5, "777": 7.5},
    {"12849": 9, "19829": 9.5, "7771": 8.5, "5154": 8, "20424": 9, "4": 7.5},
    {"12402": 10, "562": 9, "3144": 9, "24": 9.5, "2002": 8, "7771": 8.5},
]

# Eight interpretable axes: romance, mystery, action, tragedy, sci-fi, horror, slice-of-life, fantasy.
VECTORS = {
    "11": [0.4, 0.3, 1.0, 0.5, 0.1, 0.2, 0.1, 1.0], "2002": [0.2, 1.0, 0.2, 0.7, 1.0, 0.2, 0.3, 0.1],
    "92": [0.2, 0.5, 1.0, 1.0, 0.9, 0.4, 0.0, 0.2], "7771": [1.0, 0.2, 0.0, 1.0, 0.0, 0.0, 0.7, 0.0],
    "4": [0.8, 0.2, 0.0, 1.0, 0.1, 0.0, 0.9, 0.3], "5": [0.7, 0.3, 0.2, 0.8, 0.1, 0.0, 1.0, 0.3],
    "12402": [0.3, 1.0, 0.1, 1.0, 0.0, 0.7, 0.1, 0.7], "67": [0.2, 1.0, 0.2, 0.8, 0.1, 1.0, 0.5, 0.3],
    "24": [0.2, 1.0, 0.3, 0.9, 0.1, 0.8, 0.1, 0.8], "97": [0.4, 0.6, 0.1, 0.8, 0.4, 1.0, 0.0, 0.3],
    "3144": [0.4, 0.9, 0.1, 1.0, 0.1, 0.8, 0.4, 0.2], "19829": [1.0, 0.3, 0.4, 0.2, 0.2, 0.1, 0.9, 0.7],
    "12849": [1.0, 0.2, 0.5, 0.3, 0.3, 0.0, 1.0, 0.4], "562": [0.6, 0.5, 0.1, 1.0, 0.0, 0.1, 0.7, 0.2],
    "7": [0.4, 0.7, 0.9, 0.7, 0.1, 0.7, 0.1, 0.9], "777": [0.2, 0.5, 0.8, 0.5, 0.1, 0.2, 0.4, 1.0],
    "20424": [0.8, 0.3, 0.1, 0.8, 0.2, 0.0, 1.0, 0.4], "5154": [0.8, 0.4, 0.5, 0.7, 0.1, 0.3, 0.8, 0.2],
    "27448": [0.7, 0.3, 0.1, 0.8, 1.0, 0.0, 0.7, 0.1], "20802": [0.2, 0.3, 1.0, 0.7, 0.1, 0.2, 0.1, 1.0],
}


def catalog_rows() -> list[dict]:
    rows = []
    for vid, title, native, year, rating, votes, cover, adult, tags in CATALOG:
        rows.append({
            "id": vid, "title": title, "titleNative": native, "titleEnglish": None,
            "coverUrl": cover, "year": year, "rating": rating, "ratingCount": votes,
            "lengthMinutes": None, "lengthCategory": None, "adult": adult,
            "allAgeAvailable": not adult, "platforms": ["win"], "tags": tags,
            "relations": [], "bangumiIds": [], "steamIds": [],
        })
    return rows


def write_package(package_id: str, payload: object) -> dict:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    filename = f"{package_id}.0000.part"
    (DESTINATION / filename).write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    return {
        "id": package_id, "format": "json", "compression": "none",
        "uncompressedSize": len(raw), "compressedSize": len(raw), "sha256": digest,
        "shards": [{"url": filename, "size": len(raw), "sha256": digest}],
    }


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    packages = [
        write_package("catalog", catalog_rows()),
        write_package("explicit-knn", {"users": [{"ratings": ratings} for ratings in USERS]}),
        write_package("implicit-recall", {"vectors": VECTORS}),
        write_package("content-graph", {"vectors": VECTORS}),
    ]
    manifest = {
        "schemaVersion": 1,
        "modelVersion": "demo-2026.08.01",
        "tier": "demo",
        "createdAt": datetime.now(UTC).isoformat(),
        "packages": packages,
        "reports": {"demo": {"items": len(CATALOG), "users": len(USERS), "ratings": sum(len(value) for value in USERS)}},
    }
    (DESTINATION / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
