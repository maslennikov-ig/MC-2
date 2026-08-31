# Career Playbook semantic repetition evaluation

Generated: 2026-08-31T09:50:58.653Z
Cohort size: **1**

## Method

- Source: one exact `career_playbooks.id` requested by the operator; it must resolve to exactly one `completed` row with all 27 stored blocks.
- Stored shape: 27 blocks = `header` + 26 content blocks.
- Audience views: read live from `CAREER_PLAYBOOK_BLOCK_CATALOG`, the same map the pipeline judges with: employee 20, manager 20, HR 14 blocks, including header.
- Inter-block unit: one pair occurrence inside one audience-view. A block pair shared by two views is intentionally counted twice because those are two separately read documents; pairs with no shared view are not compared.
- Intra-block unit: paragraphs of at least 100 normalized characters, split on Markdown blank lines; paragraphs are compared only with paragraphs from the same block.
- Embeddings: existing `generateEmbeddings(..., retrieval.passage)` Jina path, including the shared Jina distributed rate/concurrency limiters; cosine similarity is `QualityValidator.cosineSimilarity`.
- Fixed evaluation threshold: **0.85**. Evaluation never selects a threshold from one playbook and zero too-close pairs is a valid measured result.
- Resume cache: content-addressed SHA-256 → embedding records at `.cache/career-playbook-repetition/jina-embeddings-v3.json`; it contains no source prose and is atomically replaced after every successful batch.
- No customer prose is stored in this artifact. Examples identify only the playbook alias, block topic and paragraph ordinal.

## Snapshot

| Alias | id sha256/12   | Language | Characters | Semantic paragraphs |
| ----- | -------------- | -------- | ---------: | ------------------: |
| P01   | `c3ea8d382336` | en       |     130493 |                 217 |

## Summary

| Unit                             | Compared pairs | ≥0.85 | Too-close rate |    p50 |    p90 |    p95 |    p99 |    max |
| -------------------------------- | -------------: | ----: | -------------: | -----: | -----: | -----: | -----: | -----: |
| Audience-view block pairs        |            471 |     1 |          0.21% | 0.5825 | 0.7183 | 0.7446 | 0.7942 | 0.8762 |
| Paragraph pairs within one block |           1092 |     0 |          0.00% | 0.4046 | 0.6327 | 0.6878 | 0.7657 | 0.8410 |

## Audience-view threshold matrix

| Audience | Pairs |      ≥0.75 |     ≥0.80 |     ≥0.85 |     ≥0.90 |
| -------- | ----: | ---------: | --------: | --------: | --------: |
| employee |   190 |  8 (4.21%) | 2 (1.05%) | 0 (0.00%) | 0 (0.00%) |
| manager  |   190 | 11 (5.79%) | 2 (1.05%) | 0 (0.00%) | 0 (0.00%) |
| hr       |    91 |  4 (4.40%) | 1 (1.10%) | 1 (1.10%) | 0 (0.00%) |

## Intra-block threshold matrix

| Pairs |      ≥0.75 |     ≥0.80 |     ≥0.85 |     ≥0.90 |
| ----: | ---------: | --------: | --------: | --------: |
|  1092 | 17 (1.56%) | 5 (0.46%) | 0 (0.00%) | 0 (0.00%) |

## Top audience-view block pairs

