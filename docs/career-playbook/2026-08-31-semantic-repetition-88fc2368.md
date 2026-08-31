# Career Playbook semantic repetition evaluation

Generated: 2026-08-31T04:52:31.683Z
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
| P01   | `6fa8573e83a3` | en       |     112301 |                 191 |

## Summary

| Unit                             | Compared pairs | ≥0.85 | Too-close rate |    p50 |    p90 |    p95 |    p99 |    max |
| -------------------------------- | -------------: | ----: | -------------: | -----: | -----: | -----: | -----: | -----: |
| Audience-view block pairs        |            471 |     2 |          0.42% | 0.5945 | 0.7246 | 0.7533 | 0.8098 | 0.8667 |
| Paragraph pairs within one block |            747 |     0 |          0.00% | 0.4179 | 0.6025 | 0.6515 | 0.7393 | 0.8306 |

## Audience-view threshold matrix

| Audience | Pairs |      ≥0.75 |     ≥0.80 |     ≥0.85 |     ≥0.90 |
| -------- | ----: | ---------: | --------: | --------: | --------: |
| employee |   190 | 11 (5.79%) | 3 (1.58%) | 1 (0.53%) | 0 (0.00%) |
| manager  |   190 | 16 (8.42%) | 3 (1.58%) | 1 (0.53%) | 0 (0.00%) |
| hr       |    91 |  5 (5.49%) | 1 (1.10%) | 0 (0.00%) | 0 (0.00%) |

## Intra-block threshold matrix

| Pairs |     ≥0.75 |     ≥0.80 |     ≥0.85 |     ≥0.90 |
| ----: | --------: | --------: | --------: | --------: |
|   747 | 6 (0.80%) | 1 (0.13%) | 0 (0.00%) | 0 (0.00%) |

## Top audience-view block pairs

| Rank | Playbook | Audience | Block A                           | Block B                             | Similarity |
| ---: | -------- | -------- | --------------------------------- | ----------------------------------- | ---------: |
|    1 | P01      | employee | block_1 — Mission and key results | block_6 — KPI and metrics           |     0.8667 |
|    2 | P01      | manager  | block_1 — Mission and key results | block_6 — KPI and metrics           |     0.8667 |
|    3 | P01      | employee | header — Role guide header        | block_24 — Role Canvas              |     0.8166 |
|    4 | P01      | manager  | header — Role guide header        | block_24 — Role Canvas              |     0.8166 |
|    5 | P01      | hr       | header — Role guide header        | block_24 — Role Canvas              |     0.8166 |
|    6 | P01      | employee | block_20 — Business model         | block_24 — Role Canvas              |     0.8098 |
|    7 | P01      | manager  | block_20 — Business model         | block_24 — Role Canvas              |     0.8098 |
|    8 | P01      | employee | block_6 — KPI and metrics         | block_20 — Business model           |     0.7944 |
|    9 | P01      | manager  | block_6 — KPI and metrics         | block_20 — Business model           |     0.7944 |
|   10 | P01      | employee | block_1 — Mission and key results | block_24 — Role Canvas              |     0.7937 |
|   11 | P01      | manager  | block_1 — Mission and key results | block_24 — Role Canvas              |     0.7937 |
|   12 | P01      | hr       | block_1 — Mission and key results | block_24 — Role Canvas              |     0.7937 |
|   13 | P01      | manager  | block_16 — Main process           | block_23 — Continuity plan          |     0.7908 |
|   14 | P01      | employee | block_1 — Mission and key results | block_20 — Business model           |     0.7880 |
|   15 | P01      | manager  | block_1 — Mission and key results | block_20 — Business model           |     0.7880 |
|   16 | P01      | manager  | block_16 — Main process           | block_26 — Implementation checklist |     0.7741 |
|   17 | P01      | employee | block_10 — Dependencies           | block_16 — Main process             |     0.7590 |
|   18 | P01      | manager  | block_10 — Dependencies           | block_16 — Main process             |     0.7590 |
|   19 | P01      | manager  | block_14 — Onboarding             | block_26 — Implementation checklist |     0.7573 |
|   20 | P01      | hr       | block_14 — Onboarding             | block_26 — Implementation checklist |     0.7573 |

## Top paragraph pairs within one block

| Rank | Playbook | Block                               | Paragraphs | Similarity |
| ---: | -------- | ----------------------------------- | ---------- | ---------: |
|    1 | P01      | block_11 — Career path              | 2 ↔ 3     |     0.8306 |
|    2 | P01      | block_26 — Implementation checklist | 4 ↔ 7     |     0.7992 |
|    3 | P01      | block_3 — Responsibility zones      | 5 ↔ 12    |     0.7868 |
|    4 | P01      | block_10 — Dependencies             | 2 ↔ 4     |     0.7733 |
|    5 | P01      | block_14 — Onboarding               | 4 ↔ 5     |     0.7689 |
|    6 | P01      | block_6 — KPI and metrics           | 2 ↔ 6     |     0.7578 |
|    7 | P01      | block_3 — Responsibility zones      | 3 ↔ 14    |     0.7429 |
|    8 | P01      | block_3 — Responsibility zones      | 3 ↔ 5     |     0.7419 |
|    9 | P01      | block_9 — Human-AI collaboration    | 3 ↔ 4     |     0.7393 |
|   10 | P01      | block_3 — Responsibility zones      | 7 ↔ 14    |     0.7345 |
|   11 | P01      | block_14 — Onboarding               | 3 ↔ 4     |     0.7297 |
|   12 | P01      | block_3 — Responsibility zones      | 3 ↔ 12    |     0.7292 |
|   13 | P01      | block_11 — Career path              | 2 ↔ 6     |     0.7147 |
|   14 | P01      | block_10 — Dependencies             | 2 ↔ 7     |     0.7146 |
|   15 | P01      | block_14 — Onboarding               | 3 ↔ 6     |     0.7124 |
|   16 | P01      | block_11 — Career path              | 3 ↔ 6     |     0.7091 |
|   17 | P01      | block_21 — Failure modes            | 8 ↔ 10    |     0.7088 |
|   18 | P01      | block_14 — Onboarding               | 3 ↔ 5     |     0.7081 |
|   19 | P01      | block_26 — Implementation checklist | 2 ↔ 3     |     0.7071 |
|   20 | P01      | block_17 — Red flags                | 1 ↔ 4     |     0.7052 |

## Reproduction

```bash
cd /home/me/code/mc2/packages/course-gen-platform
set -a; . .env; set +a
TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --mode evaluation --playbook-id <completed-playbook-uuid> --threshold 0.85 --out <evaluation-report-path> --cache .cache/career-playbook-repetition/jina-embeddings-v3.json
```

Jina run stats: 6 paid HTTP batches in this invocation, 59277 input tokens, $0.002964 at the repository catalogue rate. Cache hits cost $0.
