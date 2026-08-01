from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from .audit import audit
from .catalog import build_catalog
from .content import build_content
from .download import download_latest
from .evaluate import EvalConfig, evaluate_explicit
from .explicit import ExplicitConfig, build_explicit
from .implicit import ImplicitConfig, build_implicit
from .io import copy_license_files, extract_archive, write_json
from .package import package_artifacts


def _path(value: str) -> Path:
    return Path(value).expanduser().resolve()


def _root_from_archive(archive: Path, work: Path) -> Path:
    return extract_archive(archive, work / "vndb")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="galrec")
    sub = parser.add_subparsers(dest="command", required=True)

    download = sub.add_parser("download")
    download.add_argument("--output", type=_path, default=_path(".data"))

    audit_parser = sub.add_parser("audit")
    audit_parser.add_argument("--archive", type=_path, required=True)
    audit_parser.add_argument("--votes", type=_path, required=True)
    audit_parser.add_argument("--work", type=_path, default=_path("artifacts/work"))
    audit_parser.add_argument("--output", type=_path, default=_path("artifacts/audit.json"))

    build = sub.add_parser("build-all")
    build.add_argument("--archive", type=_path, required=True)
    build.add_argument("--votes", type=_path, required=True)
    build.add_argument("--connector", type=_path)
    build.add_argument("--work", type=_path, default=_path("artifacts/work"))
    build.add_argument("--output", type=_path, required=True)
    build.add_argument("--tier", choices=["standard", "full"], default="full")
    build.add_argument("--implicit", choices=["svd", "als", "bpr"], default="svd")

    for command in ("build-explicit", "build-content", "build-catalog", "build-implicit"):
        partial = sub.add_parser(command)
        partial.add_argument("--archive", type=_path)
        partial.add_argument("--votes", type=_path)
        partial.add_argument("--connector", type=_path)
        partial.add_argument("--work", type=_path, default=_path("artifacts/work"))
        partial.add_argument("--output", type=_path, required=True)
        partial.add_argument("--tier", choices=["standard", "full"], default="full")
        partial.add_argument("--algorithm", choices=["svd", "als", "bpr"], default="svd")

    evaluate = sub.add_parser("evaluate")
    evaluate.add_argument("--ratings", type=_path, required=True)
    evaluate.add_argument("--output", type=_path, default=_path("artifacts/evaluation.json"))
    evaluate.add_argument("--max-users", type=int, default=2000)

    package = sub.add_parser("package")
    package.add_argument("--source", type=_path, required=True)
    package.add_argument("--output", type=_path, required=True)
    package.add_argument("--tier", choices=["demo", "standard", "full"], required=True)
    package.add_argument("--version", required=True)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "download":
        result = download_latest(args.output)
    elif args.command == "audit":
        root = _root_from_archive(args.archive, args.work)
        result = audit(root, args.votes, args.output)
    elif args.command == "evaluate":
        result = evaluate_explicit(args.ratings, args.output, EvalConfig(max_users=args.max_users))
    elif args.command == "package":
        result = package_artifacts(args.source, args.output, tier=args.tier, model_version=args.version)
    elif args.command == "build-explicit":
        if not args.votes:
            raise SystemExit("build-explicit requires --votes")
        result = build_explicit(args.votes, args.output, ExplicitConfig(min_item_ratings=5, mf_dimensions=32 if args.tier == "standard" else 48))
    elif args.command in {"build-content", "build-catalog", "build-implicit"}:
        if not args.archive:
            raise SystemExit(f"{args.command} requires --archive")
        root = _root_from_archive(args.archive, args.work)
        if args.command == "build-content":
            result = build_content(root, args.output, dimensions=48 if args.tier == "standard" else 64)
        elif args.command == "build-catalog":
            result = build_catalog(root, args.output, args.connector)
        else:
            result = build_implicit(root, args.output, ImplicitConfig(dimensions=32 if args.tier == "standard" else 48), args.algorithm)
    else:
        root = _root_from_archive(args.archive, args.work)
        output: Path = args.output
        output.mkdir(parents=True, exist_ok=True)
        audit_report = audit(root, args.votes, output / "audit.json")
        content_report = build_content(root, output, dimensions=48 if args.tier == "standard" else 64)
        catalog_report = build_catalog(root, output, args.connector)
        explicit_report = build_explicit(args.votes, output, ExplicitConfig(min_item_ratings=5, mf_dimensions=32 if args.tier == "standard" else 48))
        implicit_report = build_implicit(
            root,
            output,
            ImplicitConfig(dimensions=32 if args.tier == "standard" else 48),
            args.implicit,
        )
        copy_license_files(root, output / "licenses")
        version = datetime.now(UTC).strftime("%Y.%m.%d")
        manifest = package_artifacts(output, output / "release", tier=args.tier, model_version=version)
        result = {
            "audit": audit_report,
            "content": content_report,
            "catalog": catalog_report,
            "explicit": explicit_report,
            "implicit": implicit_report,
            "manifest": manifest,
        }
        write_json(output / "build-report.json", result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
