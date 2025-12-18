# RAG Stack Migration - From Jina API to Self-Hosted BGE

**Created**: 2025-12-06
**Updated**: 2025-12-06
**Goal**: Migrate from Jina API to self-hosted BGE stack with 95%+ cost reduction and 105-110% quality improvement
**Timeline**: 4-5 weeks
**Based on**: Research documents in `docs/research/`

---

## Research Summary

Based on comprehensive research comparing Jina, BGE, Voyage, and other options:

| Aspect | Jina (Current) | BGE (Recommended) | Winner |
|--------|---------------|-------------------|--------|
| **Embeddings quality (MIRACL-ru)** | ~63-65 | **~70.0** | BGE |
| **Reranker quality (MIRACL)** | ~65.2 | **69.32** | BGE |
| **License** | CC-BY-NC (Non-Commercial!) | **MIT + Apache 2.0** | BGE |
| **TEI Support** | NO (Issue #571) | **Full** | BGE |
| **AMD/ROCm Support** | No | **Yes (via Infinity)** | BGE |
| **Monthly Cost** | ~$10,000 | **~$300-400** | BGE |

**Key Finding**: Jina-v3 uses **CC-BY-NC 4.0 license** which prohibits commercial use without paid license. BGE is fully open source (MIT/Apache 2.0).

**References**:
- `docs/research/Self-Hosted RAG Models for Russian Educational Content Complete Analysis.md`
- `docs/research/Self-Hosted RAG Stack Research.md`

---

## Architecture Decision

### Current State (Jina API)
```
Embeddings: Jina API (jina-embeddings-v3) → Qdrant (1024-dim vectors)
Reranking:  Jina API (jina-reranker-v2) → $10/course
License:    CC-BY-NC 4.0 (NON-COMMERCIAL!)
```

### Target State (Full BGE Self-Hosted)
```
Embeddings: BAAI/bge-m3 (self-hosted) → Qdrant (1024-dim vectors)
Reranking:  BAAI/bge-reranker-v2-m3 (self-hosted)
License:    MIT + Apache 2.0 (FULLY COMMERCIAL)
Cost:       ~$300-400/month (97% savings)
Quality:    105-110% of Jina baseline
```

### Why Full BGE Stack?

| Reason | Details |
|--------|---------|
| **License** | Jina CC-BY-NC prohibits commercial use; BGE is MIT/Apache 2.0 |
| **Quality** | BGE-M3 achieves 70.0 MIRACL-ru vs Jina's 63-65 |
| **TEI Support** | Jina NOT supported in TEI; BGE has full native support |
| **Hybrid Retrieval** | BGE-M3 supports Dense + Sparse + ColBERT modes |
| **Consistency** | Same model family for embeddings + reranking |
| **Cost** | $300-400/month vs $10,000/month |

### Migration Impact

| Component | Action | Effort |
|-----------|--------|--------|
| Embeddings | Full migration to BGE-M3 | High (reindex required) |
| Reranking | Full migration to bge-reranker | Medium |
| Qdrant | Re-embed all documents | High (one-time) |
| Code | Update clients, remove Jina deps | Medium |

---

## Development vs Production Strategy

### Local Development (AMD 7900 XTX)

```
┌─────────────────────────────────────────────────────────────┐
│  Local Development Machine                                  │
│  GPU: AMD Radeon RX 7900 XTX (24GB VRAM)                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Infinity Server (AMD ROCm Support)                 │   │
│  │  - michaelf34/infinity:0.0.70-amd                   │   │
│  │  - Run BGE-M3 embeddings                            │   │
│  │  - Run bge-reranker-v2-m3                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Note: TEI does NOT support ROCm! Use Infinity instead.    │
│  Cost: $0                                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**AMD Infinity Deployment**:
```bash
# Embeddings service
docker run -it \
  --device=/dev/kfd --device=/dev/dri \
  --group-add video \
  -p 8080:7997 \
  michaelf34/infinity:0.0.70-amd \
  v2 --model-id BAAI/bge-m3 --engine torch

# Reranker service
docker run -it \
  --device=/dev/kfd --device=/dev/dri \
  --group-add video \
  -p 8081:7997 \
  michaelf34/infinity:0.0.70-amd \
  v2 --model-id BAAI/bge-reranker-v2-m3 --engine torch
```

### Server: Dev + Production (RunPod Serverless)

```
┌─────────────────────────────────────────────────────────────┐
│  RunPod Serverless                                          │
│  GPU: NVIDIA T4/L4 (auto-scaled)                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Features:                                           │   │
│  │  - Scale to zero (no usage = $0)                    │   │
│  │  - Pay per second of actual compute                 │   │
│  │  - Auto-scaling based on load                       │   │
│  │  - Cold start: 2-10 seconds                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Cost:                                                      │
│  - Dev: ~$5-20/month (occasional use, scale to zero)       │
│  - Prod: ~$100-300/month (active use)                      │
│                                                             │
│  Pricing: ~$0.00016/sec on T4 = $0.01/minute               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why RunPod Serverless?**
- **Scale to zero**: No requests = $0 (perfect for dev)
- **No manual start/stop**: Automatic scaling
- **Same infrastructure for dev and prod**: Consistent behavior
- **Pay per second**: Only pay for actual compute time
- **Cold start acceptable**: 2-10 seconds is fine for our use case

**RunPod Serverless Setup**:

1. Create serverless endpoint for BGE-M3 embeddings
2. Create serverless endpoint for bge-reranker-v2-m3
3. Configure endpoints in environment variables

```bash
# Environment variables for server
BGE_EMBEDDINGS_ENDPOINT=https://api.runpod.ai/v2/your-embed-endpoint/runsync
BGE_RERANKER_ENDPOINT=https://api.runpod.ai/v2/your-rerank-endpoint/runsync
RUNPOD_API_KEY=your-api-key
```

**RunPod Serverless Handler** (for custom endpoint):
```python
# handler.py - Deploy as RunPod Serverless Worker
import runpod
from sentence_transformers import CrossEncoder
from FlagEmbedding import FlagModel

# Load models once at cold start
embed_model = FlagModel('BAAI/bge-m3', use_fp16=True)
rerank_model = CrossEncoder('BAAI/bge-reranker-v2-m3')

def handler(event):
    input_data = event["input"]

    if "texts" in input_data:
        # Embeddings request
        embeddings = embed_model.encode(input_data["texts"])
        return {"embeddings": embeddings.tolist()}

    elif "query" in input_data and "documents" in input_data:
        # Reranking request
        pairs = [[input_data["query"], doc] for doc in input_data["documents"]]
        scores = rerank_model.predict(pairs)
        results = [{"index": i, "score": float(s)} for i, s in enumerate(scores)]
        results.sort(key=lambda x: x["score"], reverse=True)
        return {"results": results}

runpod.serverless.start({"handler": handler})
```

---

## Executive Summary

| Phase | Tasks | Expected Savings | Timeline |
|-------|-------|------------------|----------|
| Phase 0 | Local GPU setup (AMD 7900 XTX + Infinity) | Dev cost = $0 | Day 1-2 |
| Phase 1 | BGE Embeddings migration | N/A (one-time) | Week 1 |
| Phase 2 | BGE Reranker integration | 95%+ | Week 2 |
| Phase 3 | Production deployment | Finalize | Week 3-4 |
| Phase 4 | Qdrant hybrid search (optional) | +5% quality | Week 4-5 |
| **Total** | | **97% cost, 105-110% quality** | 4-5 weeks |

---

## Phase 0: Local GPU Setup (AMD 7900 XTX)

### Task 0.1: Install Infinity for AMD
**Agent**: Direct implementation
**Priority**: CRITICAL
**Effort**: 2 hours

**Prerequisites**:
```bash
# Check ROCm installation
rocm-smi
# Should show RX 7900 XTX

# Check Docker with AMD support
docker run --rm --device=/dev/kfd --device=/dev/dri rocm/pytorch:latest rocm-smi
```

**Start Infinity with BGE models**:
```bash
# Create docker-compose.local.yml
version: '3.8'
services:
  bge-embeddings:
    image: michaelf34/infinity:0.0.70-amd
    command: v2 --model-id BAAI/bge-m3 --engine torch
    devices:
      - /dev/kfd:/dev/kfd
      - /dev/dri:/dev/dri
    group_add:
      - video
    ports:
      - "8080:7997"
    restart: unless-stopped

  bge-reranker:
    image: michaelf34/infinity:0.0.70-amd
    command: v2 --model-id BAAI/bge-reranker-v2-m3 --engine torch
    devices:
      - /dev/kfd:/dev/kfd
      - /dev/dri:/dev/dri
    group_add:
      - video
    ports:
      - "8081:7997"
    restart: unless-stopped
```

**Test**:
```bash
# Test embeddings
curl http://localhost:8080/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": ["Привет мир", "Hello world"]}'

# Test reranker
curl http://localhost:8081/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Что такое машинное обучение?",
    "documents": [
      "Машинное обучение - подмножество ИИ",
      "Python - язык программирования"
    ]
  }'
```

---

### Task 0.2: Benchmark Local Performance
**Agent**: Direct implementation
**Priority**: HIGH
**Effort**: 1 hour

**Expected results for 7900 XTX**:

| Operation | Documents | Expected Latency |
|-----------|-----------|------------------|
| Embeddings | 32 texts | ~100-200ms |
| Reranking | 100 docs | ~150-300ms |
| Reranking | 50 docs | ~80-150ms |
| Reranking | 25 docs | ~40-80ms |

---

## Phase 1: BGE Embeddings Migration (Week 1)

### Task 1.1: Create BGE Embeddings Client
**Agent**: `infrastructure-specialist`
**Priority**: CRITICAL
**Effort**: 4 hours

**File**: `src/shared/embeddings/bge-client.ts`

```typescript
import { logger } from '../logger';

export interface BGEEmbeddingConfig {
  endpoint: string;  // e.g., "http://localhost:8080"
  timeout?: number;  // default: 30000ms
}

const DEFAULT_CONFIG: BGEEmbeddingConfig = {
  endpoint: process.env.BGE_EMBEDDINGS_ENDPOINT || 'http://localhost:8080',
  timeout: 30000,
};

export async function generateEmbeddings(
  texts: string[],
  config: BGEEmbeddingConfig = DEFAULT_CONFIG
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const startTime = Date.now();

  try {
    const response = await fetch(`${config.endpoint}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts }),
      signal: AbortSignal.timeout(config.timeout || 30000),
    });

    if (!response.ok) {
      throw new Error(`BGE embeddings returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    const embeddings = result.data.map((item: { embedding: number[] }) => item.embedding);

    const latencyMs = Date.now() - startTime;
    logger.info({
      textsCount: texts.length,
      dimensions: embeddings[0]?.length,
      latencyMs,
    }, '[BGE Embeddings] Request completed');

    return embeddings;

  } catch (error) {
    logger.error({
      err: error instanceof Error ? error.message : String(error),
      textsCount: texts.length,
    }, '[BGE Embeddings] Request failed');
    throw error;
  }
}

export async function healthCheck(config: BGEEmbeddingConfig = DEFAULT_CONFIG): Promise<boolean> {
  try {
    const response = await fetch(`${config.endpoint}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

---

### Task 1.2: Create Embeddings Router
**Agent**: `infrastructure-specialist`
**Priority**: CRITICAL
**Effort**: 3 hours

**File**: `src/shared/embeddings/embeddings-router.ts`

```typescript
import { generateEmbeddings as generateBGE, healthCheck as bgHealthCheck } from './bge-client';
import { generateEmbeddings as generateJina } from './jina-client';
import { logger } from '../logger';

type EmbeddingsProvider = 'bge' | 'jina' | 'auto';

interface EmbeddingsConfig {
  provider: EmbeddingsProvider;
  bgeEndpoint?: string;
  fallbackToJina: boolean;
}

function getConfig(): EmbeddingsConfig {
  return {
    provider: (process.env.EMBEDDINGS_PROVIDER as EmbeddingsProvider) || 'bge',
    bgeEndpoint: process.env.BGE_EMBEDDINGS_ENDPOINT,
    fallbackToJina: process.env.EMBEDDINGS_FALLBACK_TO_JINA === 'true',
  };
}

let bgeHealthy: boolean | null = null;

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const config = getConfig();

  let useBGE = config.provider === 'bge';

  if (config.provider === 'auto') {
    if (bgeHealthy === null) {
      bgeHealthy = await bgHealthCheck();
      setTimeout(() => { bgeHealthy = null; }, 60000);
    }
    useBGE = bgeHealthy;
  }

  if (useBGE) {
    try {
      return await generateBGE(texts);
    } catch (error) {
      if (config.fallbackToJina) {
        logger.warn({ err: error }, '[Embeddings] BGE failed, falling back to Jina');
        return await generateJina(texts);
      }
      throw error;
    }
  }

  return await generateJina(texts);
}
```

---

### Task 1.3: Re-embed All Documents in Qdrant
**Agent**: `infrastructure-specialist`
**Priority**: CRITICAL
**Effort**: 8 hours (execution time: 2-4 hours for 5K courses on L4)

**Strategy**:
1. Create new Qdrant collection with BGE-M3 vectors (1024 dimensions)
2. Batch process all documents through BGE-M3
3. Verify vector quality with sample queries
4. Switch application to new collection
5. Delete old Jina collection

**Script**: `scripts/migrate-to-bge-embeddings.ts`

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateEmbeddings } from '../src/shared/embeddings/bge-client';

const BATCH_SIZE = 32;
const OLD_COLLECTION = 'courses';
const NEW_COLLECTION = 'courses_bge';

async function migrateEmbeddings() {
  const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });

  // 1. Create new collection
  await qdrant.createCollection(NEW_COLLECTION, {
    vectors: {
      size: 1024,  // BGE-M3 dimensions
      distance: 'Cosine',
    },
  });

  // 2. Get all points from old collection
  let offset: string | null = null;
  let totalMigrated = 0;

  while (true) {
    const { points, next_page_offset } = await qdrant.scroll(OLD_COLLECTION, {
      limit: BATCH_SIZE,
      offset,
      with_payload: true,
      with_vector: false,  // Don't need old vectors
    });

    if (points.length === 0) break;

    // 3. Generate new embeddings
    const texts = points.map(p => p.payload?.content as string);
    const embeddings = await generateEmbeddings(texts);

    // 4. Upsert to new collection
    await qdrant.upsert(NEW_COLLECTION, {
      points: points.map((p, i) => ({
        id: p.id,
        vector: embeddings[i],
        payload: p.payload,
      })),
    });

    totalMigrated += points.length;
    console.log(`Migrated ${totalMigrated} points...`);

    offset = next_page_offset as string | null;
    if (!offset) break;
  }

  console.log(`Migration complete! Total: ${totalMigrated} points`);
}

