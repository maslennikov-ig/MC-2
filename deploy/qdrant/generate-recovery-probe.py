#!/usr/bin/env python3
"""Author the restore-drill probe by measuring the live collection, not by guessing it.

WHAT THE PROBE IS. megacampus-qdrant-restore-drill.service restores the latest snapshot into a
throwaway collection and asserts that a set of exact queries still return exact points: a dense
query, a Russian BM25 query, an English BM25 query, a hybrid query whose CORE result must outrank
its SUPPLEMENTARY one, and two deliberately mismatched organization/course pairs that must return
nothing. RecoveryProbe (tools/qdrant/restore-drill.ts) is the file that defines all of that.

WHY IT IS GENERATED. It needs a 768-dimension dense vector and, for every query, the exact
point_id, document_id, chunk_id and full content of the top result. Hand-authoring that is not
possible, and hand-authoring it WRONG is worse than having no drill: the unit would fail every
month for a reason that has nothing to do with the backup. Until 2026-07-31 the file simply did
not exist and the unit died on 243/CREDENTIALS before it ran a single check (mc2-hfz4a).

So this asks the live collection the drill's own questions and records the answers. A restored
snapshot is byte-identical to what was snapshotted, so the same query returns the same ranking.

Re-run it after any change that rewrites the chosen course's vectors; the drill will fail loudly
if you forget, which is the intended failure mode.

Usage:
    python3 generate-recovery-probe.py --url http://127.0.0.1:6335 --out /opt/megacampus/recovery/probe.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request

COLLECTION = 'course_embeddings_v1'
# Mirrors QDRANT_BM25_OPTIONS in src/shared/qdrant/config.ts. If those diverge the drill's queries
# stop matching the ones measured here, and the probe silently describes a different search.
BM25_OPTIONS = {
    'language': 'none',
    'tokenizer': 'multilingual',
    'lowercase': True,
    'k': 1.2,
    'b': 0.75,
    'avg_len': 256,
}
# getPrefetchLimit(2) in src/shared/qdrant/search-operations.ts: max(2 * 3, 30).
PREFETCH_LIMIT = 30
PRIORITY_BOOST = 0.4
CYRILLIC_WORD = re.compile(r'[А-Яа-яЁё][А-Яа-яЁё-]{4,}')
LATIN_WORD = re.compile(r'[A-Za-z][A-Za-z-]{3,}')


class Qdrant:
    def __init__(self, url: str, api_key: str) -> None:
        self.url = url.rstrip('/')
        self.api_key = api_key

    def post(self, path: str, body: dict) -> dict:
        request = urllib.request.Request(
            f'{self.url}{path}',
            data=json.dumps(body).encode('utf-8'),
            headers={'api-key': self.api_key, 'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())

    def scroll(self, body: dict) -> dict:
        return self.post(f'/collections/{COLLECTION}/points/scroll', body)['result']

    def query(self, body: dict) -> list[dict]:
        return self.post(f'/collections/{COLLECTION}/points/query', body)['result']['points']


def bm25(text: str) -> dict:
    return {'text': text, 'model': 'qdrant/bm25', 'options': BM25_OPTIONS}


def scoped_filter(organization_id: str, course_id: str) -> dict:
    return {
        'must': [
            {'key': 'organization_id', 'match': {'value': organization_id}},
            {'key': 'course_id', 'match': {'value': course_id}},
        ]
    }


def identity(point: dict) -> dict:
    payload = point['payload']
    return {
        'point_id': str(point['id']),
        'document_id': payload['document_id'],
        'chunk_id': payload['chunk_id'],
        'content': payload['content'],
    }


def load_course_points(client: Qdrant, organization_id: str, course_id: str) -> list[dict]:
    """Read a course in full. The page size is the strict-mode cap the collection declares."""
    points: list[dict] = []
    offset = None
    while True:
        body = {
            'limit': 100,
            'filter': scoped_filter(organization_id, course_id),
            'with_payload': True,
            'with_vector': ['dense'],
        }
        if offset is not None:
            body['offset'] = offset
        result = client.scroll(body)
        points.extend(result['points'])
        offset = result.get('next_page_offset')
        if offset is None:
            return points


def find_candidate_courses(client: Qdrant) -> list[tuple[str, str]]:
    """Every course carrying both CORE and SUPPLEMENTARY chunks, richest mix first.

    Carrying both is necessary but not sufficient: the formula check also needs a query that
    actually ranks the CORE chunk above the SUPPLEMENTARY one, and whether such a query exists
    depends on the text. So this returns candidates to try rather than one course to trust.
    """
    seen: dict[tuple[str, str], dict[str, int]] = {}
    offset = None
    for _ in range(60):
        body = {
            'limit': 100,
            'with_payload': ['course_id', 'organization_id', 'document_priority'],
            'with_vector': False,
        }
        if offset is not None:
            body['offset'] = offset
        result = client.scroll(body)
        for point in result['points']:
            payload = point['payload']
            key = (payload['organization_id'], payload['course_id'])
            counts = seen.setdefault(key, {})
            priority = payload.get('document_priority')
            counts[priority] = counts.get(priority, 0) + 1
        offset = result.get('next_page_offset')
        if offset is None:
            break

    mixed = [
        (key, counts)
        for key, counts in seen.items()
        if counts.get('CORE', 0) > 0 and counts.get('SUPPLEMENTARY', 0) > 0
    ]
    if not mixed:
        raise SystemExit('no course carries both CORE and SUPPLEMENTARY chunks')

    mixed.sort(key=lambda entry: -min(entry[1]['CORE'], entry[1]['SUPPLEMENTARY']))
    return [key for key, _ in mixed]


def pick_mismatched(client: Qdrant, organization_id: str, course_id: str) -> tuple[str, str]:
    """A real other course, so the isolation check proves a boundary rather than a typo."""
    result = client.scroll(
        {'limit': 100, 'with_payload': ['course_id', 'organization_id'], 'with_vector': False}
    )
    other_course = next(
        (
            point['payload']['course_id']
            for point in result['points']
            if point['payload']['course_id'] != course_id
        ),
        None,
    )
    if other_course is None:
        raise SystemExit('collection holds only one course; cannot prove course isolation')
    # There is one organization in production, so the mismatched organization is a value that
    # exists nowhere. That still proves the filter is applied, which is what the check is for.
    return '00000000-0000-4000-8000-000000000000', other_course


def is_plausible_word(word: str) -> bool:
    """Reject OCR noise.

    Scanned pages in this corpus produce Latin-script strings like 'OEDEINHEHNEBOJNHJIOT' and
    'CaMOCTOXIeIbHO'. They are indexable and they match, so the first probe generated here used
    them — and an English check that retrieves OCR garbage proves nothing about multilingual BM25.
    Real words are cased consistently and have a sane vowel ratio.
    """
    if word.isupper() or not (word.islower() or word[:1].isupper() and word[1:].islower()):
        return False
    vowels = sum(1 for character in word.lower() if character in 'aeiouyаеёиоуыэюя')
    return 0.2 <= vowels / len(word) <= 0.6


def distinctive_query(content: str, pattern: re.Pattern[str], count: int) -> str | None:
    words = [word for word in pattern.findall(content) if is_plausible_word(word)]
    unique: list[str] = []
    for word in words:
        if word.lower() not in {existing.lower() for existing in unique}:
            unique.append(word)
        if len(unique) == count:
            return ' '.join(unique)
    return None


def top_point(client: Qdrant, body: dict) -> dict | None:
    points = client.query(body)
    return points[0] if points else None


def build_formula_query(text: str, dense_vector: list[float], scope: dict) -> dict:
    return {
        'prefetch': {
            'prefetch': [
                {'query': bm25(text), 'using': 'sparse', 'limit': PREFETCH_LIMIT, 'filter': scope},
                {
                    'query': dense_vector,
                    'using': 'dense',
                    'limit': PREFETCH_LIMIT,
                    'filter': scope,
                    'score_threshold': 0,
                },
            ],
            'query': {'rrf': {}},
            'limit': 6,
        },
        'query': {
            'formula': {
                'mult': [
                    '$score',
                    {'sum': [1, {'mult': [{'sum': ['document_weight', -0.5]}, PRIORITY_BOOST]}]},
                ]
            },
            'defaults': {'document_weight': 0.5},
        },
        'limit': 2,
        'with_payload': True,
    }


def build_probe(client: Qdrant, organization_id: str, course_id: str) -> dict | None:
    """Measure one course. Returns None when this course cannot satisfy every check."""
    points = load_course_points(client, organization_id, course_id)
    scope = scoped_filter(organization_id, course_id)
    core = [p for p in points if p['payload'].get('document_priority') == 'CORE']
    supplementary = [p for p in points if p['payload'].get('document_priority') == 'SUPPLEMENTARY']
    if not core or not supplementary:
        return None

    # The dense anchor is a real CORE chunk's own vector, so the dense probe is exact by
    # construction: nothing in the course can be closer to it than itself.
    anchor = max(core, key=lambda p: len(p['payload']['content']))
    dense_vector = anchor['vector']['dense']

    dense_top = top_point(
        client,
        {'query': dense_vector, 'using': 'dense', 'filter': scope, 'limit': 3, 'with_payload': True},
    )
    if dense_top is None:
        return None

    ru_query = distinctive_query(anchor['payload']['content'], CYRILLIC_WORD, 6)
    if ru_query is None:
        return None
    ru_top = top_point(
        client,
        {
            'query': bm25(ru_query),
            'using': 'sparse',
            'filter': scope,
            'limit': 3,
            'with_payload': True,
        },
    )
    if ru_top is None:
        return None

    en_query = en_top = None
    for point in sorted(points, key=lambda p: -len(LATIN_WORD.findall(p['payload']['content']))):
        candidate = distinctive_query(point['payload']['content'], LATIN_WORD, 5)
        if candidate is None:
            continue
        found = top_point(
            client,
            {
                'query': bm25(candidate),
                'using': 'sparse',
                'filter': scope,
                'limit': 3,
                'with_payload': True,
            },
        )
        if found is not None:
            en_query, en_top = candidate, found
            break
    if en_top is None:
        return None

    # The formula check is the strict one: rank 1 must be CORE, rank 2 SUPPLEMENTARY, and the
    # scores strictly decreasing. Search real chunk text until a query produces that shape rather
    # than asserting a shape the data may not have.
    formula_query = formula_points = None
    for point in core:
        candidate = distinctive_query(point['payload']['content'], CYRILLIC_WORD, 4)
        if candidate is None:
            continue
        found = client.query(build_formula_query(candidate, dense_vector, scope))
        if (
            len(found) == 2
            and found[0]['payload'].get('document_priority') == 'CORE'
            and found[1]['payload'].get('document_priority') == 'SUPPLEMENTARY'
            and found[0]['score'] > found[1]['score']
        ):
            formula_query, formula_points = candidate, found
            break
    if formula_points is None:
        return None

    mismatched_organization, mismatched_course = pick_mismatched(client, organization_id, course_id)
    for label, bad_scope in (
        ('course', scoped_filter(organization_id, mismatched_course)),
        ('organization', scoped_filter(mismatched_organization, course_id)),
    ):
        leaked = client.query(
            {
                'query': bm25(ru_query),
                'using': 'sparse',
                'filter': bad_scope,
                'limit': 3,
                'with_payload': True,
            }
        )
        if leaked:
            raise SystemExit(f'mismatched {label} still returned points; probe would be a lie')

    return {
        'dense_vector': dense_vector,
        'ru_query': ru_query,
        'en_query': en_query,
        'formula_query': formula_query,
        'organization_id': organization_id,
        'course_id': course_id,
        'mismatched_organization_id': mismatched_organization,
        'mismatched_course_id': mismatched_course,
        'expected_dense': identity(dense_top),
        'expected_ru_bm25': identity(ru_top),
        'expected_en_bm25': identity(en_top),
        'expected_formula_order': [identity(formula_points[0]), identity(formula_points[1])],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:6335')
    parser.add_argument('--api-key-file', default='/opt/megacampus/secrets/qdrant_api_key')
    parser.add_argument('--out', required=True)
    parser.add_argument('--course-id')
    parser.add_argument('--organization-id')
    args = parser.parse_args()

    api_key = subprocess.run(
        ['sudo', 'cat', args.api_key_file], capture_output=True, text=True, check=True
    ).stdout.strip()
    client = Qdrant(args.url, api_key)

    if args.course_id and args.organization_id:
        candidates = [(args.organization_id, args.course_id)]
    else:
        candidates = find_candidate_courses(client)

    probe = None
    for organization_id, course_id in candidates:
        probe = build_probe(client, organization_id, course_id)
        if probe is not None:
            print(f'course {course_id} org {organization_id}', file=sys.stderr)
            break
        print(f'skipped {course_id}: cannot satisfy every check', file=sys.stderr)

    if probe is None:
        raise SystemExit(f'none of the {len(candidates)} candidate courses could carry the probe')

    with open(args.out, 'w', encoding='utf-8') as handle:
        json.dump(probe, handle, ensure_ascii=False, indent=2)
        handle.write('\n')

    print(
        f"wrote {args.out}: dense={len(probe['dense_vector'])}d "
        f"ru={probe['ru_query']!r} en={probe['en_query']!r}"
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
