# **Cost-Efficient Neural Reranking Architectures for High-Volume Educational RAG Pipelines**

## **1\. Executive Analysis of the Retrieval-Economics Paradox**

The deployment of Retrieval-Augmented Generation (RAG) systems in educational contexts presents a unique economic paradox: the imperative for high precision—driven by the pedagogical requirement to retrieve exact textbook segments or lecture transcriptions—scales linearly with cost, often rendering high-fidelity pipelines financially unsustainable. The current expenditure of approximately $10 per course for reranking services within a Russian/English pipeline utilizing Qdrant and Jina AI suggests a system operating at a distinct efficiency frontier, where the volume of tokens processed per query outstrips the utility derived from standard commercial pricing models. To achieve a 50-80% reduction in this operational overhead, one cannot rely on a single optimization vector. Instead, the solution requires a tripartite restructuring of the retrieval stack: leveraging architectural compression via hybrid fusion to reduce the reranking candidate set, capitalizing on the emerging arbitrage in model inference pricing (specifically through providers like SiliconFlow and Voyage AI), and potentially repatriating the inference workload to self-hosted infrastructure where marginal costs approach zero.

The RAG landscape in 2025 has bifurcated into high-cost, high-capability proprietary endpoints and highly efficient, open-weight models that rival state-of-the-art performance at a fraction of the price. For a dual-language corpus comprising English technical terminology and Russian morphological complexity, the choice of model is constrained by the "modality gap"—the inability of Anglocentric models to accurately map Cyrillic queries to semantic concepts without significant degradation.1 However, recent benchmarks on RusBEIR and MIRACL indicate that models such as BGE-M3 and Qwen-Reranker have largely solved this alignment problem.2 This report establishes a comprehensive technical and financial roadmap to dismantle the $10/course cost barrier, demonstrating that a combination of Qdrant’s advanced filtering capabilities and cost-optimized inference endpoints can realistically yield savings exceeding 85% while preserving the semantic integrity required for educational retrieval.

## ---

**2\. Deconstructing the $10/Course Cost Basis**

To engineer a solution that reduces costs by an order of magnitude, it is essential to first audit the prevailing cost drivers. A $10 per course operational expense for reranking alone indicates a massive throughput of tokens, suggesting that the current pipeline likely reranks a high number of document chunks (the $k$ parameter) or processes extremely long context windows without adequate pre-filtering.

### **2.1 The Token Volume Equation**

The primary cost driver in modern Neural Reranking is the cross-attention mechanism. Unlike bi-encoders (embeddings) which pre-compute vector representations, cross-encoder rerankers must process the concatenated query and document pair at inference time. This results in a computational complexity of $O(N \\times L^2)$, where $N$ is the number of candidate documents and $L$ is the sequence length.

If we assume the current provider, Jina AI, charges approximately **$0.02 per 1 million tokens** (based on standard 2025 pricing tiers for their base multilingual models) 4, a $10 cost implies the processing of **500 million tokens** per course. Even with a generous markup or a legacy pricing model, this volume suggests that the system is likely reranking the entire retrieved context for every user query, or the "course" unit involves an immense amount of interactive dialogue where every turn triggers a full-context rerank.

Alternatively, if the pipeline utilizes a "per search" pricing model similar to Cohere’s legacy tiers or specific enterprise contracts, the cost mechanism changes significantly. Cohere, for instance, charges **$2.00 per 1,000 search units**, where a "search unit" is defined as one query and up to 100 documents.5 Under this regime, the cost is driven by the *number of interactions* rather than the length of the text. If a student interacts with the course bot 5,000 times (a plausible number for an active semester-long engagement), the cost hits the $10 mark regardless of whether the documents are short or long. Understanding this distinction is critical: token-based pricing punishes long documents (textbooks), while request-based pricing punishes frequent interactions (chatbots).

### **2.2 The Russian/English Linguistic Overhead**

The bilingual nature of the corpus exacerbates inefficiencies. Russian text, when tokenized by standard BPE (Byte Pair Encoding) tokenizers trained primarily on English data (like the standard BERT vocabulary), often splits into more sub-tokens per word compared to English. A typical Russian word might decompose into 3-4 tokens due to complex case endings and Cyrillic character mapping, effectively inflating the token count—and thus the cost—by 30-50% compared to an English-only equivalent pipeline.7