migrateEmbeddings().catch(console.error);
```

---

## Phase 2: BGE Reranker Integration (Week 2)

### Task 2.1: Create BGE Reranker Client
**Priority**: HIGH | **Effort**: 4 hours

**File**: `src/shared/reranker/bge-reranker-client.ts`

```typescript
import { logger } from '../logger';

export interface RerankResult {
  index: number;
  relevance_score: number;
}

export interface BGERerankerConfig {
  endpoint: string;
  timeout?: number;
}

const DEFAULT_CONFIG: BGERerankerConfig = {
  endpoint: process.env.BGE_RERANKER_ENDPOINT || 'http://localhost:8081',
  timeout: 30000,
};

export async function rerankDocuments(
  query: string,
  documents: string[],
  topN?: number,
  config: BGERerankerConfig = DEFAULT_CONFIG
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];

  const startTime = Date.now();

  try {
    const response = await fetch(`${config.endpoint}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        documents,
        return_documents: false,
      }),
      signal: AbortSignal.timeout(config.timeout || 30000),
    });

    if (!response.ok) {
      throw new Error(`BGE reranker returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();

    // TEI returns array of {index, score}
    let results: RerankResult[] = result.map((item: { index: number; score: number }) => ({
      index: item.index,
      relevance_score: item.score,
    }));

    // Sort by score descending
    results.sort((a, b) => b.relevance_score - a.relevance_score);

    // Apply topN
    if (topN) {
      results = results.slice(0, topN);
    }

    const latencyMs = Date.now() - startTime;
    logger.info({
      documentsCount: documents.length,
      latencyMs,
      topScore: results[0]?.relevance_score,
    }, '[BGE Reranker] Request completed');

    return results;

  } catch (error) {
    logger.error({
      err: error instanceof Error ? error.message : String(error),
      documentsCount: documents.length,
    }, '[BGE Reranker] Request failed');
    throw error;
  }
}

