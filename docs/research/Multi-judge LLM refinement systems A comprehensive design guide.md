# Multi-judge LLM refinement systems: A comprehensive design guide

A multi-judge LLM content quality system with targeted self-refinement represents one of the more sophisticated patterns in modern LLM orchestration. The core challenge involves aggregating diverse evaluation perspectives, applying surgical corrections without document-wide side effects, and knowing precisely when to stop iterating. Research from **Self-Refine** (Madaan et al., 2023), **Constitutional AI** (Bai et al., 2022), and recent multi-agent consensus frameworks provides a solid foundation—showing that iterative refinement yields **~20% absolute improvement** on average, while ensemble evaluation reduces overoptimization by up to **70%** compared to single-judge systems.

## Aggregating recommendations from multiple LLM judges

The fundamental question when three judges provide different feedback—say "add more examples," "simplify language," and "improve transitions"—is whether to apply fixes sequentially, in parallel, or through fusion. Research strongly supports **generative fusion over selection**. The **LLM-Blender** framework (Jiang et al., ACL 2023) demonstrates a two-module approach: PairRanker performs pairwise comparison to rank candidate recommendations, while GenFuser merges top-K outputs by "capitalizing on their strengths and mitigating their weaknesses." This outperformed individual LLMs with an average rank of 3.2 versus 3.90 for the best single model.

For handling conflicting recommendations, the **Multi-Agent Debate Framework** (Hu et al., 2024) introduces adaptive stability detection using a Beta-Binomial mixture model to track consensus dynamics and Kolmogorov-Smirnov testing to identify when distributions stabilize. When judges genuinely contradict each other, the **CARE framework** (OpenReview 2024) uses probabilistic graphical models to separate "latent true quality from spurious factors," achieving **25.15% improvement** over majority voting. The key insight: simple majority voting fails with LLM judges due to shared biases—models from the same architecture family exhibit "familial clustering" and systematically agree on the same errors.

For prioritization, a weighted matrix approach works best:

| Agreement Level | Severity | Recommended Action |
|-----------------|----------|-------------------|
| 3/3 judges | Critical | Immediate fix, highest priority |
| 2/3 judges | High | Fix in current iteration |
| 1/3 judge | Medium | Queue for next iteration if time permits |
| Conflicting | Any | Trigger debate process or human review |

**Krippendorff's Alpha** emerges as the preferred inter-rater reliability metric for multi-judge systems because it handles any number of raters, works with ordinal data, and remains robust to missing values. Thresholds: α ≥ 0.800 indicates reliable agreement (accept aggregated result), 0.667-0.800 suggests tentative reliability (flag for review), and below 0.667 signals low reliability requiring reconciliation.

## Surgical refinement patterns that preserve document integrity

The challenge with LLM editing is preventing "context drift"—where the model improves one section while inadvertently altering unrelated content. **XML-based section isolation** provides the most robust solution. By marking regions with explicit tags like `<section id="2" status="edit">` and `<section id="3" status="preserve">`, boundaries prevent "different parts of the prompt from mixing or contaminating each other." The model receives only the target section plus minimal surrounding context, with programmatic reconstruction of the full document afterward.

**DELIteraTeR** (Grammarly, ACL 2022) advances this through span-level detection—a two-step pipeline that first detects exact spans requiring editing via token-level intent classification, then generates edits only for those fragments. This approach "consistently outperformed human editors when scored by human evaluators." The **PEER model** (Meta AI, 2022) structures this as Plan-Edit-Explain-Repeat, predicting discrete Levenshtein operations (insert, replace, delete, keep) rather than treating editing as sequence-to-sequence generation.

For implementation, the **Self-Refine** architecture (Madaan et al., NeurIPS 2023) establishes the canonical pattern:

```
y₀ = M(pgen ∥ x)                          # Initial generation
fb_t = M(pfb ∥ x ∥ y_t)                   # Generate actionable feedback
y_{t+1} = M(prefine ∥ x ∥ y₀ ∥ fb₀...y_t ∥ fb_t)  # Refine with history
```

