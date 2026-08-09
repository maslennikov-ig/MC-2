#!/usr/bin/env python3
"""Fail-closed validation for one pulled Qdrant snapshot generation."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import stat
import sys
from typing import Any


MANIFEST_NAME = "latest-manifest.json"
MANIFEST_SCHEMA = "megacampus.qdrant.snapshot-manifest/v1"
EXPECTED_VERSION = "1.18.2"
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$")
OPTIONAL_FILES = {"OFFHOST.json"}


class ValidationError(RuntimeError):
    """Expected validation failure with a safe operator-facing message."""


def object_value(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValidationError(f"{label} must be a JSON object")
    return value


def string_value(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or not SAFE_NAME.fullmatch(value):
        raise ValidationError(f"{label} is invalid")
    return value


def integer_value(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValidationError(f"{label} must be a non-negative integer")
    return value


def regular_owner_only(path: pathlib.Path, label: str) -> os.stat_result:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        raise ValidationError(f"{label} must be a regular file without symlinks")
    if metadata.st_mode & 0o077:
        raise ValidationError(f"{label} must not be accessible by group or other users")
    return metadata


def parse_time(value: Any, label: str) -> dt.datetime:
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be an ISO-8601 string")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationError(f"{label} is not valid ISO-8601") from error
    if parsed.tzinfo is None:
        raise ValidationError(f"{label} must include a timezone")
    return parsed.astimezone(dt.timezone.utc)


def digest(path: pathlib.Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            result.update(chunk)
    return result.hexdigest()


def validate_generation(
    generation: pathlib.Path,
    *,
    now: dt.datetime,
    max_age_seconds: int,
) -> dict[str, Any]:
    generation = generation.resolve(strict=True)
    metadata = generation.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or generation.is_symlink():
        raise ValidationError("generation must be a real directory")
    if metadata.st_mode & 0o077:
        raise ValidationError("generation directory must be owner-only")

    manifest_path = generation / MANIFEST_NAME
    regular_owner_only(manifest_path, "manifest")
    try:
        manifest = object_value(json.loads(manifest_path.read_text(encoding="utf-8")), "manifest")
    except json.JSONDecodeError as error:
        raise ValidationError("manifest is not valid JSON") from error

    if manifest.get("schema_version") != MANIFEST_SCHEMA or manifest.get("status") != "success":
        raise ValidationError("manifest schema or status is not accepted")
    if manifest.get("storage_mode") != "local":
        raise ValidationError("source manifest must describe a local production snapshot")
    if manifest.get("server_version") != EXPECTED_VERSION:
        raise ValidationError(f"server_version must equal {EXPECTED_VERSION}")

    logical_alias = string_value(manifest.get("logical_alias"), "logical_alias")
    physical_collection = string_value(
        manifest.get("physical_collection"), "physical_collection"
    )
    snapshot_name = string_value(manifest.get("snapshot_name"), "snapshot_name")
    if not snapshot_name.endswith(".snapshot"):
        raise ValidationError("snapshot_name must end with .snapshot")
    point_count = integer_value(manifest.get("point_count"), "point_count")
    size_bytes = integer_value(manifest.get("size_bytes"), "size_bytes")
    if size_bytes == 0:
        raise ValidationError("size_bytes must be positive")
    expected_sha256 = manifest.get("sha256")
    if not isinstance(expected_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise ValidationError("manifest sha256 must be a lowercase SHA-256 digest")

    created = parse_time(manifest.get("created_at"), "created_at")
    age_seconds = (now - created).total_seconds()
    if age_seconds < -300:
        raise ValidationError("source manifest is more than five minutes in the future")
    if max_age_seconds > 0 and age_seconds > max_age_seconds:
        raise ValidationError("source manifest is older than the accepted freshness window")

    allowed = {MANIFEST_NAME, snapshot_name, *OPTIONAL_FILES}
    entries = {entry.name for entry in generation.iterdir()}
    required = {MANIFEST_NAME, snapshot_name}
    if not required.issubset(entries) or not entries.issubset(allowed):
        raise ValidationError("generation must contain exactly the manifest, snapshot, and receipt")

    snapshot_path = generation / snapshot_name
    snapshot_metadata = regular_owner_only(snapshot_path, "snapshot")
    if snapshot_metadata.st_size != size_bytes:
        raise ValidationError("snapshot size does not match the manifest")
    actual_sha256 = digest(snapshot_path)
    if actual_sha256 != expected_sha256:
        raise ValidationError("snapshot SHA-256 does not match the manifest")

    receipt_path = generation / "OFFHOST.json"
    if receipt_path.exists():
        regular_owner_only(receipt_path, "off-host receipt")
        try:
            receipt = object_value(
                json.loads(receipt_path.read_text(encoding="utf-8")), "off-host receipt"
            )
        except json.JSONDecodeError as error:
            raise ValidationError("off-host receipt is not valid JSON") from error
        if receipt.get("schema_version") != "megacampus.qdrant.offhost-receipt/v1":
            raise ValidationError("off-host receipt schema is not accepted")
        if receipt.get("snapshot_sha256") != expected_sha256:
            raise ValidationError("off-host receipt does not bind the snapshot SHA-256")

    return {
        "logical_alias": logical_alias,
        "physical_collection": physical_collection,
        "snapshot_name": snapshot_name,
        "snapshot_path": str(snapshot_path),
        "point_count": point_count,
        "size_bytes": size_bytes,
        "sha256": actual_sha256,
        "created_at": created.isoformat().replace("+00:00", "Z"),
        "created_epoch_seconds": int(created.timestamp()),
        "server_version": EXPECTED_VERSION,
        "age_seconds": max(0, int(age_seconds)),
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    subcommands = result.add_subparsers(dest="command", required=True)
    verify = subcommands.add_parser("verify")
    verify.add_argument("--generation", required=True, type=pathlib.Path)
    verify.add_argument("--max-age-seconds", required=True, type=int)
    verify.add_argument("--now")
    return result


def main() -> int:
    args = parser().parse_args()
    if args.max_age_seconds < 0:
        raise ValidationError("max-age-seconds must be non-negative")
    now = (
        parse_time(args.now, "now")
        if args.now
        else dt.datetime.now(tz=dt.timezone.utc)
    )
    result = validate_generation(
        args.generation,
        now=now,
        max_age_seconds=args.max_age_seconds,
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValidationError) as error:
        print(f"qdrant-offhost-validate: {error}", file=sys.stderr)
        raise SystemExit(1) from error