Furthermore, the "semantic drift" in Russian retrieval often forces developers to increase the retrieval window ($k$). Because dense vector models can struggle with precise keyword matching in morphologically rich languages (e.g., distinguishing "Bank" (financial) from "Bank" (river) or specific case inflections), engineers often retrieve 100 or 200 documents to ensure the correct answer is present, relying on the reranker to sort the mess. This defensive engineering strategy directly multiplies the reranking cost.

### **2.3 The Baseline Architecture Flaw**

The existing architecture likely follows a "Naive Reranking" pattern:

1. **Query:** Student asks a question.  
2. **Retrieval:** Qdrant performs a Dense Vector Search (HNSW) to retrieve the top 100 chunks.  
3. **Reranking:** All 100 chunks are sent to the Jina API.  
4. **Generation:** Top 5 chunks are sent to the LLM.

The economic inefficiency here is the "middle mile"—processing documents ranked 20 through 100\. In 80-90% of cases, the relevant information is already in the top 20, or clearly identifiable via metadata. Paying to semantic-check the 95th document for every query is a redundancy that high-volume pipelines cannot afford.

## ---

**3\. The Market Arbitrage: Exploiting Pricing Disparities in 2025**

The AI inference market in 2025 has matured into a commodity market, creating significant arbitrage opportunities. While the underlying transformer architectures (BERT, RoBERTa, Qwen) are similar, the pricing strategies of providers vary wildly. Transitioning from a legacy or premium provider to a cost-optimized endpoint is the single fastest lever to pull for immediate savings.

### **3.1 SiliconFlow and the Qwen-Reranker Disruption**

A major disruption in the 2025 reranking market is the aggressive pricing of SiliconFlow, specifically hosting the **Qwen-Reranker** series. The **Qwen3-Reranker-0.6B** model is priced at **$0.01 per 1 million tokens**.8 This represents a 50% immediate reduction compared to the Jina baseline (assumed at \~$0.02) and a staggering 99% reduction compared to request-based models like Cohere if processed efficiently.

The Qwen-Reranker is not merely a budget option; it is structurally superior for this specific use case. Built on the Qwen2.5/3 foundation, it possesses state-of-the-art multilingual capabilities, covering over 100 languages with specific strength in Russian and English.8 Its context window of 32k tokens allows it to ingest massive textbook chapters without the truncation issues that plague older 512-token BERT models.

### **3.2 Voyage AI: The "Lite" Alternative**

Voyage AI has introduced the **rerank-2.5-lite** model, priced at **$0.02 per 1 million tokens**.10 While parity in price with Jina, Voyage offers distinct advantages in "instruction following." Educational queries are often complex multi-part instructions (e.g., "Find the definition of photosynthesis but exclude examples from the lab manual"). Voyage’s architecture is specifically tuned to adhere to these retrieval instructions, potentially allowing for a reduction in the number of retrieved documents ($k$) because the model is more effective at identifying relevance with fewer candidates.11

Furthermore, Voyage explicitly benchmarks its models against Russian datasets (part of the MIRACL benchmark), claiming superior performance in handling hard negatives compared to Cohere and BGE.12 This suggests that fewer reranking passes might be needed to achieve the same educational outcome.

### **3.3 Cohere Rerank 3.5: The Premium Trap**

Cohere’s Rerank 3.5 is widely regarded as a performance leader, particularly in enterprise domains like finance and law. However, its pricing structure—$2.00 per 1,000 search units—is structurally maladapted for high-volume, low-latency educational chatbots.5  
A "search unit" allows for 100 documents. If your pipeline retrieves 100 documents, the price is effectively $0.002 per query. If a course generates 50,000 queries, the cost is $100. In contrast, a token-based model processing the same volume might cost $5. Unless the specific "search unit" model is perfectly utilized (always sending exactly 100 documents near the token limit), it introduces a massive "unused capacity" tax.

### **3.4 Pricing Landscape Comparison (2025)**

The following table synthesizes the pricing and capabilities of the leading providers relevant to the Russian/English educational use case.