| Rank | Playbook | Audience | Block A                           | Block B                             | Similarity |
| ---: | -------- | -------- | --------------------------------- | ----------------------------------- | ---------: |
|    1 | P01      | hr       | block_7 — Competencies            | block_12 — Candidate profile        |     0.8762 |
|    2 | P01      | employee | block_3 — Responsibility zones    | block_4 — Duties                    |     0.8250 |
|    3 | P01      | manager  | block_3 — Responsibility zones    | block_4 — Duties                    |     0.8250 |
|    4 | P01      | employee | block_6 — KPI and metrics         | block_16 — Main process             |     0.8077 |
|    5 | P01      | manager  | block_6 — KPI and metrics         | block_16 — Main process             |     0.8077 |
|    6 | P01      | employee | block_1 — Mission and key results | block_6 — KPI and metrics           |     0.7942 |
|    7 | P01      | manager  | block_1 — Mission and key results | block_6 — KPI and metrics           |     0.7942 |
|    8 | P01      | employee | block_10 — Dependencies           | block_16 — Main process             |     0.7901 |
|    9 | P01      | manager  | block_10 — Dependencies           | block_16 — Main process             |     0.7901 |
|   10 | P01      | employee | block_1 — Mission and key results | block_24 — Role Canvas              |     0.7875 |
|   11 | P01      | manager  | block_1 — Mission and key results | block_24 — Role Canvas              |     0.7875 |
|   12 | P01      | hr       | block_1 — Mission and key results | block_24 — Role Canvas              |     0.7875 |
|   13 | P01      | manager  | block_16 — Main process           | block_26 — Implementation checklist |     0.7855 |
|   14 | P01      | employee | block_4 — Duties                  | block_16 — Main process             |     0.7836 |
|   15 | P01      | manager  | block_4 — Duties                  | block_16 — Main process             |     0.7836 |
|   16 | P01      | manager  | block_2 — Anti-goals              | block_21 — Failure modes            |     0.7742 |
|   17 | P01      | manager  | block_1 — Mission and key results | block_26 — Implementation checklist |     0.7718 |
|   18 | P01      | hr       | block_1 — Mission and key results | block_26 — Implementation checklist |     0.7718 |
|   19 | P01      | hr       | block_12 — Candidate profile      | block_24 — Role Canvas              |     0.7592 |
|   20 | P01      | employee | block_3 — Responsibility zones    | block_24 — Role Canvas              |     0.7591 |

## Top paragraph pairs within one block

| Rank | Playbook | Block                            | Paragraphs | Similarity |
| ---: | -------- | -------------------------------- | ---------- | ---------: |
|    1 | P01      | block_11 — Career path           | 4 ↔ 6     |     0.8410 |
|    2 | P01      | block_4 — Duties                 | 9 ↔ 27    |     0.8389 |
|    3 | P01      | block_4 — Duties                 | 5 ↔ 19    |     0.8385 |
|    4 | P01      | block_11 — Career path           | 4 ↔ 5     |     0.8174 |
|    5 | P01      | block_3 — Responsibility zones   | 3 ↔ 11    |     0.8038 |
|    6 | P01      | block_4 — Duties                 | 5 ↔ 13    |     0.7946 |
|    7 | P01      | block_6 — KPI and metrics        | 6 ↔ 11    |     0.7925 |
|    8 | P01      | block_3 — Responsibility zones   | 7 ↔ 13    |     0.7891 |
|    9 | P01      | block_4 — Duties                 | 15 ↔ 25   |     0.7862 |
|   10 | P01      | block_20 — Business model        | 2 ↔ 3     |     0.7667 |
|   11 | P01      | block_7 — Competencies           | 3 ↔ 4     |     0.7659 |
|   12 | P01      | block_4 — Duties                 | 12 ↔ 18   |     0.7657 |
|   13 | P01      | block_14 — Onboarding            | 4 ↔ 6     |     0.7643 |
|   14 | P01      | block_4 — Duties                 | 5 ↔ 21    |     0.7597 |
|   15 | P01      | block_3 — Responsibility zones   | 11 ↔ 13   |     0.7565 |
|   16 | P01      | block_9 — Human-AI collaboration | 5 ↔ 6     |     0.7522 |
|   17 | P01      | block_11 — Career path           | 5 ↔ 6     |     0.7522 |
|   18 | P01      | block_4 — Duties                 | 5 ↔ 15    |     0.7439 |
|   19 | P01      | block_3 — Responsibility zones   | 7 ↔ 11    |     0.7422 |
|   20 | P01      | block_4 — Duties                 | 5 ↔ 9     |     0.7363 |

## Reproduction

```bash
cd /home/me/code/mc2/packages/course-gen-platform
set -a; . .env; set +a
TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --mode evaluation --playbook-id <completed-playbook-uuid> --threshold 0.85 --out <evaluation-report-path> --cache .cache/career-playbook-repetition/jina-embeddings-v3.json
```

Jina run stats: 7 paid HTTP batches in this invocation, 67915 input tokens, $0.003396 at the repository catalogue rate. Cache hits cost $0.
