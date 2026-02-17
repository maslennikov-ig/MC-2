This is an excellent, high-leverage systems design problem. Eliminating a 75% waste rate in a heavy RAG pipeline (10 Qdrant hybrid searches + cross-encoder reranking per lesson) will drastically cut your compute costs, API spend, and pipeline latency.

However, your analysis contains a **critical mathematical flaw in your threshold logic**, and the assumption behind your early-exit heuristic (Question 5) introduces a severe risk of bypassing your Quality Assurance Judge.

Ultimately, your **Alternative #7 (Two-Tier Retrieval)** is the most architecturally sound path. Here is a deep analysis of your 7 questions explaining why.

---

### 1. Is this the right decision point? (Stage 5 vs. Stage 6)

**Recommendation:** Compute the decision ephemerally at the start of **Stage 6**, not Stage 5.

- **The Staleness Risk:** If you persist `skip_rag: true` in the Stage 5 database, and a user uploads a document (or a background doc-processing job finishes) between Stage 5 and Stage 6, your database state is stale. You will permanently lock that lesson out of RAG with no programmatic way to heal it without a pipeline rewind.
- **Separation of Concerns:** Stage 5 is for _planning_ (generating specs/queries). Stage 6 is for _execution_. The presence or absence of vectors is a physical state of the vector DB at execution time.
- **Mitigation:** You can still get UI/TraceViewer visibility by having the Stage 6 worker emit a telemetry event (e.g., `rag_status: "skipped_no_results"`) when it decides to exit early. 30 concurrent Qdrant probe queries are virtually free for the database; you don't need to pre-compute this to save Qdrant load.

### 2. Threshold selection (0.35 probe vs 0.25 actual)

**Recommendation:** Your logic here is mathematically inverted. To create a safety margin, your probe threshold must be **LOWER** than your actual threshold. I recommend **~0.15**.

- **The Fatal Flaw:** You noted that a _False Positive_ (skipping RAG when relevant docs actually exist) is "VERY BAD". But consider your math: If your actual retrieval threshold is `0.25`, and a highly relevant document scores `0.30`, the probe (requiring `0.35`) will return 0 results and skip RAG because `0.30 < 0.35`. But if you had run full retrieval, `0.30 > 0.25`, so you would have successfully used it!
- **Mitigation:** A safety margin means being highly permissive at the gate. By setting the probe threshold to `0.15`, you are saying: _"I am only going to skip RAG if I am 100% certain there is nothing even remotely close to our 0.25 cutoff."_

### 3. Probe query design (`section.area`)

**Recommendation:** A single broad query is insufficient. Combine `area` with `key_topics` and use **Hybrid search**.

- **Dense Embedding Dynamics:** In Information Retrieval, broad umbrella terms (e.g., "Machine Learning") often yield surprisingly low cosine similarity against highly technical, specific chunks (e.g., "adjusting the learning rate of the Adam optimizer"). If you rely on a broad dense-only probe, you will falsely skip RAG for specific technical lessons.
- **Mitigation:** If your Stage 6 uses Hybrid (Jina + BM25), your probe _must_ use Hybrid. Concatenate the area and topics (`"{section.area}: {key_topics.join(', ')}"`) to give both the dense vector and the BM25 lexical matcher enough surface area to catch a hit.

### 4. Granularity (Per-Section vs. Per-Lesson)

**Recommendation:** Screen **per-lesson**.

- **The Coarse Section Problem:** A section might contain 5 lessons. Lessons 1-4 might have zero relevant documents, but Lesson 5 is heavily documented. If you probe per-section, Lesson 5 will trigger a "match," forcing Lessons 1-4 to run the full 10-query + reranker pipeline anyway. You lose your performance gains.
- **The Math:** 1 probe query per lesson (40-60 per course) is mathematically trivial for Qdrant. It is still a massive 90% reduction compared to 10 queries per lesson, while giving you surgical precision.

### 5. Early-exit heuristic in Stage 6 (Breaking out after Query 1)

**Recommendation:** **Abandon this heuristic.**

- **Risk:** In RAG, broad queries often fail to match text where specific queries succeed. If Query 1 is your broad section-level query, and Queries 2-10 are specific learning objectives, Query 1 might return 0 results while Query 5 hits a goldmine. Exiting sequentially after Query 1 fails guarantees you will miss highly specific documents.

### 6. Impact on Quality Assurance (The Judge System)

**Recommendation:** This highlights exactly why avoiding False Positives is your #1 priority.

- **The Compound Risk:** If your pre-screen falsely skips RAG (due to the flawed `0.35` threshold or the Query 1 heuristic), the LLM generates the lesson from its pre-trained weights, likely hallucinating company-specific concepts. Because `ragChunks.length === 0`, your Judge system skips factual verification. **Your pre-screening just gave a hallucination a VIP pass to bypass your QA system entirely.**

---

### 7. The Ultimate Solution: Two-Tier Retrieval Architecture

Your **Alternative #7** is vastly superior to Stage 5 pre-screening. It inherently solves the staleness risk, the broad-query embedding risk, and the QA compound risk, while delivering the exact cost and latency savings you want.

**How to implement it inside your Stage 6 workers:**

1. **Tier 1 (The Light Gate):**

- Take the **2 best queries** for the lesson (e.g., the broad Lesson Topic + a concatenation of the Learning Objectives).
- Execute Qdrant Hybrid Search (perhaps using Qdrant's `SearchBatch` API to do both in one network call).
- Apply a **highly permissive threshold** (e.g., `0.15`).
- _Crucial: Do not call the Jina Reranker._

2. **The Decision Point (Wrapped in your Feature Flag):**

- If Tier 1 returns `0` chunks above `0.15`: **Early Exit**. Return an empty array. You have just saved 8 Qdrant queries and 1 expensive Jina Reranker API call.
- If Tier 1 returns `> 0` chunks: Proceed to Tier 2.

3. **Tier 2 (Full Retrieval):**

- Execute the remaining 8 Qdrant queries.
- Aggregate and deduplicate all chunks from all 10 queries.
- Pass the unified list to the Jina Reranker and apply your strict `0.25` threshold.

**Why this wins:** You eliminate 100% of the Jina Reranker API calls for the 75% of irrelevant lessons (which is the actual latency and cost bottleneck). You keep your precision near 100% (safely protecting your QA pipeline), and you keep all retrieval state cleanly encapsulated in Stage 6.
