# Solving RRF Score Mismatches in Qdrant Hybrid Search

**Your score threshold problem has a clear solution: use rank-based filtering instead of score thresholds for RRF-fused results.** RRF scores are mathematically bounded to tiny values (~0.016 maximum with k=60), making your current 0.25-0.70 thresholds impossible to satisfy. Qdrant's native Query API (v1.10+) provides built-in RRF fusion with graceful fallback handling, eliminating the need for client-side score normalization. Below, we provide concrete threshold adjustments, Qdrant-native patterns, and a complete Russian BM25 pipeline.

## The RRF score mathematics explains everything

The RRF formula `score = 1/(k + rank)` with default k=60 produces a predictable, narrow score range. For **rank 1 in a single source**, the maximum score is 1/61 ≈ **0.0164**—well below your minimum threshold of 0.25. With two sources (dense + sparse), a document ranking #1 in both receives ~0.0328. This isn't a bug; RRF deliberately ignores score magnitudes to make fusion work across incompatible scales.

| Similarity Score Intent | Approximate Rank Equivalent | RRF Score (k=60, 2 sources) |
|------------------------|----------------------------|---------------------------|
| 0.70 (high quality) | Top 5 | 0.031 |
| 0.50 (medium) | Top 20 | 0.025 |
| 0.25 (low) | Top 100 | 0.012 |

**Production systems avoid RRF score thresholds entirely.** OpenSearch, Elasticsearch, and Azure AI Search all recommend using top-K filtering instead. The RRF paper's authors (Cormack, Clarke, Büttcher, SIGIR 2009) specifically designed it to work without score normalization—ranks carry the signal, not magnitudes.

## Threshold strategy: apply pre-fusion or use top-K

The recommended approach is **loose pre-fusion filtering combined with post-fusion top-K**:

```python
def hybrid_search_with_proper_thresholds(
    client,
    collection_name: str,
    dense_vector: list,
    sparse_vector: dict,
    pre_filter_threshold: float = 0.1,  # Loose pre-filtering (similarity scale)
    final_limit: int = 10,
    prefetch_multiplier: int = 5
) -> list:
    """
    Best practice: pre-filter individual searches loosely,
    use top-K for final results instead of RRF score threshold.
    """
    prefetch_limit = final_limit * prefetch_multiplier
    
    return client.query_points(
        collection_name=collection_name,
        prefetch=[
            models.Prefetch(
                query=sparse_vector,
                using="sparse",
                limit=prefetch_limit,
                score_threshold=pre_filter_threshold  # Applied BEFORE fusion
            ),
            models.Prefetch(
                query=dense_vector,
                using="dense", 
                limit=prefetch_limit,
                score_threshold=pre_filter_threshold
            ),
        ],
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        limit=final_limit,  # Top-K instead of score threshold
    ).points
```

If you **must** use a post-fusion score threshold, calculate it from expected rank positions: `threshold = n_sources / (k + acceptable_rank)`. For 2 sources where you'd accept results ranking in the top 50: `threshold = 2 / (60 + 50) = 0.018`.

## Qdrant's native Query API is the answer

Qdrant v1.10+ provides server-side RRF fusion via the `query_points` API with `prefetch`—no client-side fusion needed. Since v1.16.0, the k parameter is configurable:

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

# Configure collection with named vectors for hybrid search
client.create_collection(
    collection_name="hybrid_docs",
    vectors_config={
        "dense": models.VectorParams(size=1024, distance=models.Distance.COSINE),
    },
    sparse_vectors_config={
        "sparse": models.SparseVectorParams(
            modifier=models.Modifier.IDF  # Enable BM25 IDF weighting
        )
    },
)

# Native hybrid search with configurable k
results = client.query_points(
    collection_name="hybrid_docs",
    prefetch=[
        models.Prefetch(query=sparse_vector, using="sparse", limit=20),
        models.Prefetch(query=dense_vector, using="dense", limit=20),
    ],
    query=models.RrfQuery(rrf=models.Rrf(k=60)),  # Explicit k=60
    limit=10,
)
```

**Qdrant handles empty sparse results gracefully.** When sparse search returns zero matches (vocabulary mismatch), RRF continues with dense-only rankings. The documentation confirms: "Handles sparse gaps: When sparse returns fewer results (or none), dense search fills the gaps."

For score-based fusion rather than rank-based, Qdrant offers **DBSF (Distribution-Based Score Fusion)** which normalizes scores using mean ± 3 standard deviations:

```python
# Alternative: DBSF for score-aware fusion
results = client.query_points(
    collection_name="hybrid_docs",
    prefetch=[...],
    query=models.FusionQuery(fusion=models.Fusion.DBSF),  # Score-normalized fusion
    limit=10,
)
```

## RRF normalization code for legacy systems

If you're not using Qdrant's native fusion, here's a complete normalization implementation:

```python
from typing import List, Tuple, Dict
from collections import defaultdict

