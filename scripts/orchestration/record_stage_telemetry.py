#!/usr/bin/env python3
"""Record explicit, nullable stage telemetry without estimating missing values."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
import math
import os
import pathlib
import re
import sys
from datetime import datetime, timezone
from typing import Any


SCHEMA_VERSION = "stage-telemetry/v1"
STAGE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
VERIFICATION_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$")
STATUSES = {"planned", "in_progress", "blocked", "accepted", "closed"}
COVERAGE_KEYS = {"worker_wall", "queue", "verification", "review", "integration", "rebase"}
COVERAGE_VALUES = {"complete", "partial", "unavailable"}
TOP_LEVEL_KEYS = {"schema_version", "stage_id", "updated_at", "status", "metrics", "verification", "coverage"}
METRICS_KEYS = {
    "worker_wall_seconds",
    "queue_seconds",
    "review_rounds",
    "findings",
    "integration_seconds",
    "rebase_seconds",
}
FINDING_KEYS = {"p0", "p1"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def default_document(stage_id: str) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "stage_id": stage_id,
        "updated_at": utc_now(),
        "status": "in_progress",
        "metrics": {
            "worker_wall_seconds": None,
            "queue_seconds": None,
            "review_rounds": None,
            "findings": {"p0": None, "p1": None},
            "integration_seconds": None,
            "rebase_seconds": None,
        },
        "verification": {},
        "coverage": {key: "unavailable" for key in sorted(COVERAGE_KEYS)},
    }


def require_exact_keys(value: object, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise SystemExit(f"{label} does not match the {SCHEMA_VERSION} schema")
    return value


def require_duration(value: object, label: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise SystemExit(f"{label} must be a non-negative finite number or null")


def require_count(value: object, label: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise SystemExit(f"{label} must be a non-negative integer or null")


def validate_document(document: object, stage_id: str) -> dict[str, Any]:
    payload = require_exact_keys(document, TOP_LEVEL_KEYS, "telemetry")
    if payload["schema_version"] != SCHEMA_VERSION:
        raise SystemExit(f"unsupported telemetry schema: {payload['schema_version']!r}")
    if payload["stage_id"] != stage_id:
        raise SystemExit("telemetry stage_id does not match the stage directory")
    if not isinstance(payload["updated_at"], str) or not payload["updated_at"].endswith("Z"):
        raise SystemExit("telemetry updated_at must be an RFC3339 UTC timestamp")
    if payload["status"] not in STATUSES:
        raise SystemExit("telemetry status is not supported")
    metrics = require_exact_keys(payload["metrics"], METRICS_KEYS, "metrics")
    for key in ("worker_wall_seconds", "queue_seconds", "integration_seconds", "rebase_seconds"):
        require_duration(metrics[key], f"metrics.{key}")
    require_count(metrics["review_rounds"], "metrics.review_rounds")
    findings = require_exact_keys(metrics["findings"], FINDING_KEYS, "metrics.findings")
    require_count(findings["p0"], "metrics.findings.p0")
    require_count(findings["p1"], "metrics.findings.p1")
    if not isinstance(payload["verification"], dict):
        raise SystemExit("verification must be an object")
    for name, seconds in payload["verification"].items():
        if not isinstance(name, str) or not VERIFICATION_NAME_PATTERN.fullmatch(name):
            raise SystemExit("verification names must be short printable identifiers")
        require_duration(seconds, f"verification.{name}")
    coverage = require_exact_keys(payload["coverage"], COVERAGE_KEYS, "coverage")
    if any(value not in COVERAGE_VALUES for value in coverage.values()):
        raise SystemExit("coverage values must be complete, partial, or unavailable")
    return payload


def parse_assignment(raw: str, label: str) -> tuple[str, str]:
    key, separator, value = raw.partition("=")
    if not separator or not key or not value:
        raise SystemExit(f"{label} must be NAME=VALUE")
    return key, value


def parse_verification(raw: str) -> tuple[str, float]:
    name, raw_seconds = parse_assignment(raw, "--verification")
    if not VERIFICATION_NAME_PATTERN.fullmatch(name):
        raise SystemExit("verification name is not supported")
    try:
        seconds = float(raw_seconds)
    except ValueError as exc:
        raise SystemExit("verification duration must be a number") from exc
    require_duration(seconds, f"verification.{name}")
    return name, seconds


def parse_coverage(raw: str) -> tuple[str, str]:
    name, status = parse_assignment(raw, "--coverage")
    if name not in COVERAGE_KEYS:
        raise SystemExit(f"unsupported coverage key: {name}")
    if status not in COVERAGE_VALUES:
        raise SystemExit(f"unsupported coverage value: {status}")
    return name, status


@contextmanager
def telemetry_lock(path: pathlib.Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def load_document(path: pathlib.Path, stage_id: str) -> dict[str, Any]:
    if not path.exists():
        return default_document(stage_id)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read telemetry sidecar {path}: {exc}") from exc
    return validate_document(raw, stage_id)


def save_document(path: pathlib.Path, document: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(document, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--status", choices=sorted(STATUSES))
    parser.add_argument("--worker-wall-seconds", type=float)
    parser.add_argument("--queue-seconds", type=float)
    parser.add_argument("--review-rounds", type=int)
    parser.add_argument("--p0-findings", type=int)
    parser.add_argument("--p1-findings", type=int)
    parser.add_argument("--integration-seconds", type=float)
    parser.add_argument("--rebase-seconds", type=float)
    parser.add_argument("--verification", action="append", default=[])
    parser.add_argument("--coverage", action="append", default=[])
    args = parser.parse_args(argv[1:])

    if not STAGE_ID_PATTERN.fullmatch(args.stage):
        raise SystemExit("stage id is not a supported telemetry directory name")
    duration_updates = {
        "worker_wall_seconds": args.worker_wall_seconds,
        "queue_seconds": args.queue_seconds,
        "integration_seconds": args.integration_seconds,
        "rebase_seconds": args.rebase_seconds,
    }
    for key, value in duration_updates.items():
        if value is not None:
            require_duration(value, f"--{key.replace('_', '-')}")
    count_updates = {
        "review_rounds": args.review_rounds,
        "p0": args.p0_findings,
        "p1": args.p1_findings,
    }
    for key, value in count_updates.items():
        if value is not None:
            require_count(value, f"--{key.replace('_', '-')}")
    verification_updates = [parse_verification(raw) for raw in args.verification]
    coverage_updates = [parse_coverage(raw) for raw in args.coverage]

    sidecar = pathlib.Path.cwd() / ".codex" / "stages" / args.stage / "telemetry.json"
    sidecar.parent.mkdir(parents=True, exist_ok=True)
    with telemetry_lock(sidecar):
        document = load_document(sidecar, args.stage)
        if args.status:
            document["status"] = args.status
        metrics = document["metrics"]
        for key, value in duration_updates.items():
            if value is not None:
                metrics[key] = value
        if args.review_rounds is not None:
            metrics["review_rounds"] = args.review_rounds
        for key in ("p0", "p1"):
            if count_updates[key] is not None:
                metrics["findings"][key] = count_updates[key]
        for name, seconds in verification_updates:
            document["verification"][name] = seconds
        for name, status in coverage_updates:
            document["coverage"][name] = status
        document["updated_at"] = utc_now()
        save_document(sidecar, validate_document(document, args.stage))

    print(f"stage telemetry recorded: {sidecar}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
