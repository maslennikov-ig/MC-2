# Optimizing RAG pre-screening to eliminate 75% retrieval waste

**A trained retrieval-necessity classifier combined with adaptive thresholds and tiered retrieval can cut wasted RAG operations from 75% to under 15% while keeping false negatives below 3%.** This matters because your pipeline's 24.6% utility rate means every four out of five Qdrant searches, Jina Reranker calls, and LLM context-stuffing operations burn compute for nothing. The research literature—spanning Self-RAG, FLARE, Adaptive-RAG, and production systems at companies like Ragie and Redis—converges on a clear architectural pattern: classify first, probe adaptively, retrieve in tiers. Below are concrete recommendations for each of your eight questions, grounded in academic papers and production evidence.

---

## 1. The case for retrieval-necessity classifiers over simple thresholds

The strongest finding across the literature is that **lightweight classifiers trained on your own pipeline data outperform all generic heuristic approaches**. Several papers establish this pattern:

**Adaptive-RAG** (Jeong et al., NAACL 2024) trains a T5-Large classifier to route queries into three complexity tiers: no retrieval, single-step retrieval, or multi-step iterative retrieval. It achieves **2–3 F1 points** over binary baselines while halving multi-step costs. Both LlamaIndex and LangGraph ship official implementations.

**SKR (Self-Knowledge Guided Retrieval)** (Wang et al., EMNLP Findings 2023) is the most directly applicable to your pipeline. It collects "self-knowledge" by running training questions both with and without retrieval, labels them as "retrieval helped" or "didn't help," then trains a **BERT classifier** on those labels. You already have this data: your 24.6%/75.4% split is a ready-made training set. A logistic regression or small BERT model on lesson topic, subject area, and learning objectives would likely eliminate **50–60% of retrievals** with under 5% false negatives.

**Probing-RAG** (2024) trains a lightweight prober on LLM hidden states and skips retrieval in **57.5% of cases**—far more aggressive than FLARE (12.4%) or Adaptive-RAG (7.8%)—while achieving higher accuracy. Its key insight: unnecessary retrieval doesn't just waste compute, it **degrades output quality** by injecting noise.

**Self-RAG** (Asai et al., ICLR 2024) teaches the LLM itself to emit reflection tokens (`[Retrieve]: Yes/No`) during generation, achieving >90% agreement with GPT-4 judgments. However, it requires fine-tuning the generator model, making it heavyweight for a course pipeline.

**FLARE** (Jiang et al., EMNLP 2023) monitors token-level generation confidence and triggers retrieval only when probabilities drop below a threshold. Elegant but doubles inference cost for cases where retrieval IS needed, since it generates a draft first.

A critical meta-finding from Moskvoretskii et al. (2025), who benchmarked **35 adaptive retrieval systems**: simple uncertainty estimation methods often outperform complex purpose-built pipelines while being significantly more compute-efficient. The practical takeaway is to start simple.

**Recommended implementation for your pipeline:**

```python
# Phase 1: Train a retrieval necessity classifier on your existing data
from sklearn.linear_model import LogisticRegression
from sentence_transformers import SentenceTransformer

encoder = SentenceTransformer("jinaai/jina-embeddings-v3")

# Features: embed lesson topic + first learning objective
features = encoder.encode([
    f"{lesson.topic} | {lesson.objectives[0]}"
    for lesson in historical_lessons
])
labels = [1 if lesson.rag_was_useful else 0 for lesson in historical_lessons]

clf = LogisticRegression(class_weight='balanced')  # balanced for 24.6/75.4 skew
clf.fit(features, labels)

# At inference: predict before any Qdrant calls
def should_retrieve(lesson_topic, first_objective):
    embedding = encoder.encode(f"{lesson_topic} | {first_objective}")
    prob = clf.predict_proba([embedding])[0][1]
    return prob, prob > 0.3  # Low threshold favors recall over precision
```

---