def reciprocal_rank_fusion(
    ranked_lists: List[List[str]],
    k: int = 60,
    weights: List[float] = None
) -> List[Tuple[str, float]]:
    """Standard weighted RRF implementation."""
    weights = weights or [1.0] * len(ranked_lists)
    rrf_scores: Dict[str, float] = defaultdict(float)
    
    for weight, ranked_list in zip(weights, ranked_lists):
        for rank, doc_id in enumerate(ranked_list, start=1):
            rrf_scores[doc_id] += weight * (1.0 / (k + rank))
    
    return sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)

def normalize_rrf_to_similarity_scale(
    results: List[Tuple[str, float]],
    n_sources: int = 2,
    k: int = 60
) -> List[Tuple[str, float]]:
    """
    Normalize RRF scores to 0-1 range using theoretical max.
    Max RRF = n_sources / (k + 1) when doc ranks #1 in all sources.
    """
    max_theoretical = n_sources / (k + 1)
    return [(doc_id, score / max_theoretical) for doc_id, score in results]

# Example: translate your original thresholds
def translate_similarity_threshold_to_rrf(
    similarity_threshold: float,
    n_sources: int = 2,
    k: int = 60
) -> float:
    """
    Map similarity threshold to equivalent RRF threshold.
    Assumes linear mapping where similarity 1.0 = RRF max.
    """
    max_rrf = n_sources / (k + 1)
    return similarity_threshold * max_rrf

# Your 0.25 threshold becomes: 0.25 * (2/61) ≈ 0.0082
# Your 0.70 threshold becomes: 0.70 * (2/61) ≈ 0.023
```

## Framework patterns differ significantly

None of LangChain, LlamaIndex, or Haystack provide built-in score thresholding for hybrid search—you must implement it yourself.

**LangChain** uses weighted RRF in `EnsembleRetriever` with a configurable `c` parameter (their k equivalent):
```python
from langchain.retrievers import EnsembleRetriever

ensemble = EnsembleRetriever(
    retrievers=[bm25_retriever, vector_retriever],
    weights=[0.5, 0.5],
    c=60  # RRF constant
)
```

**LlamaIndex** defaults to **Relative Score Fusion** (MinMax normalization + weighted sum) rather than RRF for Qdrant, which produces more threshold-friendly 0-1 scores:
```python
query_engine = index.as_query_engine(
    vector_store_query_mode="hybrid",
    alpha=0.5,  # 0=sparse-only, 1=dense-only
    sparse_top_k=12,
    similarity_top_k=10,
)
```

LlamaIndex's `SimilarityPostprocessor` provides post-retrieval thresholding:
```python
from llama_index.core.postprocessor import SimilarityPostprocessor
postprocessor = SimilarityPostprocessor(similarity_cutoff=0.3)
```

## Complete Russian BM25 preprocessing pipeline

For Russian text, **use lemmatization over stemming**—Russian's 6 grammatical cases and rich morphology make stemming unreliable. The recommended stack is **razdel** (tokenization) + **pymorphy2** (lemmatization):

```python
import re
from razdel import tokenize
import pymorphy2

morph = pymorphy2.MorphAnalyzer()

RUSSIAN_STOPWORDS = {
    'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то',
    'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за',
    'бы', 'по', 'только', 'её', 'мне', 'было', 'вот', 'от', 'меня', 'ещё',
    'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'уже', 'вам', 'ни', 'быть',
    'был', 'была', 'были', 'мы', 'это', 'эта', 'эти', 'этот', 'который'
}

