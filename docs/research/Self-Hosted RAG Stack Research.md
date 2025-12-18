# **Comparative Analysis of Self-Hosted Embedding and Reranking Architectures for Russian-English Educational RAG Systems**

## **Executive Summary**

The strategic transition from managed API solutions to self-hosted retrieval architectures represents a critical inflection point for production-grade Retrieval-Augmented Generation (RAG) systems. For an educational platform delivering bilingual content in Russian and English, this migration is not merely a cost-saving exercise but a fundamental architectural realignment designed to enhance pedagogical accuracy, data sovereignty, and system responsiveness. The current reliance on the Jina AI API, while functionally robust, imposes operational constraints through non-linear pricing models and commercial licensing restrictions (CC-BY-NC) that frictionally impede scale.

This comprehensive research report evaluates the current open-weight landscape to identify an optimal embedding and reranking stack that operates within a strict total cost of ownership (TCO) ceiling of $500 per month. The analysis rigorously compares leading multilingual models—specifically **Jina Embeddings v3**, **BAAI/bge-m3**, **DeepVK/USER-bge-m3**, and **Multilingual-E5**—against the distinct linguistic and structural requirements of educational retrieval.

The findings unequivocally indicate that **BAAI/bge-m3** serves as the superior foundational embedding model for this specific use case. Unlike its competitors, BGE-M3 offers a permissive MIT license, native support for hybrid retrieval (integrating dense, sparse, and multi-vector signals), and a massive 8192-token context window essential for processing lengthy educational texts without semantic fragmentation. For the reranking stage, the analysis recommends **BAAI/bge-reranker-v2-m3**, a cross-encoder that delivers State-of-the-Art (SOTA) performance on Russian retrieval benchmarks (RuMTEB and MIRACL) while maintaining high inference throughput on consumer-grade hardware.

The recommended implementation strategy leverages **Hugging Face Text Embeddings Inference (TEI)** deployed on **AWS g4dn.xlarge** instances (NVIDIA T4 GPU). This architecture ensures sub-50ms latency for dense retrieval and sub-200ms latency for reranking, all while stabilizing monthly infrastructure costs at approximately **$380**, significantly below the budgetary cap. This report details the theoretical, technical, and financial justifications for this stack, providing a blueprint for engineering a high-fidelity, self-hosted retrieval engine.

## ---

**1\. Introduction and Strategic Context**

The operationalization of Large Language Models (LLMs) in educational technology has shifted the focus from pure generation to accurate retrieval. In a RAG system, the "generation" is only as good as the "retrieval." If the embedding model fails to surface the correct textbook paragraph explaining *Quantum Mechanics* or *Russian Syntax*, the LLM will inevitably hallucinate or provide generic, unhelpful answers. This dependency places the retrieval stack at the core of the product's value proposition.

### **1.1 The Imperative for Self-Hosting**

While APIs like Jina AI, OpenAI, and Cohere offer ease of entry, they introduce structural risks for scaling educational platforms:

1. **Cost Linearity:** API costs scale linearly with usage. As the user base grows and the volume of re-indexing (for new curriculum updates) increases, token costs can balloon unpredictably. Educational content, which is token-heavy (long chapters, academic papers), exacerbates this.  
2. **Data Privacy:** Educational platforms often handle sensitive student data or proprietary curricular content. Offloading this data to third-party processors introduces compliance overhead (GDPR, localized Russian data laws). Self-hosting keeps all vectors and query logs within the Virtual Private Cloud (VPC).  
3. **Latency Control:** Network round-trips to an API endpoint introduce variable latency. A self-hosted inference server on the same local network as the application server reduces this overhead to negligible levels, enabling tighter feedback loops for interactive tutoring applications.

### **1.2 The Bilingual Educational Domain**

Retrieval in this context is uniquely challenging due to the intersection of two complex factors:

* **Domain Specificity:** Educational queries are often precise ("What is the formula for variance?") or conceptual ("Explain the themes in Dostoevsky's Crime and Punishment"). The system must handle both exact terminology matching and abstract semantic alignment.  
* **Linguistic Divergence:** The system must function seamlessly in Russian and English. This requires a model that understands the deep morphological variations of Russian (where word endings change based on case, gender, and number) while maintaining the semantic precision of English technical terms. Models trained primarily on English data often treat Russian as a second-class citizen, resulting in poor retrieval performance for Cyrillic queries.

## ---

**2\. Linguistic and Technical Requirements Analysis**

To select the correct model, we must first technically define the "problem space." The interplay between Russian linguistics and the structural nature of educational content dictates specific model requirements that disqualify many generic options.

### **2.1 Russian Morphology and Tokenization**

Russian is a synthetic language with a rich fusional morphology. A single lemma (dictionary form) can produce dozens of inflected forms. For example, the word for "book" can appear as книга (nominative), книги (genitive), книге (dative), книгу (accusative), etc.

* **Lexical Failure Modes:** Traditional lexical search engines (like Elasticsearch using standard analyzers) often fail to match *книгу* with *книга* without aggressive stemming, which can strip away semantic nuance.  
* **Tokenization efficiency:** Multilingual models use subword tokenizers (SentencePiece or WordPiece). A model's efficiency in Russian depends on its vocabulary size. If the vocabulary is too English-centric, Russian words are broken into many small byte-level fragments, inflating token counts and diluting semantic density. Models like **XLM-RoBERTa** (the base for Jina v3 and BGE-M3) utilize a large, balanced vocabulary (250k tokens) that represents Cyrillic efficiently, usually encoding Russian words in 1-2 tokens rather than the 4-5 tokens seen in GPT-based tokenizers.1

### **2.2 The 8192-Token Context Window Requirement**

Educational materials are fundamentally long-form. A textbook chapter, a lecture transcript, or a research paper abstract often exceeds the standard 512-token limit of BERT-based models.

* **The Fragmentation Problem:** Using a 512-token model (like multilingual-e5-large) necessitates "chunking"—breaking a document into small pieces. This creates semantic fragmentation. If the "conclusion" of a physics proof is in chunk 2, but the "premise" is in chunk 1, a query about the proof might retrieve one but not the other, depriving the LLM of the full logical chain.  
* **The Long-Context Solution:** Models with 8192-token windows allow the system to embed entire logical sections as single units. This "Late Chunking" or large-context approach preserves the narrative arc and argumentative structure of the content, which is critical for pedagogical coherence.2

### **2.3 Hybrid Retrieval: The Necessity of Sparse Vectors**

In education, terminology matters. If a student searches for "mitochondria," the system must not return a generic document about "cells" that fails to mention the specific organelle.

