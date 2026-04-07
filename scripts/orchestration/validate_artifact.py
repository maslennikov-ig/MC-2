#!/usr/bin/env python3
"""Validate tracked orchestration artifact files."""

from __future__ import annotations

import pathlib
import re
import sys

REQUIRED_KEYS = {
    "task_id",
    "stage_id",
    "branch",
    "base_branch",
    "base_commit",
    "worktree",
    "status",
    "verification",
    "changed_files",
}

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


def extract_keys(frontmatter: str) -> dict[str, str]:
    keys: dict[str, str] = {}
    for raw_line in frontmatter.splitlines():
        if not raw_line or raw_line.startswith(" ") or raw_line.startswith("-"):
            continue
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        keys[key.strip()] = value.strip()
    return keys


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

    keys = extract_keys(frontmatter)
    missing = sorted(REQUIRED_KEYS - set(keys))
    if missing:
        errors.append(f"{path}: missing frontmatter keys: {', '.join(missing)}")

    placeholders = [key for key, value in keys.items() if value.startswith("<") and value.endswith(">")]
    if placeholders:
        errors.append(f"{path}: unresolved placeholder values: {', '.join(placeholders)}")

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
