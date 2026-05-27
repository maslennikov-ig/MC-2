#!/usr/bin/env python3
"""Build the tracked Career Playbook Wikidata role suggestion subset.

The full Wikidata graph is intentionally not queried or committed. This script
fetches only reviewed QIDs from the tracked allowlist via wbgetentities, validates
that each entity exists, merges reviewed labels/aliases with Wikidata labels, and
writes the small TypeScript subset used by the constructor.
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_ALLOWLIST = Path("scripts/career-playbook/wikidata_role_suggestions_allowlist.json")
DEFAULT_OUTPUT = Path(
    "packages/web/components/career-playbook/wizard/role-title-suggestions-wikidata.ts"
)
WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"
WIKIDATA_ENTITY_URL = "https://www.wikidata.org/wiki/"
USER_AGENT = "mc2-career-playbook-role-import/1.0"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allowlist", default=DEFAULT_ALLOWLIST, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT, type=Path)
    parser.add_argument("--api-url", default=WIKIDATA_API_URL)
    args = parser.parse_args()

    allowlist = json.loads(args.allowlist.read_text(encoding="utf-8"))
    qids = [item["sourceReferences"]["wikidataQid"] for item in allowlist]
    entities = fetch_entities(qids, args.api_url)

    normalized = []
    missing_qids: list[str] = []
    for item in allowlist:
        qid = item["sourceReferences"]["wikidataQid"]
        entity = entities.get(qid)
        if entity is None or entity.get("missing") == "":
            missing_qids.append(qid)
            continue

        normalized.append(normalize_record(item, entity))

    if missing_qids:
        formatted = "\n".join(f"- {qid}" for qid in missing_qids)
        raise SystemExit(f"Allowlist contains QIDs missing from Wikidata:\n{formatted}")

    args.output.write_text(render_typescript(normalized), encoding="utf-8")


def fetch_entities(qids: list[str], api_url: str) -> dict[str, dict[str, Any]]:
    if len(set(qids)) != len(qids):
        raise SystemExit("Allowlist contains duplicate Wikidata QIDs")

    params = {
        "action": "wbgetentities",
        "ids": "|".join(qids),
        "props": "labels|aliases",
        "languages": "ru|en",
        "format": "json",
    }
    url = f"{api_url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    entities = payload.get("entities")
    if not isinstance(entities, dict):
        raise SystemExit("Unexpected Wikidata response: missing entities object")

    return entities


def normalize_record(item: dict[str, Any], entity: dict[str, Any]) -> dict[str, Any]:
    labels = merge_labels(item.get("labels", {}), entity.get("labels", {}))
    aliases = merge_aliases(item.get("aliases", {}), entity.get("aliases", {}))

    missing_labels = [locale for locale in ("ru", "en") if not labels.get(locale)]
    if missing_labels:
        raise SystemExit(
            f"{item['id']} is missing required labels: {', '.join(missing_labels)}"
        )

    return {
        **item,
        "labels": labels,
        "aliases": aliases,
        "source": "wikidata",
    }


def merge_labels(
    allowlist_labels: dict[str, str], wikidata_labels: dict[str, dict[str, str]]
) -> dict[str, str]:
    labels: dict[str, str] = {}
    for locale in ("ru", "en"):
        labels[locale] = allowlist_labels.get(locale) or wikidata_labels.get(locale, {}).get(
            "value", ""
        )
    return labels


def merge_aliases(
    allowlist_aliases: dict[str, list[str]], wikidata_aliases: dict[str, list[dict[str, str]]]
) -> dict[str, list[str]]:
    aliases: dict[str, list[str]] = {"ru": [], "en": []}
    for locale in ("ru", "en"):
        aliases[locale] = dedupe(
            [
                *allowlist_aliases.get(locale, []),
                *[alias["value"] for alias in wikidata_aliases.get(locale, [])],
            ]
        )
    return aliases


def dedupe(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        normalized = value.strip()
        key = normalized.casefold()
        if not normalized or key in seen:
            continue

        seen.add(key)
        result.append(normalized)
    return result


def render_typescript(records: list[dict[str, Any]]) -> str:
    metadata = {
        "wikidata": {
            "license": "CC0 1.0",
            "licenseUrl": "https://www.wikidata.org/wiki/Wikidata:Licensing",
            "apiUrl": "https://www.wikidata.org/w/api.php?action=wbgetentities",
            "entityUrlTemplate": f"{WIKIDATA_ENTITY_URL}{{qid}}",
            "attribution": "This service uses structured data from Wikidata. Reviewed MC2 labels and aliases are merged with allowlisted Wikidata entity labels.",
            "importPolicy": "Only reviewed allowlist QIDs are imported; no broad Wikidata dump, SPARQL crawl, HH, or Faker source is used at runtime.",
        }
    }

    return (
        "import type { RoleTitleSuggestion } from './role-title-suggestions.types'\n\n"
        "export const wikidataRoleTitleSuggestionSourceMetadata = "
        f"{to_ts(metadata)} as const\n\n"
        "export const wikidataRoleTitleSuggestions: RoleTitleSuggestion[] = "
        f"{to_ts(records)}\n"
    )


def to_ts(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