export async function healthCheck(config: BGERerankerConfig = DEFAULT_CONFIG): Promise<boolean> {
  try {
    const response = await fetch(`${config.endpoint}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

---

### Task 2.2: Create Reranker Router (BGE Primary)
**Priority**: HIGH | **Effort**: 3 hours

**File**: `src/shared/reranker/reranker-router.ts`

```typescript
import { RerankResult, rerankDocuments as rerankBGE, healthCheck as bgeHealthCheck } from './bge-reranker-client';
import { rerankDocuments as rerankJina } from '../jina/reranker-client';
import { logger } from '../logger';

type RerankerProvider = 'bge' | 'jina' | 'auto';

interface RerankerConfig {
  provider: RerankerProvider;
  bgeEndpoint?: string;
  fallbackToJina: boolean;
}

function getConfig(): RerankerConfig {
  return {
    provider: (process.env.RERANKER_PROVIDER as RerankerProvider) || 'bge',
    bgeEndpoint: process.env.BGE_RERANKER_ENDPOINT,
    fallbackToJina: process.env.RERANKER_FALLBACK_TO_JINA === 'true',
  };
}

let bgeHealthy: boolean | null = null;

export async function rerankDocuments(
  query: string,
  documents: string[],
  topN?: number
): Promise<RerankResult[]> {
  const config = getConfig();

  let useBGE = config.provider === 'bge';

  if (config.provider === 'auto') {
    if (bgeHealthy === null) {
      bgeHealthy = await bgeHealthCheck();
      setTimeout(() => { bgeHealthy = null; }, 60000);
    }
    useBGE = bgeHealthy;
  }

  if (useBGE) {
    try {
      return await rerankBGE(query, documents, topN);
    } catch (error) {
      if (config.fallbackToJina) {
        logger.warn({ err: error }, '[Reranker] BGE failed, falling back to Jina');
        return await rerankJina(query, documents, topN);
      }
      throw error;
    }
  }

  return await rerankJina(query, documents, topN);
}

export type { RerankResult };
```

---

### Task 2.3: Update RAG Retrievers
**Priority**: HIGH | **Effort**: 2 hours

**Files to modify**:
- `src/stages/stage5-generation/utils/section-rag-retriever.ts`
- `src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts`

**Changes**:
```typescript
// BEFORE
import { rerankDocuments } from '../../../shared/jina';

// AFTER
import { rerankDocuments } from '../../../shared/reranker/reranker-router';
```

---

### Task 2.4: Update Environment Configuration
**Priority**: HIGH | **Effort**: 1 hour

**File**: `.env.example`
```env
# ===== BGE Stack Configuration =====

# Embeddings Provider: 'bge' | 'jina' | 'auto' (default: bge)
EMBEDDINGS_PROVIDER=bge
BGE_EMBEDDINGS_ENDPOINT=http://localhost:8080
EMBEDDINGS_FALLBACK_TO_JINA=false

# Reranker Provider: 'bge' | 'jina' | 'auto' (default: bge)
RERANKER_PROVIDER=bge
BGE_RERANKER_ENDPOINT=http://localhost:8081
RERANKER_FALLBACK_TO_JINA=false

# ===== Legacy Jina (for fallback only) =====
JINA_API_KEY=your-key-here
```

---

## Phase 3: RunPod Serverless Deployment (Week 3-4)

### Task 3.1: Create RunPod Serverless Worker
**Priority**: HIGH | **Effort**: 4 hours

**File**: `infrastructure/runpod/handler.py`

```python
"""
RunPod Serverless Worker for BGE-M3 Embeddings and Reranking
Deploy this as a custom serverless endpoint on RunPod.
"""
import runpod
import torch
from FlagEmbedding import FlagModel, FlagReranker

# Load models once at cold start (cached between requests)
print("Loading BGE-M3 embedding model...")
embed_model = FlagModel(
    'BAAI/bge-m3',
    query_instruction_for_retrieval="",
    use_fp16=True
)

print("Loading BGE reranker model...")
rerank_model = FlagReranker(
    'BAAI/bge-reranker-v2-m3',
    use_fp16=True
)

print("Models loaded successfully!")


def handler(event):
    """
    Handle embedding and reranking requests.

    Embedding request:
    {"input": {"texts": ["text1", "text2", ...]}}

    Reranking request:
    {"input": {"query": "...", "documents": ["doc1", "doc2", ...], "top_n": 10}}
    """
    try:
        input_data = event.get("input", {})

        # Embedding request
        if "texts" in input_data:
            texts = input_data["texts"]
            embeddings = embed_model.encode(texts)
            return {
                "embeddings": embeddings.tolist(),
                "dimensions": len(embeddings[0]) if embeddings.size > 0 else 0
            }

        # Reranking request
        elif "query" in input_data and "documents" in input_data:
            query = input_data["query"]
            documents = input_data["documents"]
            top_n = input_data.get("top_n")

            scores = rerank_model.compute_score(
                [[query, doc] for doc in documents],
                normalize=True
            )

            # Handle single document case
            if isinstance(scores, float):
                scores = [scores]

            results = [
                {"index": i, "relevance_score": float(score)}
                for i, score in enumerate(scores)
            ]
            results.sort(key=lambda x: x["relevance_score"], reverse=True)

            if top_n:
                results = results[:top_n]

            return {"results": results}

        else:
            return {"error": "Invalid request. Provide 'texts' for embeddings or 'query'+'documents' for reranking."}

    except Exception as e:
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
```

**File**: `infrastructure/runpod/Dockerfile`

```dockerfile
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir \
    FlagEmbedding>=1.2.0 \
    runpod>=1.6.0 \
    torch>=2.0.0

# Copy handler
COPY handler.py /app/handler.py

# Pre-download models (baked into image for faster cold starts)
RUN python -c "from FlagEmbedding import FlagModel; FlagModel('BAAI/bge-m3', use_fp16=True)"
RUN python -c "from FlagEmbedding import FlagReranker; FlagReranker('BAAI/bge-reranker-v2-m3', use_fp16=True)"

CMD ["python", "-u", "handler.py"]
```

---

### Task 3.2: Deploy to RunPod
**Priority**: HIGH | **Effort**: 2 hours

**Steps**:
1. Build and push Docker image to Docker Hub
2. Create RunPod Serverless Endpoint
3. Configure endpoint settings

```bash
# Build and push
cd infrastructure/runpod
docker build -t yourusername/bge-serverless:latest .
docker push yourusername/bge-serverless:latest
```

**RunPod Endpoint Configuration**:
- **Container Image**: `yourusername/bge-serverless:latest`
- **GPU Type**: NVIDIA T4 (16GB) or L4 (24GB)
- **Max Workers**: 3 (scales based on load)
- **Idle Timeout**: 5 seconds (quick scale-down)
- **Execution Timeout**: 60 seconds

---

### Task 3.3: Create RunPod Client
**Priority**: HIGH | **Effort**: 3 hours

**File**: `src/shared/runpod/runpod-client.ts`

```typescript
import { logger } from '../logger';

interface RunPodConfig {
  apiKey: string;
  embeddingsEndpoint: string;
  rerankerEndpoint: string;
  timeout?: number;
}

const getConfig = (): RunPodConfig => ({
  apiKey: process.env.RUNPOD_API_KEY!,
  embeddingsEndpoint: process.env.RUNPOD_EMBEDDINGS_ENDPOINT!,
  rerankerEndpoint: process.env.RUNPOD_RERANKER_ENDPOINT!,
  timeout: 60000,
});

export async function generateEmbeddingsRunPod(texts: string[]): Promise<number[][]> {
  const config = getConfig();
  const startTime = Date.now();

  const response = await fetch(config.embeddingsEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: { texts } }),
    signal: AbortSignal.timeout(config.timeout || 60000),
  });

  if (!response.ok) {
    throw new Error(`RunPod embeddings failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`RunPod error: ${result.error}`);
  }

  logger.info({
    textsCount: texts.length,
    latencyMs: Date.now() - startTime,
  }, '[RunPod Embeddings] Request completed');

  return result.output.embeddings;
}

export async function rerankDocumentsRunPod(
  query: string,
  documents: string[],
  topN?: number
): Promise<Array<{ index: number; relevance_score: number }>> {
  const config = getConfig();
  const startTime = Date.now();

  const response = await fetch(config.rerankerEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: { query, documents, top_n: topN } }),
    signal: AbortSignal.timeout(config.timeout || 60000),
  });

  if (!response.ok) {
    throw new Error(`RunPod reranker failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`RunPod error: ${result.error}`);
  }

  logger.info({
    documentsCount: documents.length,
    latencyMs: Date.now() - startTime,
  }, '[RunPod Reranker] Request completed');

  return result.output.results;
}
```

---

### Task 3.4: A/B Testing and Validation
**Priority**: HIGH | **Effort**: 4 hours

**Validation metrics**:
```python
metrics = {
    "retrieval_quality": {
        "ndcg@10": {"threshold": 0.90, "window": "7d"},
        "mrr@10": {"threshold": 0.90, "window": "7d"},
        "recall@100": {"threshold": 0.95, "window": "7d"}
    },
    "latency": {
        "p50_ms": {"threshold": 100, "alert_above": True},
        "p99_ms": {"threshold": 500, "alert_above": True}
    }
}
```

---

## Phase 4: Qdrant Hybrid Search (Optional)

> **Note**: BGE-M3 supports Dense + Sparse + ColBERT modes natively.
> This phase adds sparse vector search for improved quality.

### Task 4.1: Enable Sparse Vectors in Qdrant
**Priority**: LOW | **Effort**: 6 hours

BGE-M3 can generate sparse vectors for hybrid search:
```typescript
// BGE-M3 hybrid retrieval
const response = await fetch(`${endpoint}/embed_sparse`, {
  method: 'POST',
  body: JSON.stringify({ input: texts }),
});
```

### Task 4.2: Implement RRF Fusion
**Priority**: LOW | **Effort**: 4 hours

---

## Success Criteria

| Metric | Jina API (Current) | BGE Self-Hosted (Target) | Improvement |
|--------|-------------------|--------------------------|-------------|
| **Cost per course** | $10 | **$0** (local) / **$0.30** (cloud) | **97-100%** |
| **Monthly cost (1k courses)** | $10,000 | **$300-400** | **96-97%** |
| **Quality (MIRACL-ru)** | ~65 nDCG@10 | **~70 nDCG@10** | **+8%** |
| **Quality vs baseline** | 100% | **105-110%** | **+5-10%** |
| **Embeddings latency** | 200-500ms | **50-100ms** | **4-5x faster** |
| **Rerank latency p99** | 2s | **<300ms** | **7x faster** |
| **License** | CC-BY-NC (restricted) | **MIT/Apache** | ✅ Commercial |

---

## Development Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOCAL DEVELOPMENT (AMD 7900 XTX)             │
│                                                                 │
│  1. Start BGE stack with Infinity:                              │
│     docker-compose -f infrastructure/bge-stack/docker-compose.local.yml up -d
│                                                                 │
│  2. Set environment:                                            │
│     EMBEDDINGS_PROVIDER=bge                                     │
│     BGE_EMBEDDINGS_ENDPOINT=http://localhost:8080               │
│     RERANKER_PROVIDER=bge                                       │
│     BGE_RERANKER_ENDPOINT=http://localhost:8081                 │
│                                                                 │
│  3. Run course generation - uses local GPU, $0 cost             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (RunPod Serverless)                   │
│                                                                 │
│  1. Deploy custom handler to RunPod Serverless                  │
│     (see Phase 3: Task 3.1-3.2)                                 │
│                                                                 │
│  2. Set environment:                                            │
│     RUNPOD_API_KEY=your-api-key                                 │
│     RUNPOD_EMBEDDINGS_ENDPOINT=https://api.runpod.ai/v2/xxx/runsync
│     RUNPOD_RERANKER_ENDPOINT=https://api.runpod.ai/v2/xxx/runsync
│                                                                 │
│  3. Dev: ~$5-20/month (scale to zero)                           │
│     Prod: ~$100-300/month (active use)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure After Implementation

```
packages/course-gen-platform/
├── src/shared/
│   ├── embeddings/                    # NEW
│   │   ├── bge-client.ts              # BGE embeddings client (local Infinity)
│   │   ├── embeddings-router.ts       # Main entry point
│   │   └── index.ts
│   ├── reranker/                      # NEW
│   │   ├── bge-reranker-client.ts     # BGE reranker client (local Infinity)
│   │   ├── reranker-router.ts         # Main entry point
│   │   └── index.ts
│   ├── runpod/                        # NEW - RunPod Serverless
│   │   ├── runpod-client.ts           # RunPod API client
│   │   └── index.ts
│   └── jina/                          # DEPRECATED (keep for fallback)
│       ├── jina-client.ts             # Jina embeddings (legacy)
│       ├── reranker-client.ts         # Jina reranker (legacy)
│       └── index.ts