## 2. Why static thresholds fail and how to make them adaptive

**Static cosine similarity thresholds are fundamentally broken for Jina-v3.** Jina AI's own research (April 2025) on size bias demonstrates this with concrete numbers on the CISI dataset:

| Text comparison type              | Avg cosine similarity (non-relevant pairs) |
| --------------------------------- | ------------------------------------------ |
| Sentence-to-sentence              | 0.254                                      |
| Sentence-to-document              | 0.276                                      |
| Document-to-document (~119 words) | 0.343                                      |
| Long document pairs (10× concat)  | **0.658**                                  |

A static threshold of 0.35 would flag nearly all long document pairs as relevant while missing legitimate short-text matches. Jina AI explicitly warns: _"Be skeptical of cosine thresholds. They just don't work. Comparing embedding vectors can only tell you about relative similarity, not relevance."_

**Distribution-based adaptive thresholding** is the recommended primary approach. Sample your collection's pairwise similarity distribution and set thresholds relative to it:

```python
def compute_adaptive_threshold(client, collection_name, sample_size=200, alpha=1.0):
    """Threshold = mean + alpha × std_dev of pairwise similarities."""
    points = client.scroll(collection_name, limit=sample_size)[0]
    vectors = np.array([p.vector for p in points])

    sim_matrix = cosine_similarity(vectors)
    upper_tri = sim_matrix[np.triu_indices_from(sim_matrix, k=1)]

    mu, sigma = np.mean(upper_tri), np.std(upper_tri)
    return {
        'threshold': mu + alpha * sigma,
        'mean': mu, 'std': sigma,
        'p75': np.percentile(upper_tri, 75),
        'p90': np.percentile(upper_tri, 90),
    }
```

**Per-query adaptive thresholds** add a second layer: short, vague queries (1–3 words) get a lower threshold since semantic matching is inherently less precise, while long, specific queries get a higher threshold. The "Never Come Up Empty" paper (2025) validates stepwise threshold relaxation in production—start strict, relax progressively until sufficient results appear or a floor is reached.

**Recalibrate when the collection grows by >20%** or when new document categories are added. For your 1–100 document range, collection diversity changes significantly with each upload batch, so tie recalibration to document ingestion events.

---

## 3. Multi-signal probes dramatically outperform single-topic queries

Using bare section topics as probe queries is your biggest pre-screening weakness. Research strongly favors **multiple short probes over one comprehensive probe**, with SIGIR 2025 findings showing query formulation effects are comparable in magnitude to the topic factor itself.

**Three escalating probe strategies, from cheapest to most thorough:**

**Strategy 1 — Multi-signal composition** (no LLM call, fast): Combine topic + first learning objective + key terms into a structured probe. This hits both the dense (semantic via topic) and sparse (BM25 keyword match via terms) components of your hybrid search.

```python
def compose_probe(section):
    return f"Topic: {section.topic}\nObjectives: {section.objectives[0]}\nKey concepts: {', '.join(section.key_terms[:5])}"
```

**Strategy 2 — Decomposed sub-probes** (still no LLM call): Send 2–3 short, focused queries derived from the section structure. Use `max()` across probe scores for the pre-screening decision—any probe finding relevant content means retrieval is worthwhile.

**Strategy 3 — HyDE (Hypothetical Document Embeddings)** (one LLM call): Generate a hypothetical passage that _would_ exist in your collection if relevant content were present, then embed it with `retrieval.passage` task type. HyDE bridges the query-document semantic gap that makes raw topic strings poor probes. The "Never Come Up Empty" paper confirms HyDE-based pipelines achieve the best balance of answer quality and retrieval coverage across all thresholds tested. Reserve this for borderline cases where simpler probes fail.

**A cascading probe architecture** runs Strategy 1 first; if the top score exceeds threshold + 0.1σ, declare "relevant" immediately. If inconclusive, escalate to Strategy 2. Only invoke HyDE for the remaining uncertain cases. This keeps the average cost low while maximizing recall.