def preprocess_russian_bm25(text: str) -> list:
    """Complete Russian preprocessing for BM25 sparse vectors."""
    # Normalize ё→е (commonly interchanged in Russian)
    text = text.lower().replace('ё', 'е').replace('Ё', 'Е')
    
    # Remove stress accents (found in dictionaries)
    text = re.sub(r'[\u0300-\u036f]', '', text)
    
    # Tokenize with razdel (Russian-optimized)
    tokens = [t.text for t in tokenize(text)]
    
    # Keep only Cyrillic/Latin alphanumeric
    tokens = [t for t in tokens if re.match(r'^[а-яa-z0-9]+$', t)]
    
    # Remove stopwords
    tokens = [t for t in tokens if t not in RUSSIAN_STOPWORDS]
    
    # Lemmatize with pymorphy2
    return [morph.parse(token)[0].normal_form for token in tokens]

# For mixed Russian/English content
from ftlangdetect import detect

def process_bilingual(text: str) -> list:
    """Handle mixed Russian/English documents."""
    from razdel import sentenize
    from nltk.stem import PorterStemmer
    
    stemmer_en = PorterStemmer()
    tokens = []
    
    for sent in sentenize(text):
        lang_result = detect(sent.text, low_memory=True)
        if lang_result['lang'] == 'ru' and lang_result['score'] > 0.7:
            tokens.extend(preprocess_russian_bm25(sent.text))
        elif lang_result['lang'] == 'en' and lang_result['score'] > 0.7:
            words = [w.lower() for w in sent.text.split() if w.isalpha()]
            tokens.extend([stemmer_en.stem(w) for w in words])
    
    return tokens
```

**Installation:** `pip install razdel pymorphy2 pymorphy2-dicts-ru fast-langdetect`

## Graceful fallback when sparse vectors are missing

Implement tiered fallback with monitoring for legacy data without sparse vectors:

```python
from enum import Enum
from dataclasses import dataclass
from typing import List, Optional

class SearchMode(Enum):
    HYBRID = "hybrid"
    DENSE_ONLY = "dense_only"
    FALLBACK = "fallback"

@dataclass
class SearchResult:
    results: List
    mode: SearchMode
    metadata: dict

class ResilientHybridSearcher:
    def __init__(self, client, collection_name: str):
        self.client = client
        self.collection = collection_name
        self.fallback_count = 0
    
    def search(
        self,
        dense_vector: list,
        sparse_vector: Optional[dict] = None,
        limit: int = 10
    ) -> SearchResult:
        """Hybrid search with automatic dense-only fallback."""
        
        # No sparse vector available (legacy data)
        if sparse_vector is None or len(sparse_vector.get('indices', [])) == 0:
            self.fallback_count += 1
            return SearchResult(
                results=self._dense_only_search(dense_vector, limit),
                mode=SearchMode.DENSE_ONLY,
                metadata={"fallback_reason": "no_sparse_vector"}
            )
        
        # Attempt hybrid search - Qdrant handles empty sparse gracefully
        try:
            results = self.client.query_points(
                collection_name=self.collection,
                prefetch=[
                    models.Prefetch(query=sparse_vector, using="sparse", limit=limit*3),
                    models.Prefetch(query=dense_vector, using="dense", limit=limit*3),
                ],
                query=models.FusionQuery(fusion=models.Fusion.RRF),
                limit=limit,
            ).points
            
            return SearchResult(
                results=results,
                mode=SearchMode.HYBRID,
                metadata={"sparse_contributed": any(
                    hasattr(p, 'vector') and 'sparse' in (p.vector or {}) 
                    for p in results
                )}
            )
        except Exception as e:
            # Full fallback to dense-only
            self.fallback_count += 1
            return SearchResult(
                results=self._dense_only_search(dense_vector, limit),
                mode=SearchMode.FALLBACK,
                metadata={"fallback_reason": str(e)}
            )
    
    def _dense_only_search(self, vector: list, limit: int):
        return self.client.search(
            collection_name=self.collection,
            query_vector=("dense", vector),
            limit=limit
        )
```

## Conclusion

The core fix is straightforward: **replace score thresholds with top-K filtering for RRF-fused results**, or use DBSF fusion if you need score-based thresholds. Qdrant's native `query_points` API with `prefetch` handles fusion server-side and gracefully degrades when sparse returns empty. For Russian BM25, the razdel + pymorphy2 stack provides accurate lemmatization that significantly outperforms stemming on morphologically rich Cyrillic text.

Key implementation changes:
- Set `limit=10` (top-K) instead of `score_threshold=0.25` after RRF fusion
- Apply loose pre-fusion thresholds (~0.1) to individual prefetches if needed
- Use Qdrant's `models.RrfQuery(rrf=models.Rrf(k=60))` for explicit k control
- Monitor fallback rates—alert if exceeding 20% dense-only fallbacks