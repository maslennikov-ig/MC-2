# Career Playbook semantic repetition baseline

Generated: 2026-08-29T11:09:29.804Z

## Method

- Source: read-only query of `career_playbooks` with `status = completed`; exactly 14 rows containing all 27 stored blocks were eligible. The incomplete two-block completed fixture was excluded.
- Stored shape: 27 blocks = `header` + 26 content blocks (`block_1`…`block_26`).
- Audience views: canonical phase-0 map copied from `specs/028-role-guide-audiences/spec.md` section 3: employee 20, manager 20, HR 14 blocks, including header.
- Inter-block unit: one pair occurrence inside one audience-view. A block pair shared by two views is intentionally counted twice because those are two separately read documents; pairs with no shared view are not compared.
- Intra-block unit: paragraphs of at least 100 normalized characters, split on Markdown blank lines; paragraphs are compared only with paragraphs from the same block.
- Embeddings: existing `generateEmbeddings(..., retrieval.passage)` Jina path, including the shared Jina distributed rate/concurrency limiters; cosine similarity is `QualityValidator.cosineSimilarity`.
- Working too-close threshold: **0.85**, selected only after measurement as the highest candidate in 0.75/0.80/0.85/0.90 retaining at least five pair occurrences in both metric families. This favors precision while requiring a replicated signal; the full matrix remains the calibration evidence.
- Resume cache: content-addressed SHA-256 → embedding records at `.cache/career-playbook-repetition/jina-embeddings-v3.json`; it contains no source prose and is atomically replaced after every successful batch.
- No customer prose is stored in this artifact. Examples identify only the playbook alias, block topic and paragraph ordinal.

## Snapshot

| Alias | id sha256/12 | Language | Characters | Semantic paragraphs |
| --- | --- | --- | ---: | ---: |
| P01 | `6395b5f9cd2e` | ru | 52122 | 132 |
| P02 | `e744615ce64f` | ru | 62359 | 148 |
| P03 | `fc063a949fda` | ru | 71017 | 142 |
| P04 | `6bb4cfe5ba7d` | ru | 74742 | 154 |
| P05 | `113e791d28b3` | ru | 64068 | 144 |
| P06 | `7e8ace983dea` | ru | 75697 | 161 |
| P07 | `e59fa24dc439` | en | 133970 | 249 |
| P08 | `d09d3a64caf5` | en | 61102 | 115 |
| P09 | `8eb6215118b3` | en | 64653 | 124 |
| P10 | `7890f1e69f5a` | ru | 71459 | 135 |
| P11 | `ade84257b4ea` | ru | 95384 | 163 |
| P12 | `d373335584bf` | en | 82393 | 140 |
| P13 | `6e6f47153972` | en | 85306 | 143 |
| P14 | `0f49ec1f2b59` | ru | 67455 | 124 |

## Summary

| Unit | Compared pairs | ≥0.85 | Too-close rate | p50 | p90 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Audience-view block pairs | 6594 | 8 | 0.12% | 0.5045 | 0.6596 | 0.6986 | 0.7555 | 0.8784 |
| Paragraph pairs within one block | 6829 | 18 | 0.26% | 0.4085 | 0.6217 | 0.6810 | 0.7889 | 0.9456 |

## Audience-view threshold matrix

| Audience | Pairs | ≥0.75 | ≥0.80 | ≥0.85 | ≥0.90 |
| --- | ---: | ---: | ---: | ---: | ---: |
| employee | 2660 | 36 (1.35%) | 10 (0.38%) | 3 (0.11%) | 0 (0.00%) |
| manager | 2660 | 33 (1.24%) | 10 (0.38%) | 4 (0.15%) | 0 (0.00%) |
| hr | 1274 | 10 (0.78%) | 3 (0.24%) | 1 (0.08%) | 0 (0.00%) |

## Intra-block threshold matrix

| Pairs | ≥0.75 | ≥0.80 | ≥0.85 | ≥0.90 |
| ---: | ---: | ---: | ---: | ---: |
| 6829 | 143 (2.09%) | 55 (0.81%) | 18 (0.26%) | 5 (0.07%) |

## Top audience-view block pairs