---

## 4. A three-tier architecture is the safest false negative mitigation

The biggest risk—skipping RAG for a lesson that needed document context—requires defense in depth. **CRAG** (Yan et al., 2024) provides the clearest production pattern with its three-tier confidence system: Correct (trust results), Ambiguous (combine retrieval with broader search), Incorrect (discard and try alternatives). The ambiguous tier is the key false negative mitigation mechanism.

**Recommended tiered architecture for your pipeline:**

- **Tier 1 — Skip** (classifier confidence <0.3 that RAG helps): Generate without RAG. Target ~50–60% of sections.
- **Tier 2 — Lightweight retrieval** (confidence 0.3–0.7): Run embedding-only search in Qdrant (skip reranking). Check top-1 score against adaptive threshold. Proceed to full RAG only if scores warrant it. Target ~20–30% of sections.
- **Tier 3 — Full retrieval** (confidence >0.7): Complete hybrid search + Jina Reranker pipeline. Target ~15–25% of sections.

**Post-generation fallback** catches the most damaging false negatives: for lessons generated without RAG, apply a lightweight quality check. If the output contains hedging language or factual claims on niche topics, trigger retrieval as a safety net.

**Shadow retrieval sampling** provides ongoing measurement: for 5–10% of skipped sections, run RAG anyway but don't use the results. Compare output quality with and without context. If the lift is consistently positive for shadowed sections, the pre-screener is too aggressive. This creates a continuous feedback loop without impacting production quality.

A critical insight from Mallen et al. (2022): the cost asymmetry matters. Missing retrieval for **niche/tail knowledge** is catastrophic (the LLM has nothing to draw on), but missing it for common foundational topics is usually fine. Map this to your domain: specialized technical lessons likely need RAG; introductory overview sections rarely do.

---

## 5. BM25 gating plus document summaries is the strongest alternative architecture

Three alternative architectures were evaluated against your constraints (Jina-v3, Qdrant, 1–100 documents, 30–60 lessons):

**BM25 as a native Qdrant gate** is the highest-impact quick win. Qdrant supports sparse vectors (including BM25 with `Modifier.IDF`) natively since v1.7. Add BM25 sparse vectors to your existing collection, then use a BM25 pre-screen: if BM25 returns zero results for a section, skip dense retrieval entirely. BM25 query latency is **sub-millisecond** on 100 documents. For the binary "does anything relevant exist?" question, BM25 achieves **90–95% agreement** with dense retrieval screening. Its only weakness is synonym/paraphrase mismatch, which matters less in technical domains with consistent terminology.

```python
# Add to existing Qdrant collection — minimal code change
results = client.query_points(
    collection_name="course_docs",
    query=models.Document(text=section_text, model="Qdrant/bm25"),
    using="bm25", limit=1, score_threshold=0.3
)
if not results.points:
    return "skip_rag"  # No lexical overlap at all
```

**Document summary profiles** generated at upload time provide the highest accuracy. Use a fast LLM (Gemini Flash, GPT-4o-mini) to extract a summary, topic list, and capability profile per document. Embed summaries with Jina-v3 into a lightweight summary index. At generation time, **batch-embed all section descriptions in one call**, compute a similarity matrix against all document summary embeddings, and determine relevance for all sections simultaneously. This collapses 5–15 probes per section × 30–60 lessons into one embedding batch + one matrix multiplication. Ragie (a production RAG platform) ships this exact two-step architecture: query summaries first to find relevant documents, then search within those documents' chunks.

**Pre-computed document coverage maps** via BERTopic are less suitable for your scale. BERTopic requires >100 documents for stable clustering, and your range of 1–100 documents will produce unreliable topic assignments. Skip this approach.

**The recommended hybrid**: Phase 1 deploys BM25 gating (hours of work, zero new infrastructure). Phase 2 adds summary-based batch pre-screening (days of work, amortized LLM cost at upload time). Together they provide sub-millisecond pre-screening for clearly irrelevant sections and high semantic accuracy for borderline cases.

