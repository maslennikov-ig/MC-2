# 027 — Parent context expansion: search small, answer large

**Status**: implemented — `217e3d112`, 2026-08-13
**Owner decision**: taken 2026-08-13 — implement the design already recorded in
`docs/RAG-CHUNKING-STRATEGY.md` (T075, 2025-10-24), with the context window set to the matched
chunk's own siblings.
**Supersedes nothing.** This finishes an existing design; it does not introduce a new one.

---

## 1. Why

`docs/RAG-CHUNKING-STRATEGY.md` states the intent in one line:

> Index small chunks (400 tokens) for precision, return large chunks (1500 tokens) for context.

Its retrieval flow is explicit: search finds **child** chunks, then parents are **fetched** for the
matched children and handed to the model. Its usage example separates the two actions:

```ts
await uploadChunksToQdrant(result.child_chunks); // Index children
await storeParentChunks(result.parent_chunks); // Store parents for retrieval
```

`storeParentChunks` was never written. With nowhere to put parents, the pipeline uploaded them into
the same Qdrant collection as the children, so the system pays to search a grain it was never meant
to search, and no caller ever expands a result into its context.

Two further deviations from the same document caused the duplicate half of the collection and are
already fixed (`mc2-5fpaf`): the document specified a heading splitter and the code used a
similarly-named class that does not split on headings; the document recorded ~2.5 characters per
token for Russian and the code assumed 4. Measurement gave 2.33 — the document was right.

### What measurement adds

Over six real Docling conversions in the production container, after `selectIndexableChunks`:

| Fact                                              | Value                               |
| ------------------------------------------------- | ----------------------------------- |
| Parent share of indexed points                    | 26.2%                               |
| Parent embedding tokens over child tokens         | **+91.2%**                          |
| Parents fully reconstructible from their children | **57 of 57** (word coverage 1.0000) |

A parent carries no text of its own. So the design's separate parent store is not needed either: the
context can be rebuilt from siblings that are already indexed. This is cheaper than the original
design and requires no schema migration.

### Urgency

The parent grain is currently absent from production only because it was deleted on 2026-08-12. The
native chunker produces no degenerate parents, so **the next document processed re-introduces parent
points on its own**, silently, at the +91.2% cost. This work must land before the next Stage 2 run.

---

## 2. Scope

### In

1. Index the child grain only. A parent never reaches Qdrant.
2. Expand a matched child into its parent-sized context by fetching its siblings, which are already
   indexed, and stitching them in order.
3. Apply expansion in the RAG consumers, inside their existing token budgets.
4. Prove the invariant with tests: no parent point is ever uploaded, and no text is lost by dropping
   the parent grain.

### Out

- Reindexing existing documents. The current collection is child-only already; the fix changes what
  future documents write.
- Removing `parent_chunks` from the chunking result. Parents remain the grouping that defines
  siblings and provenance aggregation.
- Changing retrieval scoring, thresholds, fusion or reranking.
- `getParentChunk` as a Qdrant lookup: it cannot work once parents are not indexed, and it is
  replaced by sibling stitching.

---

## 3. Design

### 3.1 Indexing

`selectIndexableChunks` returns children only, plus any parent that has **no** children. A childless
parent is the sole carrier of its text — dropping it would lose content, which is the one outcome
this change must not cause.

### 3.2 Expansion

Given a search result carrying `document_id`, `chunk_id`, `sibling_chunk_ids` and `chunk_index`:

1. Point ids are deterministic — `generatePointId(document_id, chunk_id)` — so sibling point ids are
   computed, not searched. One `retrieve` call per document, no filtered scan.
2. Siblings are ordered by `chunk_index` and concatenated.
3. Consecutive pieces overlap by design (`child_chunk_overlap`), so the repeated boundary is removed
   when stitching rather than duplicated into the prompt.
4. The matched chunk is always included, even when a sibling fetch fails. Expansion is an
   enhancement: if it cannot complete, the caller still gets what it retrieved.

### 3.3 Budget

Expansion multiplies context roughly threefold (measured 291 → 888 tokens per result). Consumers
carry explicit budgets — `LESSON_RAG_CONFIG.MAX_TOKENS` 20 000, section-level 40 000. Expansion
takes results in relevance order and stops when the next expanded result would exceed the budget,
falling back to the unexpanded chunk for the remainder. A budget is never exceeded to expand.

### 3.4 Deduplication

Two results from the same parent expand to the same text. After expansion, results are deduplicated
so one passage never occupies two slots.

---

## 4. Acceptance

| #   | Criterion                                                                                       |
| --- | ----------------------------------------------------------------------------------------------- |
| 1   | Uploading a chunking result sends zero points with `level: 'parent'`, except childless parents. |
| 2   | Every parent's text remains reachable: union of indexed chunks covers all parent text.          |
| 3   | Expanding a matched child returns its siblings' text in `chunk_index` order, overlap removed.   |
| 4   | Expansion never exceeds the caller's token budget and degrades to unexpanded results instead.   |
| 5   | A failed sibling fetch still returns the matched chunk.                                         |
| 6   | Two results sharing a parent yield one expanded passage, not two.                               |
| 7   | `pnpm type-check`, `pnpm build`, and the backend unit suite pass.                               |

---

## 5. Risks

- **Prompt growth.** Mitigated by 3.3: the budget is a hard stop, not a target.
- **Legacy overlap artefacts.** Legacy children overlap by construction; 3.2.3 removes the repeated
  boundary. Native children do not overlap, so stitching is a plain join.
- **Behaviour change without a reindex.** Existing points carry `sibling_chunk_ids: []`, so
  expansion is a no-op on today's collection and only takes effect for documents chunked after this
  change. That is deliberate: it makes the rollout gradual rather than a step change.

---

## 6. Work items

| Issue       | Title                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| `mc2-0fmnn` | Parent tier: stop indexing it, expand from siblings instead (parent issue)   |
| child 1     | Index the child grain only, keeping childless parents                        |
| child 2     | Build sibling-based context expansion with overlap removal and a budget stop |
| child 3     | Apply expansion in the Stage 5 and Stage 6 RAG consumers                     |
| child 4     | Retire `getParentChunk`, which cannot work once parents are not indexed      |

---

## 7. References

- `docs/RAG-CHUNKING-STRATEGY.md` — the original design (its `docs/research/RAG1-ANALYSIS.md`
  reference is missing from the repository).
- `mc2-5fpaf` — the chunker repair that made the parent grain real.
- `mc2-7frdr` — the duplicate-vector defect and its corrected cause.
- Qdrant client API: `retrieve(collection, { ids, with_payload })`, read from the typings of the
  lockfile-pinned `@qdrant/js-client-rest@1.18.0`. Docs L1 (`@neuledge/context`, `qdrant@1.18.2`)
  returned no entry for the point-fetch API.