| Rank | Playbook | Audience | Block A | Block B | Similarity |
| ---: | --- | --- | --- | --- | ---: |
| 1 | P06 | employee | block_14 — Onboarding | block_18 — FAQ | 0.8784 |
| 2 | P06 | manager | block_14 — Onboarding | block_18 — FAQ | 0.8784 |
| 3 | P06 | employee | block_2 — Anti-goals | block_20 — Business model | 0.8639 |
| 4 | P06 | manager | block_2 — Anti-goals | block_20 — Business model | 0.8639 |
| 5 | P08 | employee | block_1 — Mission and key results | block_24 — Role Canvas | 0.8603 |
| 6 | P08 | manager | block_1 — Mission and key results | block_24 — Role Canvas | 0.8603 |
| 7 | P08 | hr | block_1 — Mission and key results | block_24 — Role Canvas | 0.8603 |
| 8 | P06 | manager | block_6 — KPI and metrics | block_7 — Competencies | 0.8551 |
| 9 | P12 | employee | block_4 — Duties | block_13 — Day in the life | 0.8292 |
| 10 | P10 | employee | block_1 — Mission and key results | block_24 — Role Canvas | 0.8281 |
| 11 | P10 | manager | block_1 — Mission and key results | block_24 — Role Canvas | 0.8281 |
| 12 | P10 | hr | block_1 — Mission and key results | block_24 — Role Canvas | 0.8281 |
| 13 | P08 | employee | block_3 — Responsibility zones | block_4 — Duties | 0.8241 |
| 14 | P08 | manager | block_3 — Responsibility zones | block_4 — Duties | 0.8241 |
| 15 | P07 | employee | block_1 — Mission and key results | block_2 — Anti-goals | 0.8192 |
| 16 | P07 | manager | block_1 — Mission and key results | block_2 — Anti-goals | 0.8192 |
| 17 | P03 | employee | block_14 — Onboarding | block_24 — Role Canvas | 0.8070 |
| 18 | P03 | manager | block_14 — Onboarding | block_24 — Role Canvas | 0.8070 |
| 19 | P03 | hr | block_14 — Onboarding | block_24 — Role Canvas | 0.8070 |
| 20 | P13 | employee | block_3 — Responsibility zones | block_4 — Duties | 0.8066 |

## Top paragraph pairs within one block

| Rank | Playbook | Block | Paragraphs | Similarity |
| ---: | --- | --- | --- | ---: |
| 1 | P11 | block_14 — Onboarding | 3 ↔ 5 | 0.9456 |
| 2 | P06 | block_18 — FAQ | 11 ↔ 15 | 0.9283 |
| 3 | P14 | block_11 — Career path | 3 ↔ 4 | 0.9137 |
| 4 | P03 | block_26 — Implementation checklist | 1 ↔ 3 | 0.9075 |
| 5 | P11 | block_4 — Duties | 3 ↔ 5 | 0.9030 |
| 6 | P05 | block_11 — Career path | 2 ↔ 3 | 0.8857 |
| 7 | P10 | block_9 — Human-AI collaboration | 1 ↔ 4 | 0.8833 |
| 8 | P10 | block_14 — Onboarding | 2 ↔ 4 | 0.8798 |
| 9 | P13 | block_4 — Duties | 3 ↔ 4 | 0.8748 |
| 10 | P02 | block_5 — Decision authority matrix | 1 ↔ 5 | 0.8731 |
| 11 | P06 | block_3 — Responsibility zones | 2 ↔ 3 | 0.8710 |
| 12 | P11 | block_4 — Duties | 3 ↔ 6 | 0.8674 |
| 13 | P06 | block_2 — Anti-goals | 1 ↔ 3 | 0.8645 |
| 14 | P06 | block_18 — FAQ | 7 ↔ 15 | 0.8590 |
| 15 | P02 | block_4 — Duties | 3 ↔ 4 | 0.8540 |
| 16 | P12 | block_13 — Day in the life | 2 ↔ 4 | 0.8522 |
| 17 | P13 | block_6 — KPI and metrics | 1 ↔ 2 | 0.8511 |
| 18 | P13 | block_13 — Day in the life | 4 ↔ 8 | 0.8504 |
| 19 | P11 | block_4 — Duties | 3 ↔ 4 | 0.8433 |
| 20 | P06 | block_18 — FAQ | 7 ↔ 11 | 0.8424 |

## Manual validation of the signal

A read-only spot-check of the highest outliers confirmed substantive repetition without copying
customer prose into this artifact:

- P06 `Onboarding ↔ FAQ` repeats the same 30-60-90 onboarding plan; the FAQ block is carrying
  onboarding material rather than merely using related vocabulary.
- P06 `Anti-goals ↔ Business model` repeats the same business-goal, revenue, CAC and channel-impact
  material across two differently assigned blocks.
- The top P11 within-Onboarding pair repeats sprint-readiness criteria with nearly the same
  checklist structure.

The baseline therefore contains meaningful semantic repeats at 0.85. Phase B has a real signal to
reduce; this is not a stop caused by an empty or mis-specified metric.

## Reproduction

```bash
cd /home/me/code/mc2/packages/course-gen-platform
set -a; . .env; set +a
TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --out ../../docs/career-playbook/2026-08-29-semantic-repetition-baseline.md --cache .cache/career-playbook-repetition/jina-embeddings-v3.json
```

Jina run stats: 62 paid HTTP batches in this invocation, 588993 input tokens, $0.029450 at the repository catalogue rate. Cache hits cost $0.