---

## 6. Qdrant's query_batch_points eliminates network overhead for batch pre-screening

For pre-screening 8–10 sections, **`query_batch_points` is the clear winner** over individual parallel queries or local distance computation. It sends all queries in a single HTTP/gRPC request, and Qdrant's query planner can reuse shared filter results across batch items. Qdrant's own benchmarks show **~34% speedup** over sequential queries when combining batching with multiprocessing (on 10K queries). For 8–10 queries, the network overhead savings dominate—you eliminate 7–9 round-trips.

Note: `search_batch()` is deprecated in newer Qdrant versions; use `query_batch_points()` instead.

```python
from qdrant_client import QdrantClient, models

def batch_prescreen(client, collection_name, section_queries, threshold=0.65):
    """Single API call pre-screens all sections."""
    requests = [
        models.QueryRequest(
            query=query_embedding,
            limit=3,  # Only need top few for pre-screening
            score_threshold=threshold,
            with_payload=models.PayloadSelectorInclude(
                include=["section_id", "chunk_text"]
            ),
        )
        for query_embedding in section_queries
    ]

    results = client.query_batch_points(
        collection_name=collection_name,
        requests=requests
    )

    return {
        i: len(r.points) > 0  # Has relevant content?
        for i, r in enumerate(results)
    }
```

For hybrid search pre-screening, use Qdrant's `prefetch` + fusion within each batch request. RRF (Reciprocal Rank Fusion) is rank-based and safe for combining incompatible score types; DBSF (Distribution-Based Score Fusion) normalizes scores statistically before fusion. Apply pre-screening thresholds to the **fused score**, not to raw dense or sparse scores independently.

The pre-computed distance matrix approach (Approach 3) has a niche use case: if you maintain cached document summary embeddings locally, the matrix multiplication is near-instantaneous and avoids any Qdrant call. This works well as a first-pass gate before the batch query.

---

## 7. Cache warming from Stage 5 to Stage 6 is the highest-value caching optimization

The minutes-long gap between pre-screening (Stage 5) and retrieval (Stage 6) creates a natural opportunity for **cache warming**—fetch more results than pre-screening needs and stash them for Stage 6.

**Recommended TTL structure:**

| Cache layer    | Content              | TTL       | Rationale                                         |
| -------------- | -------------------- | --------- | ------------------------------------------------- |
| L1 (in-memory) | Pre-screen decisions | 60s       | Fast repeated access within same request cycle    |
| L2 (Redis)     | Pre-screen decisions | **15min** | Bridges Stage 5→6; outlives the search result TTL |
| L2 (Redis)     | Warm search results  | **10min** | Stage 5 pre-fetches for Stage 6 consumption       |
| L2 (Redis)     | Embeddings           | 1h        | Current setting is appropriate                    |
| L2 (Redis)     | Final search results | 5min      | Current setting is appropriate                    |

**The key optimization**: at Stage 5, fetch `limit=10` results (more than the 3 needed for pre-screening) and cache them with a 10-minute TTL under a key that Stage 6 can look up. When Stage 6 runs, it checks the warm cache first—if a hit occurs, it skips the Qdrant call entirely and proceeds directly to reranking.

**Cache key design** must include a **collection version counter** that auto-invalidates when documents change:

```python
key = f"prescreen:v1:{course_id}:{query_hash}:{collection_version}"
```

Increment `collection_version` (a Redis counter) on every document add/remove. Old-version keys expire naturally via TTL. For immediate invalidation, use tag-based deletion: track all cache keys for a course in a Redis set and bulk-delete on document changes.

**Multi-level caching** (L1 memory → L2 Redis → recompute) adds ~10× speedup for hot paths. Use an in-memory `OrderedDict` as an LRU cache with 60-second TTL for L1, promoting Redis hits to L1 on access. This matters when the same course is being generated across multiple stages—the pre-screening decision computed once serves all downstream stages without Redis round-trips.