infrastructure/
├── bge-stack/                         # NEW - Local development
│   ├── docker-compose.local.yml       # AMD/Infinity for local dev
│   └── README.md
└── runpod/                            # NEW - Server deployment
    ├── handler.py                     # RunPod Serverless handler
    ├── Dockerfile                     # Custom worker image
    └── README.md

scripts/
└── migrate-to-bge-embeddings.ts       # Migration script
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start local BGE stack (AMD) | `docker-compose -f infrastructure/bge-stack/docker-compose.local.yml up -d` |
| Test local embeddings | `curl http://localhost:8080/embeddings -d '{"input":["test"]}'` |
| Test local reranker | `curl http://localhost:8081/rerank -d '{"query":"test","documents":["doc1","doc2"]}'` |
| Build RunPod image | `docker build -t yourname/bge-serverless:latest infrastructure/runpod/` |
| Push RunPod image | `docker push yourname/bge-serverless:latest` |
| Run with local BGE | `EMBEDDINGS_PROVIDER=bge RERANKER_PROVIDER=bge pnpm dev` |
| Run with RunPod | `RUNPOD_API_KEY=xxx RUNPOD_EMBEDDINGS_ENDPOINT=... pnpm dev` |
| Run migration | `pnpm tsx scripts/migrate-to-bge-embeddings.ts` |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Quality regression on Russian | Low (20%) | High | A/B test; BGE benchmarks show +8% improvement |
| RunPod cold start latency | Medium (40%) | Low | 2-10 sec acceptable; pre-warm if needed |
| AMD/ROCm issues (local) | Medium (40%) | Low | Use Infinity instead of TEI |
| Migration data loss | Low (10%) | High | Backup Qdrant before migration |
| RunPod availability | Low (15%) | Medium | Fallback to Jina API temporarily |
| Jina deprecation issues | Low (15%) | Low | Keep fallback for 30 days post-migration |

---

## Notes

1. **Jina License**: CC-BY-NC 4.0 prohibits commercial use - migration is required
2. **BGE Quality**: 105-110% of Jina baseline on MIRACL-ru benchmarks
3. **Local (AMD)**: Use Infinity (`michaelf34/infinity:0.0.70-amd`) - TEI не поддерживает ROCm
4. **Server**: Use RunPod Serverless with custom handler (auto scale to zero)
5. **Embeddings Migration**: One-time reindexing required (2-4 hours)
6. **Cost Savings**: 97% reduction ($10k → $300-400/month)