| Provider | Model | Pricing Model | Unit Price | Russian Capability | Key Strength |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **SiliconFlow** | Qwen3-Reranker-0.6B | Token-based | **$0.01 / 1M tokens** | High (Qwen base) | **Lowest Cost**, Long Context (32k) |
| **Voyage AI** | rerank-2.5-lite | Token-based | $0.02 / 1M tokens | Very High | Instruction Following, Code Support |
| **Jina AI** | jina-reranker-v2 | Token-based | \~$0.02 / 1M tokens | High | Sliding Window, Current Baseline |
| **Mixedbread** | mxbai-rerank-base-v2 | Token-based | $0.15 / 1M tokens | High | Open Source Friendly, High Accuracy |
| **Cohere** | Rerank 3.5 | Request-based | $2.00 / 1k searches | High | Enterprise Stability, Proven Quality |

**Strategic Implication:** The immediate migration to SiliconFlow’s Qwen3-Reranker-0.6B or Voyage Lite offers a direct path to the 50% cost reduction floor requested. However, to reach the 80% target, architectural changes must accompany this vendor swap.

## ---

**4\. Architectural Optimization: The Qdrant Hybrid Fusion Strategy**

The most effective way to reduce reranking costs is to simply rerank less. By improving the precision of the first-stage retrieval (the candidates sent to the reranker), we can reduce the candidate set ($N$) from 100 to 20 without sacrificing recall. This "architectural compression" yields linear savings.

### **4.1 Hybrid Search with Reciprocal Rank Fusion (RRF)**

Relying solely on dense embeddings (vector search) for educational content is perilous. Dense vectors excel at semantic concepts but often fail at specific entity matching (e.g., "Equation 4.5" or "The Treaty of Brest-Litovsk"). To compensate, engineers bloat the retrieval set.

Qdrant’s native **Hybrid Search** capability combines dense vectors with sparse vectors (BM25 or SPLADE). Sparse vectors represent the document as a bag of weighted keywords, capturing exact terminological matches that dense vectors might smooth over.13

**The Optimization Protocol:**

1. **Dual Retrieval:** For every query, execute two parallel searches in Qdrant:  
   * *Dense Branch:* Retrieve top 50 documents using the embedding model (e.g., text-embedding-3-small or multilingual-e5).  
   * *Sparse Branch:* Retrieve top 50 documents using a sparse index (BM25/SPLADE) which is highly effective for Russian case-specific keywords.  
2. Fusion (RRF): Apply Reciprocal Rank Fusion to merge these two lists. RRF boosts documents that appear in both lists, acting as a high-confidence filter.

   $$Score(d) \= \\sum\_{rank \\in \\text{Dense, Sparse}} \\frac{1}{k \+ rank}$$  
3. **Truncation:** Instead of sending the union of all documents (potentially 100), select the **top 20** from the fused list.

**Impact:** Because the RRF list has far higher precision than either list alone, the likelihood of the "correct" answer being in the top 20 is statistically equivalent to it being in the top 100 of a pure dense search. This effectively **cuts the reranking volume by 80%** before the data even leaves the database.14

### **4.2 Leveraging Qdrant’s Recommendation API**

For adaptive learning platforms, user interaction data is a goldmine often ignored in retrieval. Qdrant’s recommend API allows for "positive" and "negative" examples to steer the search vector.

If a student has previously engaged with "Chapter 3: Linear Algebra" and asks a generic question about "Matrices," the system can use the vector of Chapter 3 as a positive bias. This moves the query vector in the latent space toward the relevant course section *before* retrieval.

* **Mechanism:** client.recommend(positive=\[doc\_id\_chapter3\], negative=\[doc\_id\_history\_course\]).  
* **Economic Value:** This acts as a "Zero-Cost Reranker." By spatially refining the search query, the retrieved candidates are of higher quality, further justifying the reduction of $k$ sent to the paid reranker API.16

### **4.3 Metadata Filtering (The "Hard" Filter)**

Educational content is highly structured (Course \-\> Module \-\> Lesson \-\> Transcript). Reranking documents from "Course B" when the student is asking about "Course A" is a waste of tokens. While obvious, strict metadata filtering in Qdrant ensures that the reranker *only* processes tokens that are strictly eligible for the answer.

