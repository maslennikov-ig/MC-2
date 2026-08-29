# Career Playbook semantic repetition evaluation

Generated: 2026-08-29T14:50:15.120Z
Cohort size: **1**

## Method

- Source: one exact `career_playbooks.id` requested by the operator; it must resolve to exactly one `completed` row with all 27 stored blocks.
- Stored shape: 27 blocks = `header` + 26 content blocks (`block_1`…`block_26`).
- Audience views: canonical phase-0 map copied from `specs/028-role-guide-audiences/spec.md` section 3: employee 20, manager 20, HR 14 blocks, including header.
- Inter-block unit: one pair occurrence inside one audience-view. A block pair shared by two views is intentionally counted twice because those are two separately read documents; pairs with no shared view are not compared.
- Intra-block unit: paragraphs of at least 100 normalized characters, split on Markdown blank lines; paragraphs are compared only with paragraphs from the same block.
- Embeddings: existing `generateEmbeddings(..., retrieval.passage)` Jina path, including the shared Jina distributed rate/concurrency limiters; cosine similarity is `QualityValidator.cosineSimilarity`.
- Fixed evaluation threshold: **0.85**. Evaluation never selects a threshold from one playbook and zero too-close pairs is a valid measured result.
- Resume cache: content-addressed SHA-256 → embedding records at `.cache/career-playbook-repetition/jina-embeddings-v3.json`; it contains no source prose and is atomically replaced after every successful batch.
- No customer prose is stored in this artifact. Examples identify only the playbook alias, block topic and paragraph ordinal.

## Snapshot

| Alias | id sha256/12   | Language | Characters | Semantic paragraphs |
| ----- | -------------- | -------- | ---------: | ------------------: |
| P01   | `d2668f6890ea` | en       |      94308 |                 144 |

## Summary

| Unit                             | Compared pairs | ≥0.85 | Too-close rate |    p50 |    p90 |    p95 |    p99 |    max |
| -------------------------------- | -------------: | ----: | -------------: | -----: | -----: | -----: | -----: | -----: |
| Audience-view block pairs        |            471 |     0 |          0.00% | 0.5397 | 0.6847 | 0.7091 | 0.7723 | 0.8316 |
| Paragraph pairs within one block |            375 |     0 |          0.00% | 0.4319 | 0.6116 | 0.6702 | 0.7620 | 0.8096 |

## Audience-view threshold matrix

| Audience | Pairs |     ≥0.75 |     ≥0.80 |     ≥0.85 |     ≥0.90 |
| -------- | ----: | --------: | --------: | --------: | --------: |
| employee |   190 | 4 (2.11%) | 2 (1.05%) | 0 (0.00%) | 0 (0.00%) |
| manager  |   190 | 5 (2.63%) | 2 (1.05%) | 0 (0.00%) | 0 (0.00%) |
| hr       |    91 | 1 (1.10%) | 1 (1.10%) | 0 (0.00%) | 0 (0.00%) |

## Intra-block threshold matrix

| Pairs |     ≥0.75 |     ≥0.80 |     ≥0.85 |     ≥0.90 |
| ----: | --------: | --------: | --------: | --------: |
|   375 | 7 (1.87%) | 2 (0.53%) | 0 (0.00%) | 0 (0.00%) |

## Top audience-view block pairs

