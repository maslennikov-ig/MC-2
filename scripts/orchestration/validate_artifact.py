#!/usr/bin/env python3
"""Validate tracked orchestration artifact files."""

from __future__ import annotations

import pathlib
import re
import sys
from typing import TypeAlias

YamlValue: TypeAlias = str | list[str]

REQUIRED_KEYS = {
    "schema_version",
    "task_id",
    "stage_id",
    "repo",
    "branch",
    "base_branch",
    "base_commit",
    "worktree",
    "status",
    "delivery_method",
    "accepted_by_orchestrator",
    "cleanup_status",
    "cleanup_notes",
    "risk_level",
    "verification",
    "changed_files",
    "explicit_defers",
}

REQUIRED_LIST_KEYS = {"verification", "changed_files", "explicit_defers"}
ALLOWED_SCHEMA_VERSIONS = {"orchestration-artifact/v1"}
ALLOWED_STATUSES = {"returned", "accepted", "merged", "blocked"}
ALLOWED_DELIVERY_METHODS = {"merge", "cherry-pick", "manual integration", "not accepted", "n/a"}
ALLOWED_ACCEPTED_BY_ORCHESTRATOR = {"yes", "no"}
ALLOWED_CLEANUP_STATUSES = {"pending", "cleaned", "blocked", "not_applicable"}
ALLOWED_RISK_LEVELS = {"low", "medium", "high"}

REQUIRED_HEADINGS = [
    "# Summary",
    "# Verification",
    "# Risks / Follow-ups",
]

SECRET_PATTERNS = [
    re.compile(r"BEGIN [A-Z ]*PRIVATE KEY"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9]{10,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z\-_]{20,}\b"),
]


def parse_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("file must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter closing marker not found")

    return text[4:end], text[end + 5 :]


def extract_frontmatter_values(frontmatter: str) -> dict[str, YamlValue]:
    values: dict[str, YamlValue] = {}
    current_key: str | None = None

    for raw_line in frontmatter.splitlines():
        if not raw_line:
            continue

        if raw_line.startswith("  - ") or raw_line.startswith("- "):
            if current_key is not None:
                current_values = values.setdefault(current_key, [])
                if isinstance(current_values, list):
                    current_values.append(raw_line.split("-", 1)[1].strip())
            continue

        if ":" not in raw_line or raw_line.startswith(" "):
            continue

        key, raw_value = raw_line.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if raw_value:
            values[key] = raw_value
            current_key = None
        else:
            values[key] = []
            current_key = key

    return values


def is_placeholder(value: str) -> bool:
    stripped = value.strip()
    return stripped.startswith("<") and stripped.endswith(">")


def list_is_meaningful(value: YamlValue | None) -> bool:
    if not isinstance(value, list):
        return False
    return any(item.strip() and not is_placeholder(item) for item in value)


def validate_scalar(
    path: pathlib.Path,
    key: str,
    values: dict[str, YamlValue],
    allowed: set[str] | None = None,
) -> list[str]:
    value = values.get(key)
    if not isinstance(value, str) or not value.strip():
        return [f"{path}: frontmatter key {key!r} must be a non-empty scalar"]
    if is_placeholder(value):
        return [f"{path}: unresolved placeholder value: {key}"]
    if allowed is not None and value not in allowed:
        return [f"{path}: invalid {key!r} value {value!r}; expected one of {sorted(allowed)}"]
    return []


def validate_file(path: pathlib.Path) -> list[str]:
    errors: list[str] = []
    try:
        text = path.read_text()
    except OSError as exc:
        return [f"{path}: cannot read file: {exc}"]

    try:
        frontmatter, body = parse_frontmatter(text)
    except ValueError as exc:
        return [f"{path}: {exc}"]

    values = extract_frontmatter_values(frontmatter)
    missing = sorted(REQUIRED_KEYS - set(values))
    if missing:
        errors.append(f"{path}: missing frontmatter keys: {', '.join(missing)}")

    for key in REQUIRED_KEYS - REQUIRED_LIST_KEYS:
        if key in values:
            errors.extend(validate_scalar(path, key, values))

    if "schema_version" in values:
        errors.extend(validate_scalar(path, "schema_version", values, ALLOWED_SCHEMA_VERSIONS))
    if "status" in values:
        errors.extend(validate_scalar(path, "status", values, ALLOWED_STATUSES))
    if "delivery_method" in values:
        errors.extend(validate_scalar(path, "delivery_method", values, ALLOWED_DELIVERY_METHODS))
    if "accepted_by_orchestrator" in values:
        errors.extend(validate_scalar(path, "accepted_by_orchestrator", values, ALLOWED_ACCEPTED_BY_ORCHESTRATOR))
    if "cleanup_status" in values:
        errors.extend(validate_scalar(path, "cleanup_status", values, ALLOWED_CLEANUP_STATUSES))
    if "risk_level" in values:
        errors.extend(validate_scalar(path, "risk_level", values, ALLOWED_RISK_LEVELS))

    for key in sorted(REQUIRED_LIST_KEYS):
        if key in values and not list_is_meaningful(values.get(key)):
            errors.append(f"{path}: frontmatter key {key!r} must contain at least one non-placeholder item")

    for heading in REQUIRED_HEADINGS:
        if heading not in body:
            errors.append(f"{path}: missing section heading {heading!r}")

    for pattern in SECRET_PATTERNS:
        if pattern.search(text):
            errors.append(f"{path}: matched blocked secret pattern {pattern.pattern!r}")

    return errors


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: validate_artifact.py <artifact.md> [artifact.md ...]", file=sys.stderr)
        return 2

    all_errors: list[str] = []
    for raw_path in argv[1:]:
        all_errors.extend(validate_file(pathlib.Path(raw_path)))

    if all_errors:
        for error in all_errors:
            print(error, file=sys.stderr)
        return 1

    print("artifact validation OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