The key innovation: feedback must be **actionable**, containing both localization of the problem and specific instructions to improve. History retention—appending previous outputs to the prompt—allows the system to learn from past iterations without weight updates. Performance improves by approximately **20% absolute** across diverse tasks with a maximum of 4 iterations.

Edit format choice matters significantly. The Aider project's extensive testing found that "simple editing formats work best"—JSON and complex structured formats actually decrease accuracy. A search/replace block format with fuzzy matching handles most cases effectively, while full rewrites remain appropriate only for short documents or major restructuring.

## Verifying fixes without breaking what already works

The "fix one, break another" problem represents a core challenge in iterative refinement. A **Quality Lock** mechanism prevents regression by establishing baselines for passing criteria:

```python
def check_regression(new_results, locked_scores, tolerance=0.05):
    regressions = []
    for criterion, locked_score in locked_scores.items():
        if new_results[criterion] < locked_score - tolerance:
            regressions.append({
                'criterion': criterion,
                'regression': locked_score - new_results[criterion]
            })
    return regressions
```

For verifying that specific recommendations were addressed, **semantic similarity** using sentence transformers (SBERT) combined with **Natural Language Inference** provides robust validation. The NLI approach frames verification as an entailment problem: the premise states what the recommendation requires, and the hypothesis describes the current content state. Entailment scores above **0.85** indicate high confidence the fix was applied; scores between 0.70-0.85 warrant human review; below 0.70 suggests the fix likely wasn't addressed.

Regarding re-evaluation strategy, **targeted re-evaluation outperforms full re-evaluation** when fixes are localized. Run only the judges whose criteria were affected by the fix, plus a random subset of "canary" judges (approximately 20%) for regression detection. Full re-evaluation triggers after multiple accumulated fixes or when edits span multiple document sections.

## Convergence detection and preventing infinite loops

Knowing when to stop iterating requires multiple complementary mechanisms. **Absolute improvement thresholds** (stop when score improvement falls below 0.02) and **relative thresholds** (stop when improvement drops below 5%) catch diminishing returns. A **windowed stagnation detector** examines the last 3-4 iterations—if score variance falls below 0.001, the system has plateaued.

**Oscillation detection** proves equally critical. When fixes alternate—improving criterion A while degrading B, then vice versa—the system enters a counterproductive loop. Autocorrelation analysis at lag 2 identifies periodic patterns: autocorrelation above 0.5 signals oscillation. State hashing detects when content cycles back to previous versions. The **IMPROVE framework** (Xue et al., 2025) establishes theoretical convergence guarantees with bounded iterations, showing component-wise updates with isolated evaluation enable stable convergence.

**Quality ceiling estimation** using exponential decay modeling helps determine when further iteration provides minimal benefit:

```
score(t) = ceiling - A × exp(-k × t)
```

Fitting this model to score history yields both the estimated maximum achievable quality and the number of iterations needed to reach 95% of remaining potential—enabling cost-aware early stopping when approaching the asymptote.

Hard limits remain essential backstops: **10 iterations maximum**, **300-second timeout**, and **50 LLM calls** provide absolute bounds. The termination hierarchy should evaluate conditions in this order: hard limits → target quality achieved → convergence detected → oscillation at acceptable quality → quality plateau.

## Cost-quality tradeoffs that determine system economics

The central economic question—when is regeneration cheaper than refinement?—depends on output length and error locality. For short outputs with fundamental errors, full regeneration costs `input_tokens + output_tokens` once. Iterative refinement costs `(input + output + feedback) × iterations`, typically 3× per round. The **MAGICORE framework** (Chen et al., 2024) addresses this through adaptive categorization: easy problems receive coarse-grained aggregation (cheaper), while hard problems merit fine-grained iterative multi-agent refinement. This outperforms uniform refinement at any given budget.