| Rank | Playbook | Audience | Block A                           | Block B                             | Similarity |
| ---: | -------- | -------- | --------------------------------- | ----------------------------------- | ---------: |
|    1 | P01      | employee | block_1 — Mission and key results | block_24 — Role Canvas              |     0.8316 |
|    2 | P01      | manager  | block_1 — Mission and key results | block_24 — Role Canvas              |     0.8316 |
|    3 | P01      | hr       | block_1 — Mission and key results | block_24 — Role Canvas              |     0.8316 |
|    4 | P01      | employee | block_4 — Duties                  | block_16 — Main process             |     0.8206 |
|    5 | P01      | manager  | block_4 — Duties                  | block_16 — Main process             |     0.8206 |
|    6 | P01      | manager  | block_6 — KPI and metrics         | block_17 — Red flags                |     0.7723 |
|    7 | P01      | employee | block_4 — Duties                  | block_13 — Day in the life          |     0.7638 |
|    8 | P01      | manager  | block_17 — Red flags              | block_21 — Failure modes            |     0.7616 |
|    9 | P01      | employee | block_3 — Responsibility zones    | block_24 — Role Canvas              |     0.7611 |
|   10 | P01      | manager  | block_3 — Responsibility zones    | block_24 — Role Canvas              |     0.7611 |
|   11 | P01      | employee | block_6 — KPI and metrics         | block_20 — Business model           |     0.7400 |
|   12 | P01      | manager  | block_6 — KPI and metrics         | block_20 — Business model           |     0.7400 |
|   13 | P01      | manager  | block_16 — Main process           | block_26 — Implementation checklist |     0.7375 |
|   14 | P01      | hr       | block_7 — Competencies            | block_12 — Candidate profile        |     0.7320 |
|   15 | P01      | employee | block_4 — Duties                  | block_10 — Dependencies             |     0.7259 |
|   16 | P01      | manager  | block_4 — Duties                  | block_10 — Dependencies             |     0.7259 |
|   17 | P01      | hr       | block_12 — Candidate profile      | block_24 — Role Canvas              |     0.7249 |
|   18 | P01      | employee | block_14 — Onboarding             | block_24 — Role Canvas              |     0.7236 |
|   19 | P01      | manager  | block_14 — Onboarding             | block_24 — Role Canvas              |     0.7236 |
|   20 | P01      | hr       | block_14 — Onboarding             | block_24 — Role Canvas              |     0.7236 |

## Top paragraph pairs within one block

| Rank | Playbook | Block                               | Paragraphs | Similarity |
| ---: | -------- | ----------------------------------- | ---------- | ---------: |
|    1 | P01      | block_7 — Competencies              | 2 ↔ 3     |     0.8096 |
|    2 | P01      | block_4 — Duties                    | 4 ↔ 5     |     0.8009 |
|    3 | P01      | block_4 — Duties                    | 4 ↔ 6     |     0.7814 |
|    4 | P01      | block_4 — Duties                    | 5 ↔ 6     |     0.7668 |
|    5 | P01      | block_26 — Implementation checklist | 3 ↔ 5     |     0.7620 |
|    6 | P01      | block_7 — Competencies              | 1 ↔ 2     |     0.7609 |
|    7 | P01      | block_26 — Implementation checklist | 1 ↔ 4     |     0.7541 |
|    8 | P01      | block_7 — Competencies              | 1 ↔ 3     |     0.7381 |
|    9 | P01      | block_13 — Day in the life          | 2 ↔ 4     |     0.7378 |
|   10 | P01      | block_1 — Mission and key results   | 2 ↔ 4     |     0.7353 |
|   11 | P01      | block_4 — Duties                    | 3 ↔ 4     |     0.7337 |
|   12 | P01      | block_4 — Duties                    | 3 ↔ 5     |     0.7239 |
|   13 | P01      | block_14 — Onboarding               | 2 ↔ 3     |     0.6961 |
|   14 | P01      | block_26 — Implementation checklist | 1 ↔ 2     |     0.6881 |
|   15 | P01      | block_9 — Human-AI collaboration    | 1 ↔ 2     |     0.6875 |
|   16 | P01      | block_6 — KPI and metrics           | 2 ↔ 3     |     0.6873 |
|   17 | P01      | block_6 — KPI and metrics           | 2 ↔ 4     |     0.6863 |
|   18 | P01      | block_6 — KPI and metrics           | 2 ↔ 6     |     0.6734 |
|   19 | P01      | block_8 — Tools and technologies    | 2 ↔ 3     |     0.6718 |
|   20 | P01      | block_26 — Implementation checklist | 2 ↔ 4     |     0.6702 |

## Reproduction

```bash
cd /home/me/code/mc2/packages/course-gen-platform
set -a; . .env; set +a
TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --mode evaluation --playbook-id <completed-playbook-uuid> --threshold 0.85 --out <evaluation-report-path> --cache .cache/career-playbook-repetition/jina-embeddings-v3.json
```

Jina run stats: 5 paid HTTP batches in this invocation, 49680 input tokens, $0.002484 at the repository catalogue rate. Cache hits cost $0.