* **Implementation:** Ensure every chunk in Qdrant has a payload: { "course\_id": "math101", "language": "ru" }.  
* **Query Time:** Apply a Filter clause to restrict the HNSW traversal to the specific course ID. This prevents "semantic bleed" where a similar concept from a different course contaminates the candidate list.17

## ---

**5\. The Sovereign Cloud: Self-Hosting for Infinite Scale**

To completely decouple cost from volume—achieving a theoretical 100% reduction in *marginal* cost—the pipeline must move from a "rented" API model to an "owned" infrastructure model. This is feasible because open-weight rerankers have reached parity with proprietary APIs.

### **5.1 The Hardware Economics of Self-Hosting**

The goal is to determine the crossover point where the fixed cost of a GPU instance is lower than the variable cost of the API.

* **Hardware Candidate:** The **NVIDIA T4 (16GB VRAM)** is the industry workhorse for inference. It is widely available on AWS (g4dn.xlarge) or specialized clouds (Lambda, RunPod) for approximately **$0.35 \- $0.50 per hour**.18  
* **Throughput:** A single T4 running a standard reranker (e.g., bge-reranker-v2-m3) can process roughly **30-50 queries per second** (assuming batches of 32 docs). This translates to millions of tokens per hour.19

**The Calculation:**

* **API Cost:** $10 per course. If you host 50 active courses, monthly spend is $500.  
* **Self-Hosted Cost:** One T4 instance running 24/7 costs \~$250/month (reserved).  
* **Crossover:** If the platform manages more than \~25 courses, self-hosting becomes mathematically superior. For a platform with hundreds of courses, the savings exceed 90%.

### **5.2 Model Selection: BGE-M3 vs. Qwen**

For self-hosting, model selection is critical. The model must fit in GPU memory and handle the Russian/English mix.

* **BAAI/bge-reranker-v2-m3:**  
  * **Architecture:** XLM-RoBERTa based.  
  * **Size:** \~560M parameters. Easily fits on a T4 (requires \<2GB VRAM in FP16).  
  * **Multilingualism:** Specifically trained on MIRACL and supports 100+ languages. It is the de facto standard for open-source multilingual reranking.3  
* **Mixedbread (mxbai-rerank-large-v1):**  
  * **Size:** 1.5B parameters. Fits on T4 but with lower throughput.  
  * **Performance:** Claims higher accuracy on code and technical domains, which may benefit computer science courses.22

**Recommendation:** Start with **BGE-M3**. Its lightweight nature allows for massive throughput, and its performance on RusBEIR is top-tier for its size class.

### **5.3 The Inference Stack: Text Embeddings Inference (TEI)**

Raw PyTorch inference is slow. To achieve the throughput required to beat API costs, one must use an optimized serving layer. Hugging Face’s **Text Embeddings Inference (TEI)** is a Rust-based optimized server specifically for BERT and Cross-Encoder models.23

* **Features:** TEI implements **Flash Attention v2**, **Token Streaming**, and **Dynamic Batching**.  
* **Quantization:** TEI supports on-the-fly quantization. Running BGE-M3 in **FP16** (half-precision) on a T4 doubles the throughput with negligible accuracy loss. Using **INT8** quantization (if supported by the specific model export) can further quadruple speed, though care must be taken with Russian morphology sensitivity.19

**Deployment Command (Docker):**

Bash

docker run \--gpus all \-p 8080:80 \\  
  \-v $PWD/data:/data \\  
  \--pull always ghcr.io/huggingface/text-embeddings-inference:latest \\  
  \--model-id BAAI/bge-reranker-v2-m3 \\  
  \--revision main \\  
  \--dtype float16

This single container replaces the entire Jina API dependency.

## ---

**6\. Two-Stage Reranking: The "CPU Gatekeeper"**

For environments where GPU availability is scarce or the budget is strictly zero for infrastructure, a "Two-Stage" architecture utilizing CPU resources can effectively filter noise.

### **6.1 The Logic of Pre-Reranking**

Instead of sending 100 documents to a GPU or Paid API, we insert a lightweight, CPU-optimized reranker as a "gatekeeper."

