#!/usr/bin/env python3
"""Build the tracked Career Playbook ESCO role suggestion subset.

Input CSV is downloaded manually from ESCO:
  Version: ESCO dataset - v1.2.1
  Content: classification
  Language: en
  File type: CSV

The full raw ESCO CSV is intentionally not committed. This script validates that
the tracked allowlist still maps to real ESCO occupation URIs, then writes the
small normalized TypeScript subset used by the constructor.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


DEFAULT_ALLOWLIST = Path("scripts/career-playbook/esco_role_suggestions_allowlist.json")
DEFAULT_OUTPUT = Path(
    "packages/web/components/career-playbook/wizard/role-title-suggestions-esco.ts"
)

ESCO_LANGUAGES = [
    "ar",
    "bg",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "et",
    "fi",
    "fr",
    "ga",
    "hr",
    "hu",
    "is",
    "it",
    "lt",
    "lv",
    "mt",
    "nl",
    "no",
    "pl",
    "pt",
    "ro",
    "sk",
    "sl",
    "sv",
    "uk",
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--occupations-csv", required=True, type=Path)
    parser.add_argument("--allowlist", default=DEFAULT_ALLOWLIST, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT, type=Path)
    args = parser.parse_args()

    allowlist = json.loads(args.allowlist.read_text(encoding="utf-8"))
    occupations = read_occupations_by_uri(args.occupations_csv)
    normalized = []

    missing_uris: list[str] = []
    for item in allowlist:
        uri = item["sourceReferences"]["escoUri"]
        row = occupations.get(uri)
        if row is None:
            missing_uris.append(uri)
            continue

        labels = item["labels"]
        csv_label = get_first(row, "preferredLabel", "Concept PT", "preferred term")
        if csv_label:
            labels = {**labels, "en": labels.get("en") or title_case_label(csv_label)}

        normalized.append({**item, "labels": labels, "source": "esco"})

    if missing_uris:
        formatted = "\n".join(f"- {uri}" for uri in missing_uris)
        raise SystemExit(f"Allowlist contains URIs missing from the ESCO CSV:\n{formatted}")

    args.output.write_text(render_typescript(normalized), encoding="utf-8")


def read_occupations_by_uri(csv_path: Path) -> dict[str, dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        rows = list(reader)

    occupations: dict[str, dict[str, str]] = {}
    for row in rows:
        uri = get_first(row, "conceptUri", "conceptURI", "Concept URI")
        concept_type = get_first(row, "conceptType", "Concept type", "type")
        if uri and concept_type.upper() in {"", "OC", "OCCUPATION"}:
            occupations[uri] = row

    return occupations


def get_first(row: dict[str, str], *names: str) -> str:
    normalized = {key.strip().lower(): value for key, value in row.items() if key}
    for name in names:
        value = normalized.get(name.strip().lower())
        if value:
            return value.strip()
    return ""


def title_case_label(label: str) -> str:
    return " ".join(word[:1].upper() + word[1:] for word in label.split())


def render_typescript(records: list[dict[str, Any]]) -> str:
    metadata = {
        "esco": {
            "version": "v1.2.1",
            "lastUpdate": "2025-12-10",
            "downloadUrl": "https://esco.ec.europa.eu/en/use-esco/download",
            "csvStructureUrl": "https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/comma-separated-values-csv",
            "attribution": "This service uses the ESCO classification of the European Commission. Adapted display labels and Russian fallbacks are maintained by MC2.",
            "languages": ESCO_LANGUAGES,
            "ruFallback": "Russian is not an ESCO source language; Russian labels, aliases, and keywords are MC2-maintained fallback copy mapped to ESCO occupation URIs.",
        }
    }

    return (
        "import type { RoleTitleSuggestion } from './role-title-suggestions.types'\n\n"
        "export const roleTitleSuggestionSourceMetadata = "
        f"{to_ts(metadata)} as const\n\n"
        "export const escoRoleTitleSuggestions: RoleTitleSuggestion[] = "
        f"{to_ts(records)}\n"
    )


def to_ts(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