**Semantic caching** delivers substantial savings. GPTCache demonstrates **68.8% reduction in API calls** with cache hit rates of 61-69% and positive hit accuracy exceeding 97%. For multi-judge systems, implement multi-layer caching: exact content hash matching for identical queries, semantic similarity matching for near-duplicates, individual judge result caching, and aggregated feedback template caching.

**LLM cascading and routing** represents perhaps the highest-leverage optimization. The **RouteLLM** system achieves **85% cost reduction** on MT Bench versus GPT-4 alone by routing simple queries to cheaper models. The unified framework from ETH Zurich (ICLR 2025) shows that **cascade routing**—combining initial routing with re-routing until satisfactory—outperforms both pure routing and pure cascading. The optimal strategy: `s_opt(x) = argmax[q(m,x) - λ·c(m,x)]` where quality estimate minus cost determines model selection.

**Prompt compression** via LLMLingua achieves up to **20× compression** while maintaining semantic content, yielding approximately 4× net savings. The technique uses a small model to compute token perplexity, removing low-information tokens that contribute minimal entropy.

The economic evaluation framework from Zellinger & Thomson quantifies the tradeoff:

```
Reward = Expected_Accuracy × Value_of_Correct 
       - Cost_per_Query 
       - Error_Rate × Cost_of_Mistake
```

This reveals that reasoning models become economically optimal when **error costs exceed $0.20**—even if 100× more expensive to run—because the downstream cost of mistakes dominates raw API costs.

## Architectural synthesis for OSCQR-based educational content

For the specific system context described—three LLM judges evaluating educational content with OSCQR-based rubrics—the optimal architecture integrates these findings into a coherent pipeline:

**Evaluation phase**: Run all three judges in parallel on initial content. Calculate Krippendorff's Alpha per criterion. For α ≥ 0.80, accept aggregated scores; for 0.67 ≤ α < 0.80, apply weighted voting; for α < 0.67, trigger debate or human review.

**Aggregation phase**: Cluster semantically similar recommendations using SBERT embeddings. Fuse complementary recommendations through an aggregator prompt. Prioritize by the formula `severity × criterion_weight × agreement_level`. Apply conflict resolution via the CARE framework's probabilistic model.

**Refinement phase**: Use XML-tagged section isolation with explicit edit boundaries. Apply the Self-Refine feedback→refine loop with 2-3 maximum iterations per recommendation batch. Verify fixes via semantic similarity (threshold 0.70) and NLI entailment (threshold 0.85). Lock passing criteria with 5% regression tolerance.

**Termination phase**: Stop when composite score reaches target (0.90) or "good enough" threshold (0.85). Detect convergence when improvement falls below 2% absolute or 5% relative. Identify oscillation via autocorrelation analysis. Enforce hard limits of 10 iterations and 300 seconds.

**Cost optimization**: Implement semantic caching with content hashing. Route initial evaluation through a cheaper model for complexity assessment. Use full judge panel only when initial assessment indicates medium-high complexity. Batch similar fixes for single refinement passes. Compress prompts for long documents using LLMLingua principles.

## Conclusion

The research literature provides strong foundations for multi-judge LLM refinement systems. The **Self-Refine** pattern establishes that iterative refinement with actionable feedback delivers consistent quality improvements without requiring additional training. **Ensemble evaluation** through multiple judges mitigates individual model biases, with the CARE framework showing 25% improvement over naive aggregation. **Surgical editing** through XML boundaries and span-level detection prevents the context drift that undermines iterative approaches.

The key architectural insight: adaptive systems that categorize content complexity before committing to expensive multi-judge evaluation consistently outperform uniform approaches. By implementing tiered evaluation, semantic caching, and cascade routing, systems can achieve 60-85% cost reduction while maintaining quality. The remaining design choices—regression tolerance thresholds, convergence criteria, oscillation detection sensitivity—should be calibrated empirically against a held-out validation set of educational content, with the specific values above serving as reasonable starting points for OSCQR-based evaluation.