1. **Stage 1:** Qdrant retrieves 100 documents.  
2. **Stage 2 (CPU):** A quantized "Tiny" model (e.g., ms-marco-TinyBERT or a distilled bge-micro) reranks the 100 documents locally on the application server.  
3. **Stage 3 (Final):** The Top-10 documents from Stage 2 are sent to the high-quality model (Voyage/Jina) for the final sort.

### **6.2 FlashRank Implementation**

**FlashRank** is a Python library designed for this exact purpose. It wraps ONNX Runtime to execute quantized rerankers on consumer CPUs with sub-50ms latency.24

* **Russian Challenge:** Most default FlashRank models are English-only (ms-marco). To use this for Russian, one must explicitly load a multilingual model that has been exported to ONNX, such as jina-reranker-v1-tiny-en (which despite the name has some multilingual capacity) or a quantized version of bge-m3-small.  
* **Cost:** **Zero**. The compute runs on the existing web server sidecar.

**Evaluation:** While attractive, the complexity of managing ONNX exports for Russian capability often outweighs the benefit compared to simply using the Hybrid Search filter (Section 4.1). Hybrid Search (Sparse/Dense) is usually a better "free" filter than a low-quality CPU reranker. We recommend this strategy only if Hybrid Search is insufficient.

## ---

**7\. Deep Dive: The Russian Language Factor**

The optimization of cost must not degrade the learning experience. Russian presents specific retrieval challenges that standard English-optimized pipelines fail to address.

### **7.1 The Morphology Trap**

Russian is a fusional language. A query for "mathematics" (математика) must retrieve documents containing "mathematical" (математический), "mathematically" (математически), etc.

* **Bi-Encoder Failure:** Standard embeddings (like older OpenAI ada-002) often treat these as distinct tokens with weak associations.  
* **Cross-Encoder Success:** Rerankers like BGE-M3 and Qwen are trained on massive multilingual corpora where they learn these morphological connections deep in the attention layers. This is why removing the reranker entirely (and relying just on vector search) is not an option for this pipeline. The reranker is the "morphological normalizer".2

### **7.2 Benchmark Evidence (RusBEIR)**

The **RusBEIR** benchmark provides the ground truth for this analysis.

* **Leaderboard Leaders:** BGE-M3 and mE5-large consistently score highest on Russian retrieval tasks (NDCG@10) among models under 1 billion parameters.  
* **Voyage AI Claims:** Voyage explicitly cites performance gains on the MIRACL Russian dataset, positioning itself as a premium alternative to BGE.12  
* **ZeroEntropy:** This provider claims to beat Cohere and BGE by using "Instruction Tuning" to bridge the modality gap. For example, telling the model "This is a query in Russian about Physics, find English definitions" significantly boosts cross-lingual retrieval.25

**Conclusion:** If self-hosting, **BGE-M3** is the safe, proven choice for Russian. If using an API, **Voyage** is the verified premium option, while **SiliconFlow (Qwen)** is the cost leader with strong underlying multilingual architecture.

## ---

**8\. Implementation Roadmap**

The following phased approach provides a secure path to cost reduction, allowing for validation at each step.

### **Phase 1: Architectural Compression (Immediate, Zero Cost)**

* **Action:** Modify the Qdrant query logic. Replace simple Dense Search with **Hybrid Search (Dense \+ Sparse)**.  
* **Action:** Implement **Reciprocal Rank Fusion (RRF)** to merge results.  
* **Action:** Reduce the number of documents sent to Jina from 100 (estimated) to **20**.  
* **Expected Impact:** **80% Cost Reduction** immediately, as the paid API processes 1/5th the volume.  
* **Risk:** Minimal. RRF often improves accuracy.

### **Phase 2: Vendor Migration (Low Effort, High Return)**

* **Action:** Replace the Jina AI API endpoint with **SiliconFlow (Qwen3-Reranker-0.6B)**.  
* **Action:** Update the API key and endpoint URL in the RAG codebase.  
* **Expected Impact:** A further **50% reduction** in unit cost (from $0.02 to $0.01).  
* **Cumulative Savings:** Combined with Phase 1, the total cost drops from $10 to \~$1.00 (90% reduction).

### **Phase 3: Infrastructure Sovereignty (Scale Solution)**