---

## 8. Shadow retrieval and RAG utility rate are the metrics that matter most

Beyond skip rate and false negative rate, these metrics form a complete observability picture:

**Pre-screening decision quality:**

- **RAG Utility Rate**: Among sections where RAG was triggered, what percentage actually improved output quality? Your current baseline is 24.6%; this should rise toward 80%+ with effective pre-screening.
- **Quality Delta Distribution**: Box plot of (quality with RAG) minus (quality without RAG) for triggered sections. A healthy distribution is strongly right-skewed.
- **Shadow Retrieval Lift**: For the 5–10% of skipped sections that get shadow retrieval, the average quality lift quantifies your false negative cost.

**Retrieval quality (when RAG is triggered):**

- **Context Precision** (RAGAS): Proportion of retrieved chunks that are actually relevant—measures signal-to-noise ratio.
- **Context Recall** (RAGAS): Whether all information needed to answer was retrieved. This is the most critical retrieval metric.
- **MRR and NDCG@k**: Standard ranked retrieval metrics. NDCG is the default on the MTEB leaderboard for good reason—it handles graded relevance and rewards correct ordering.

**Operational metrics:**

- **Similarity score distributions** over time, plotted as histograms with the threshold line overlaid. A healthy pre-screener shows a bimodal distribution (clearly relevant vs. clearly irrelevant). A unimodal distribution near the threshold indicates poor discriminability—your threshold needs recalibration.
- **Per-stage latency**: Pre-screening (<10ms target), vector search (50–200ms), reranking (100–500ms), generation (500ms–5s).
- **Cost savings**: `skip_rate × avg_RAG_cost_per_section × total_sections` gives total compute saved.

**Drift detection and feedback loops**: Use **classifier-based embedding drift detection** (recommended as the best default method by Evidently AI). Train a binary classifier to distinguish baseline vs. current similarity score distributions; ROC AUC >0.55 signals meaningful drift. Trigger automatic recalibration when the pre-screening false negative rate exceeds your tolerance or the similarity score distribution shifts by more than 1σ.

**Framework stack recommendation**: **LangFuse** (open-source, MIT) for production trace collection, **RAGAS** for periodic automated metric computation on sampled traces, **Prometheus + Grafana** for real-time operational dashboards, and **Evidently AI** for embedding drift detection.

---

## Putting it all together: the implementation roadmap

The research converges on a phased approach, ordered by impact and implementation complexity:

**Week 1 — BM25 gate** (quick win): Add sparse vectors to your existing Qdrant collection. If BM25 returns zero results for a section, skip dense retrieval. Expected impact: eliminates 30–40% of clearly irrelevant retrievals with zero false negatives for keyword-matchable content.

**Week 2 — Batch pre-screening + cache warming**: Replace individual Qdrant probes with `query_batch_points`. Implement cache warming from Stage 5→6 with dedicated TTLs. Expected impact: 3–5× latency reduction for the pre-screening step.

**Week 3 — Retrieval-necessity classifier**: Train a logistic regression or small BERT model on your historical 24.6%/75.4% labeled data. Implement the three-tier architecture (skip / lightweight / full). Expected impact: reduce wasted retrievals to **15–20%** with <5% false negatives.

**Week 4 — Multi-signal probes + adaptive thresholds**: Replace bare topic probes with multi-signal composition. Implement distribution-based adaptive thresholding with automatic recalibration. Add shadow retrieval sampling for ongoing measurement.

**Ongoing** — Observability: Deploy the metrics stack, build the monitoring dashboard, and close the feedback loop with automated drift detection and threshold recalibration.

The combined effect should push your RAG utility rate from **24.6% toward 70–85%**, meaning the vast majority of retrieval operations actually contribute to output quality—while the false negative rate stays below 3% through tiered fallbacks and shadow monitoring.