* **Dense Vectors:** Excellent for concept matching (Query: "powerhouse of the cell" \-\> Doc: "Mitochondria generate energy").  
* **Sparse Vectors:** Essential for exact term matching. While BM25 is the traditional method, learned sparse representations (like SPLADE or BGE-M3's sparse output) are superior because they handle term expansion and weighting dynamically. For a Russian-English system, a model that natively supports hybrid retrieval (generating both vector types in one pass) simplifies infrastructure by removing the need for a separate search index (like Lucene) alongside the vector store.4

## ---

**3\. Landscape Analysis of Candidate Embedding Models**

The open-source community offers several high-performance multilingual embedding models. We evaluate the top contenders based on their suitability for the defined constraints: performance on RuMTEB/MIRACL, licensing, and computational efficiency.

### **3.1 Jina Embeddings v3: The Technical Benchmark**

Jina AI's **jina-embeddings-v3** is arguably the most advanced open-weights model currently available. It utilizes a 570M parameter architecture based on XLM-RoBERTa with Flash Attention 2 and Rotary Positional Embeddings (RoPE).2

* **Task-Specific LoRA Adapters:** A unique feature is its use of Low-Rank Adaptation (LoRA). The model includes five specialized adapters—retrieval.query, retrieval.passage, separation, classification, and text-matching. During inference, the user specifies the task, and the model dynamically activates the corresponding adapter. This allows a single model to optimize for asymmetric retrieval (finding a passage from a query) and symmetric similarity (clustering) simultaneously.3  
* **Matryoshka Representation Learning (MRL):** Jina v3 supports flexible output dimensions. Users can truncate the 1024-dimensional vectors to 512, 256, or even 32 dimensions with minimal loss in retrieval accuracy. This offers massive savings in vector storage costs.3  
* **The Licensing Barrier:** The critical flaw for this specific user request is the license. Jina v3 is released under **CC-BY-NC 4.0** (Creative Commons Attribution-NonCommercial).6 "Commercial usage" is broadly defined, and while a university might qualify as non-commercial, a generic "educational content platform" often falls into commercial territory (e.g., if it charges fees or is a startup). Using this model would likely require a negotiated commercial license, reintroducing the "vendor lock-in" and variable cost risks the user seeks to avoid.

### **3.2 BAAI/bge-m3: The Strategic Choice**

The **BGE-M3** (Multi-Functionality, Multi-Linguality, Multi-Granularity) model from the Beijing Academy of Artificial Intelligence represents the most balanced choice for self-hosting.4

* **Architecture:** It is a 568M parameter model initialized from XLM-RoBERTa, trained on a massive multilingual dataset (MTP) encompassing 100+ languages.8 Like Jina v3, it supports an 8192-token context window.  
* **Unified Hybrid Retrieval:** BGE-M3 is unique in its ability to output three distinct embedding types simultaneously:  
  1. **Dense:** Standard CLS-token embedding (1024 dim).  
  2. **Sparse:** A lexical weight vector (similar to SPLADE) for exact term matching.  
  3. **Multi-Vector (ColBERT):** Token-level embeddings for fine-grained interaction.4  
  * *Note:* While the ColBERT mode is powerful, it increases storage requirements by \~50-100x (storing vectors for *every* token). For a cost-constrained \<$500/mo system, the **Dense \+ Sparse** combination is the sweet spot, offering hybrid search capabilities without the massive index size of ColBERT.9  
* **Performance:** On the **RuMTEB** retrieval benchmark, BGE-M3 consistently achieves top-tier scores (NDCG@10 \~0.945), outperforming multilingual-e5-large and even specifically fine-tuned Russian models in generalization tasks.10  
* **License:** It is released under the **MIT License** 11, permitting unrestricted commercial use and modification. This ensures long-term viability without legal exposure.

### **3.3 DeepVK/USER-bge-m3: The Specialist**

**USER-bge-m3** is a derivative model fine-tuned by DeepVK specifically for Russian retrieval.12

* **Fine-Tuning:** It initializes from a pruned en-ru-BGE-M3 checkpoint and is further trained on Russian datasets like RuBQ and Ria-News.1  
* **Performance Delta:** Benchmarks indicate it marginally outperforms the base BGE-M3 on *symmetric* Russian tasks (like STS \- Semantic Textual Similarity) but performs slightly worse or equal on *asymmetric* retrieval tasks (NDCG@10 0.934 vs 0.945 for base BGE-M3).10  
* **Risk:** Specialized models often suffer from "catastrophic forgetting" of the original multilingual capabilities. For a bilingual system (Russian *and* English), the base BGE-M3 is safer, as it retains its robust English capabilities derived from the massive MTP dataset.

### **3.4 Multilingual-E5-Large: The Legacy Standard**

**intfloat/multilingual-e5-large-instruct** was the previous gold standard.1

* **Limitation:** Its primary handicap is the **512-token limit**. In educational contexts, this is a disqualifying factor for document-level retrieval. While it performs admirably on sentence-level tasks, it cannot capture the broad context of a textbook chapter without complex sliding-window strategies that complicate the pipeline.1

### **Table 1: Comparative Evaluation of Embedding Models**

| Feature | BAAI/bge-m3 | Jina Embeddings v3 | DeepVK/USER-bge-m3 | Multilingual-E5 |
| :---- | :---- | :---- | :---- | :---- |
| **Parameters** | 568M | 570M | 359M | 560M |
| **Context Window** | **8192** | **8192** | 8192 | 512 |
| **License** | **MIT** (Open) | **CC-BY-NC** (Restrictive) | Apache 2.0 | MIT |
| **Output Modes** | Dense, Sparse, Multi-vec | Dense (LoRA adapters) | Dense | Dense |
| **Russian NDCG@10** | **\~0.945** (Best) | Competitive | \~0.934 | \~0.927 |
| **Hybrid Support** | Native (Dense \+ Sparse) | No (Dense Only) | No | No |
| **Commercial Viability** | High (Free) | Low (Paid License) | High | Medium (Context limit) |

**Conclusion on Embeddings:** **BAAI/bge-m3** is the optimal choice. It balances SOTA performance, permissive licensing, and the critical structural requirement of long-context and hybrid retrieval.

## ---

**4\. Reranking Architecture and Strategy**

The embedding step prioritizes **Recall** (finding everything potentially relevant). The reranking step prioritizes **Precision** (ordering the top results so the LLM sees the best answer first). In a cost-constrained environment, the reranker is the most efficient way to boost system quality without training custom embedding models.

### **4.1 Cross-Encoder vs. Bi-Encoder**

* **Bi-Encoders (Embeddings):** Encode the query and document separately into vectors ($V\_q, V\_d$) and compute similarity via dot product. This is fast ($O(1)$) but misses fine-grained interactions between query terms and document details.  
* **Cross-Encoders (Rerankers):** Feed the query and document *together* into the Transformer layers: $Score \= Model(Query, Document)$. The attention mechanism can "see" how specific query words align with document words. This is computationally expensive ($O(N)$) but significantly more accurate.4

### **4.2 Candidate: BAAI/bge-reranker-v2-m3**

This model is the natural companion to the BGE-M3 embedding model.

* **Architecture:** It is a lightweight cross-encoder (560M parameters) initialized from XLM-RoBERTa.  
* **Capabilities:** It supports the same massive multilingual vocabulary and 8192-token context as the embedding model. However, for performance reasons, reranking is usually performed on shorter windows (e.g., the specific chunks retrieved).  
* **Performance:** It outperforms classic rerankers (like ms-marco-MiniLM) by a wide margin on multilingual benchmarks. Crucially, it works natively with Russian without the translation artifacts that plague English-centric rerankers.4  
* **Distilled Versions:** For even higher performance, there are distilled versions (e.g., bge-reranker-base), but given the T4 GPU availability in our budget, the full v2-m3 model is viable and recommended for maximum quality.

### **4.3 Pipeline Integration**

The optimal strategy for the \<$500 budget is a **"Retrieve-Then-Rerank"** pipeline:

1. **Retrieval:** Use BGE-M3 (Dense \+ Sparse) to fetch the top 50-100 candidates from the vector database.  
2. **Reranking:** Pass these 50 pairs to bge-reranker-v2-m3.  
3. **Selection:** Take the top 5-10 scored chunks for the LLM context window.

This approach filters out noise effectively. For example, if a Russian query matches a document keyword-wise but the context is wrong (e.g., "bank" as in river vs. finance), the embedding model might retrieve it, but the cross-encoder reranker will identify the semantic mismatch and demote it.

## ---

**5\. Benchmarking and Performance Validation**

We must validate that the selected stack (BGE-M3 \+ BGE-Reranker) performs adequately on objective metrics.

### **5.1 Retrieval Quality (RuMTEB & MIRACL)**

The **RuMTEB** (Russian Massive Text Embedding Benchmark) aggregates roughly 23 datasets across classification, clustering, and retrieval.13

* **Data Points:** On the Retrieval subset, BGE-M3 scores an average **NDCG@10 of 0.52-0.65** depending on the specific tasks, consistently ranking \#1 among open-source models under 1B parameters. On the **MIRACL** (Russian split), it achieves Recall@100 scores superior to multilingual-e5-large.14  
* **DeepVK Comparison:** While USER-bge-m3 claims higher performance on specific internal benchmarks, independent RuMTEB leaderboards show BGE-M3 leading in "Retrieval" categories (0.945 vs 0.934), likely due to its broader pre-training on diverse multilingual corpora which aids generalization.10

### **5.2 Throughput and Latency on T4 Hardware**

A critical requirement is replacing the Jina API with a *performant* self-hosted solution. Using a standard **NVIDIA T4** (available in AWS g4dn.xlarge):

* **Embedding Latency:** BGE-M3 (568M params) is heavier than all-MiniLM (33M).  
  * *Batch Size 1:* \~32ms latency.15  
  * *Batch Size 32:* Throughput reaches \~400-500 documents/second with proper optimizations (FP16, Flash Attention).  
* **Reranking Latency:** Reranking 10 documents takes approximately 100-200ms depending on document length.  
* **Total System Latency:** For a standard RAG query (Embed Query \+ Vector Search \+ Rerank 10 docs), the total overhead is **\<300ms**. This is comparable to, or often faster than, an API call to Jina AI which involves network latency to their data centers.

### **Table 2: Performance Estimates (AWS g4dn.xlarge)**

| Operation | Model | Latency (P90) | Throughput (Docs/sec) |
| :---- | :---- | :---- | :---- |
| **Embed Query** | BGE-M3 (FP16) | \~35ms | N/A |
| **Embed Doc** | BGE-M3 (FP16) | N/A | \~450 |
| **Rerank (Top-10)** | BGE-Reranker (FP16) | \~180ms | \~50 pairs/sec |
| **Total Pipeline** | **End-to-End** | **\~250-300ms** | **\~40 QPS** |

## ---

**6\. Infrastructure, Cost Modeling, and Engineering**

This section details the concrete engineering steps to deploy the stack within the \<$500/month budget.

### **6.1 Hardware Selection: The Cloud vs. On-Prem Dilemma**

To minimize costs while ensuring reliability, we target the **NVIDIA T4** GPU (16GB VRAM). It offers the best price/performance ratio for inference of transformer models \<1B parameters.

#### **Cost Breakdown (AWS g4dn.xlarge)**

* **Region:** US-East (N. Virginia)  
* **Instance Price:** $0.526 per hour (On-Demand).16  
* **Storage (EBS):** 100GB gp3 SSD (\~$8/month).  
* **Data Transfer:** Estimated $10/month (internal VPC traffic is free, ingress is free).  
* **Total Monthly Cost:** $(0.526 \\times 24 \\times 30\) \+ 8 \+ 10 \\approx \\mathbf{\\$396.72}$.

This fits comfortably under the $500 cap.

* **Savings Opportunity:** Using **Savings Plans** (1-year commit) can reduce this by \~20-30%, bringing costs down to \~$280/month.17  
* **Spot Instances:** Not recommended for production endpoints due to interruptions, but viable for the *indexing* worker (batch processing textbooks) to save money.

### **6.2 Serving Architecture: Text Embeddings Inference (TEI)**

We will use **Hugging Face Text Embeddings Inference (TEI)**. It is a purpose-built Rust/CUDA server that outperforms generic Python servers (like Uvicorn/FastAPI) by 2-5x.18

**Why TEI?**

1. **Dynamic Batching:** Automatically groups incoming requests into optimal batches, saturating the GPU.  
2. **Flash Attention:** Essential for the 8192-token window. Without it, memory usage scales quadratically ($O(L^2)$) with length. Flash Attention makes it linear/sub-quadratic, allowing long documents to fit in the T4's 16GB VRAM.  
3. **Safetensors:** Fast loading and security (no pickle execution risks).

### **6.3 Implementation Guide**

Step 1: Docker Deployment  
We run two separate containers on the single g4dn.xlarge instance. The T4 has 16GB VRAM. BGE-M3 (FP16) takes \~1.1GB. BGE-Reranker (FP16) takes \~1.1GB. This leaves \~13GB for the KV cache and massive batch sizes.  
**Container A: Embedding Service**

Bash

docker run \-d \--name tei-embed \\  
  \--gpus all \\  
  \-p 8080:80 \\  
  \-v /data:/data \\  
  ghcr.io/huggingface/text-embeddings-inference:turing-1.8 \\  
  \--model-id BAAI/bge-m3 \\  
  \--max-client-batch-size 32 \\  
  \--max-batch-tokens 16384 \\  
  \--pooling cls

Note: pooling cls is used for the dense vector. turing-1.8 is the image tag compatible with T4 (Turing architecture).19

**Container B: Reranking Service**

Bash

docker run \-d \--name tei-rerank \\  
  \--gpus all \\  
  \-p 8081:80 \\  
  \-v /data:/data \\  
  ghcr.io/huggingface/text-embeddings-inference:turing-1.8 \\  
  \--model-id BAAI/bge-reranker-v2-m3 \\  
  \--max-client-batch-size 16

Step 2: Vector Database (Qdrant)  
Deploy Qdrant (Docker) on the same instance or a small separate CPU instance (e.g., t3.medium \~$30/mo) for isolation.

* **Configuration:** Enable **Binary Quantization**. BGE-M3 vectors are robust to binary quantization (converting float32 to 1-bit), reducing RAM usage by 32x and speeding up search by 40x with minimal retrieval loss. This allows storing millions of vectors in minimal RAM.

**Step 3: Application Logic (Python)**

Python

import requests

def retrieve(query):  
    \# 1\. Embed Query  
    emb\_resp \= requests.post("http://localhost:8080/embed", json={"inputs": query})  
    query\_vec \= emb\_resp.json()  
      
    \# 2\. Vector Search (Qdrant)  
    candidates \= qdrant.search(collection="education", vector=query\_vec, limit=50)  
      
    \# 3\. Rerank  
    rerank\_payload \= {  
        "query": query,  
        "texts": \[c.payload\['text'\] for c in candidates\]  
    }  
    rerank\_resp \= requests.post("http://localhost:8081/rerank", json=rerank\_payload)  
    ranked\_indices \= \[r\['index'\] for r in rerank\_resp.json()\]  
      
    \# 4\. Return Top 5  
    return \[candidates\[i\] for i in ranked\_indices\[:5\]\]

## ---

**7\. Risk Assessment and Future Proofing**

### **7.1 Licensing Compliance**

The shift from Jina (CC-BY-NC) to BGE (MIT) eliminates legal risk.

* **Jina Risk:** If the educational platform adds a "Pro" subscription or sells API access to partners, the CC-BY-NC license would mandate a commercial contract, potentially costing thousands annually.  
* **BGE Safety:** The MIT license allows the platform to be sold, closed-sourced, or commercialized without royalties.

### **7.2 Model Drift and Maintenance**

Open-source models are static (they don't change unless you update them), whereas APIs change silently.

* **Benefit:** Stability. You guarantee that the retrieval behavior for a physics query today is the same tomorrow.  
* **Burden:** You are responsible for updates. The recommendation is to review the leaderboard (MTEB) annually. Given BGE-M3's massive scale and performance, it is unlikely to be obsolete for at least 12-18 months.

### **7.3 Fallback Strategies**

If the T4 instance fails:

1. **Redundancy:** For production, it is advisable to run a second instance in a different Availability Zone (AZ). This would double the cost to \~$800, exceeding the budget.  
2. **Budget Strategy:** To stay \<$500 with redundancy, use **Spot Instances** for the second node. T4 spot prices are often \~$0.15/hr.  
   * Primary (On-Demand): $396  
   * Secondary (Spot): \~$110  
   * Total: \~$506 (slightly over, but significantly more robust).

## ---

**8\. Conclusion and Final Recommendation**

For a bilingual Russian-English educational RAG system operating under a strict budget, the **Jina API** should be replaced with a self-hosted stack centered on **BAAI/bge-m3**.

**The Winning Architecture:**

1. **Embedding:** BAAI/bge-m3 (MIT License, 8192 context, Hybrid capabilities).  
2. **Reranking:** BAAI/bge-reranker-v2-m3 (SOTA multilingual precision).  
3. **Inference Engine:** Hugging Face TEI (Flash Attention, Rust-optimized).  
4. **Infrastructure:** AWS g4dn.xlarge (NVIDIA T4).

**Key Takeaways:**

* **Quality:** BGE-M3 provides benchmark-leading retrieval in Russian, outperforming legacy E5 models and offering a distinct advantage in hybrid (dense \+ sparse) search which is crucial for educational terminology.  
* **Cost:** The projected TCO is **\~$396/month**, well within the $500 limit.  
* **Capability:** The 8192-token context window resolves the context fragmentation issues inherent in older 512-token models, enabling the system to ingest and understand full textbook chapters.

This stack transforms the retrieval layer from a rented, opaque, and legally restrictive dependency into an owned, transparent, and highly performant asset.

---

References and Citations  
.1

#### **Источники**

1. Building Russian Benchmark for Evaluation of Information Retrieval Models, дата последнего обращения: декабря 6, 2025, [https://dialogue-conf.org/wp-content/uploads/2025/04/KovalevGetal.046.pdf](https://dialogue-conf.org/wp-content/uploads/2025/04/KovalevGetal.046.pdf)  
2. Jina Embeddings v3 \- Microsoft Marketplace, дата последнего обращения: декабря 6, 2025, [https://marketplace.microsoft.com/en-us/marketplace/apps/jinaai.jina-embeddings-v3-vm?tab=Overview](https://marketplace.microsoft.com/en-us/marketplace/apps/jinaai.jina-embeddings-v3-vm?tab=Overview)  
3. jina-embeddings-v3 \- Search Foundation Models, дата последнего обращения: декабря 6, 2025, [https://jina.ai/models/jina-embeddings-v3/](https://jina.ai/models/jina-embeddings-v3/)  
4. BAAI/bge-m3 \- Hugging Face, дата последнего обращения: декабря 6, 2025, [https://huggingface.co/BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)  
5. jina-embeddings-v3: Multilingual Embeddings With Task LoRA \- arXiv, дата последнего обращения: декабря 6, 2025, [https://arxiv.org/html/2409.10173v3](https://arxiv.org/html/2409.10173v3)  
6. Contact sales \- Jina AI, дата последнего обращения: декабря 6, 2025, [https://jina.ai/contact-sales/](https://jina.ai/contact-sales/)  
7. BGE-M3 — BGE documentation \- BGE Models, дата последнего обращения: декабря 6, 2025, [https://bge-model.com/bge/bge\_m3.html](https://bge-model.com/bge/bge_m3.html)  
8. BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation \- arXiv, дата последнего обращения: декабря 6, 2025, [https://arxiv.org/html/2402.03216v3](https://arxiv.org/html/2402.03216v3)  
9. Jina-ColBERT-v2: A General Purpose Multilingual Late Interaction Retriever \- arXiv, дата последнего обращения: декабря 6, 2025, [https://arxiv.org/html/2408.16672v1](https://arxiv.org/html/2408.16672v1)  
10. deepvk/USER-bge-m3 · Hugging Face, дата последнего обращения: декабря 6, 2025, [https://huggingface.co/deepvk/USER-bge-m3](https://huggingface.co/deepvk/USER-bge-m3)  
11. qilowoq/bge-reranker-v2-m3-en-ru \- Hugging Face, дата последнего обращения: декабря 6, 2025, [https://huggingface.co/qilowoq/bge-reranker-v2-m3-en-ru](https://huggingface.co/qilowoq/bge-reranker-v2-m3-en-ru)  
12. USER Bge M3 · Models \- Dataloop AI, дата последнего обращения: декабря 6, 2025, [https://dataloop.ai/library/model/deepvk\_user-bge-m3/](https://dataloop.ai/library/model/deepvk_user-bge-m3/)  
13. The Russian-focused embedders' exploration: ruMTEB benchmark and Russian embedding model design \- arXiv, дата последнего обращения: декабря 6, 2025, [https://arxiv.org/html/2408.12503v1](https://arxiv.org/html/2408.12503v1)  
14. deepvk/USER-base \- Hugging Face, дата последнего обращения: декабря 6, 2025, [https://huggingface.co/deepvk/USER-base](https://huggingface.co/deepvk/USER-base)  
15. OpenAI text-embedding-3-small vs BAAI/bge-m3 \- Agentset, дата последнего обращения: декабря 6, 2025, [https://agentset.ai/embeddings/compare/openai-text-embedding-3-small-vs-baaibge-m3](https://agentset.ai/embeddings/compare/openai-text-embedding-3-small-vs-baaibge-m3)  
16. g4dn.xlarge Pricing and Specs: AWS EC2, дата последнего обращения: декабря 6, 2025, [https://costcalc.cloudoptimo.com/aws-pricing-calculator/ec2/g4dn.xlarge](https://costcalc.cloudoptimo.com/aws-pricing-calculator/ec2/g4dn.xlarge)  
17. g4dn.xlarge pricing and specs \- Amazon EC2 Instance Comparison \- Vantage, дата последнего обращения: декабря 6, 2025, [https://instances.vantage.sh/aws/ec2/g4dn.xlarge](https://instances.vantage.sh/aws/ec2/g4dn.xlarge)  
18. Text Embeddings Inference \- Hugging Face, дата последнего обращения: декабря 6, 2025, [https://huggingface.co/docs/text-embeddings-inference/index](https://huggingface.co/docs/text-embeddings-inference/index)  
19. huggingface/text-embeddings-inference \- GitHub, дата последнего обращения: декабря 6, 2025, [https://github.com/huggingface/text-embeddings-inference](https://github.com/huggingface/text-embeddings-inference)  
20. Benchmark of 11 Best Open Source Embedding Models for RAG \- Research AIMultiple, дата последнего обращения: декабря 6, 2025, [https://research.aimultiple.com/open-source-embedding-models/](https://research.aimultiple.com/open-source-embedding-models/)  
21. add russian leaderboard · mteb/leaderboard at 804b114 \- Hugging Face, дата последнего обращения: декабря 6, 2025, [https://huggingface.co/spaces/mteb/leaderboard/commit/804b114959fee49fb6c5eb3fc13a1d229c362d43](https://huggingface.co/spaces/mteb/leaderboard/commit/804b114959fee49fb6c5eb3fc13a1d229c362d43)  
22. Reranker API \- Jina AI, дата последнего обращения: декабря 6, 2025, [https://jina.ai/en-US/reranker/](https://jina.ai/en-US/reranker/)  
23. The Russian-focused embedders' exploration: ruMTEB benchmark and Russian embedding model design \- ResearchGate, дата последнего обращения: декабря 6, 2025, [https://www.researchgate.net/publication/392503425\_The\_Russian-focused\_embedders'\_exploration\_ruMTEB\_benchmark\_and\_Russian\_embedding\_model\_design](https://www.researchgate.net/publication/392503425_The_Russian-focused_embedders'_exploration_ruMTEB_benchmark_and_Russian_embedding_model_design)