* **Action:** Provision a GPU instance (T4) on a cloud provider.  
* **Action:** Deploy **Text Embeddings Inference (TEI)** with the BAAI/bge-reranker-v2-m3 model.  
* **Action:** Route all reranking traffic to this internal endpoint.  
* **Trigger:** Execute this phase only if the aggregate API fees exceed \~$300/month. Below this threshold, the operational overhead of managing servers outweighs the API savings.

## **9\. Conclusion**

The $10/course cost barrier is an artifact of utilizing a high-fidelity reranker on a loosely filtered candidate set. It is a problem of *selection*, not just pricing. By implementing **Qdrant Hybrid Search** to intelligently filter candidates before they reach the expensive cross-encoder stage, the platform can achieve the majority of the requested savings without changing models.

However, the commoditization of inference offers a second layer of optimization. Switching to **SiliconFlow’s Qwen-Reranker** or **Voyage Lite** provides a superior price-performance ratio for the specific Russian/English linguistic requirements of the platform. The recommended "Phase 2" state—Hybrid Search feeding a low-cost Qwen/Voyage endpoint—will reduce the per-course cost from **$10.00 to roughly $1.00**, surpassing the user's 80% reduction goal while likely improving retrieval accuracy through better filtering and modern model architectures.

#### **Источники**

1. we're releasing a new multilingual instruction-following reranker at ZeroEntropy\! \- Reddit, дата последнего обращения: декабря 6, 2025, [https://www.reddit.com/r/Rag/comments/1p2latf/were\_releasing\_a\_new\_multilingual/](https://www.reddit.com/r/Rag/comments/1p2latf/were_releasing_a_new_multilingual/)  
2. Building Russian Benchmark for Evaluation of Information Retrieval Models, дата последнего обращения: декабря 6, 2025, [https://dialogue-conf.org/wp-content/uploads/2025/04/KovalevGetal.046.pdf](https://dialogue-conf.org/wp-content/uploads/2025/04/KovalevGetal.046.pdf)  
3. Wikipedia-based Datasets in Russian Information Retrieval Benchmark RusBEIR \- arXiv, дата последнего обращения: декабря 6, 2025, [https://arxiv.org/html/2511.05079v1](https://arxiv.org/html/2511.05079v1)  
4. pricing\_table.md \- AgentOps-AI/tokencost \- GitHub, дата последнего обращения: декабря 6, 2025, [https://github.com/AgentOps-AI/tokencost/blob/main/pricing\_table.md](https://github.com/AgentOps-AI/tokencost/blob/main/pricing_table.md)  
5. Cohere AI pricing in 2025: A complete guide to real costs \- eesel AI, дата последнего обращения: декабря 6, 2025, [https://www.eesel.ai/blog/cohere-ai-pricing](https://www.eesel.ai/blog/cohere-ai-pricing)  
6. Cohere Pricing Explained \- A Deep Dive into Integration & Development Costs | MetaCTO, дата последнего обращения: декабря 6, 2025, [https://www.metacto.com/blogs/cohere-pricing-explained-a-deep-dive-into-integration-development-costs](https://www.metacto.com/blogs/cohere-pricing-explained-a-deep-dive-into-integration-development-costs)  
7. Building Russian Benchmark for Evaluation of Information Retrieval Models \- arXiv, дата последнего обращения: декабря 6, 2025, [https://arxiv.org/html/2504.12879v1](https://arxiv.org/html/2504.12879v1)  
8. Ultimate Guide \- Best Reranker for Multilingual Search in 2025 \- SiliconFlow, дата последнего обращения: декабря 6, 2025, [https://www.siliconflow.com/articles/en/Best-reranker-for-multilingual-search](https://www.siliconflow.com/articles/en/Best-reranker-for-multilingual-search)  
9. Qwen3-Reranker-0.6B \- Model Info, Parameters, Benchmarks \- SiliconFlow, дата последнего обращения: декабря 6, 2025, [https://www.siliconflow.com/models/qwen3-reranker-0-6b](https://www.siliconflow.com/models/qwen3-reranker-0-6b)  
10. Pricing \- Introduction \- Voyage AI, дата последнего обращения: декабря 6, 2025, [https://docs.voyageai.com/docs/pricing](https://docs.voyageai.com/docs/pricing)  
11. rerank-2.5 and rerank-2.5-lite: instruction-following rerankers \- Voyage AI, дата последнего обращения: декабря 6, 2025, [https://blog.voyageai.com/2025/08/11/rerank-2-5/](https://blog.voyageai.com/2025/08/11/rerank-2-5/)  
12. rerank-2 and rerank-2-lite: the next generation of Voyage multilingual rerankers \- Voyage AI, дата последнего обращения: декабря 6, 2025, [https://blog.voyageai.com/2024/09/30/rerank-2/](https://blog.voyageai.com/2024/09/30/rerank-2/)  
13. Hybrid Search and the Universal Query API \- Qdrant, дата последнего обращения: декабря 6, 2025, [https://qdrant.tech/course/essentials/day-3/hybrid-search/](https://qdrant.tech/course/essentials/day-3/hybrid-search/)  
14. Demo: Implementing a Hybrid Search System \- Qdrant, дата последнего обращения: декабря 6, 2025, [https://qdrant.tech/course/essentials/day-3/hybrid-search-demo/](https://qdrant.tech/course/essentials/day-3/hybrid-search-demo/)  
15. Hybrid Search Revamped \- Building with Qdrant's Query API, дата последнего обращения: декабря 6, 2025, [https://qdrant.tech/articles/hybrid-search/](https://qdrant.tech/articles/hybrid-search/)  
16. Deliver Better Recommendations with Qdrant's new API, дата последнего обращения: декабря 6, 2025, [https://qdrant.tech/articles/new-recommendation-api/](https://qdrant.tech/articles/new-recommendation-api/)  
17. Building Personalized Recommender Systems with Qdrant: A Comprehensive Guide | by Rayyan Shaikh | Medium, дата последнего обращения: декабря 6, 2025, [https://medium.com/@shaikhrayyan123/building-personalized-recommender-systems-with-qdrant-a-comprehensive-guide-caa366091dd6](https://medium.com/@shaikhrayyan123/building-personalized-recommender-systems-with-qdrant-a-comprehensive-guide-caa366091dd6)  
18. Best GPUs for LLM inference in 2025 \- WhiteFiber, дата последнего обращения: декабря 6, 2025, [https://www.whitefiber.com/compare/best-gpus-for-llm-inference-in-2025](https://www.whitefiber.com/compare/best-gpus-for-llm-inference-in-2025)  
19. Retrieval Inference for scale and performance \- Pinecone, дата последнего обращения: декабря 6, 2025, [https://www.pinecone.io/blog/optimizing-retrieval-inference/](https://www.pinecone.io/blog/optimizing-retrieval-inference/)  
20. \`bge-reranker-v2-m3\` model throughput benchmark · Issue \#1088 · FlagOpen/FlagEmbedding \- GitHub, дата последнего обращения: декабря 6, 2025, [https://github.com/FlagOpen/FlagEmbedding/issues/1088](https://github.com/FlagOpen/FlagEmbedding/issues/1088)  
21. BAAI/bge-reranker-v2-m3 \- Hugging Face, дата последнего обращения: декабря 6, 2025, [https://huggingface.co/BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)  
22. mxbai-rerank-large-v1 \- Mixedbread, дата последнего обращения: декабря 6, 2025, [https://www.mixedbread.com/docs/models/reranking/mxbai-rerank-large-v1](https://www.mixedbread.com/docs/models/reranking/mxbai-rerank-large-v1)  
23. text-embeddings-inference \- CodeSandbox, дата последнего обращения: декабря 6, 2025, [http://codesandbox.io/p/github/TouristShaun/text-embeddings-inference](http://codesandbox.io/p/github/TouristShaun/text-embeddings-inference)  
24. FlashRank reranker \- Docs by LangChain, дата последнего обращения: декабря 6, 2025, [https://docs.langchain.com/oss/python/integrations/retrievers/flashrank-reranker](https://docs.langchain.com/oss/python/integrations/retrievers/flashrank-reranker)  
25. Ultimate Guide to Choosing the Best Reranking Model in 2025 \- ZeroEntropy, дата последнего обращения: декабря 6, 2025, [https://www.zeroentropy.dev/articles/ultimate-guide-to-choosing-the-best-reranking-model-in-2025](https://www.zeroentropy.dev/articles/ultimate-guide-to-choosing-the-best-reranking-model-in-2025)