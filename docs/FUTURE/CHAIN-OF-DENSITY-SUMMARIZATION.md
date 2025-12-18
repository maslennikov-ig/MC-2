# Chain-of-Density Summarization - Premium Quality Enhancement

**Status**: FUTURE (Post-MVP)
**Priority**: P3 (Quality Enhancement)
**Estimated Effort**: 1-2 weeks
**Dependencies**: Stage 3 MVP complete

---

## Overview

Chain-of-Density (CoD) is an advanced summarization technique that iteratively increases information density while maintaining readability. This enhancement would provide premium-quality summaries for critical educational content when standard hierarchical summarization is insufficient.

**Research Validation**:
- Academic paper: EMNLP 2023 - "From Sparse to Dense: GPT-4 Summarization with Chain of Density Prompting"
- Quality improvement: +20% semantic fidelity (0.82-0.90 vs 0.75-0.82 baseline)
- Human preference: 87% prefer CoD summaries over baseline
- Trade-off: 5x cost (5 LLM calls vs 1)

---

## How Chain-of-Density Works

### Standard Summarization (Current MVP)
```
Document (100K tokens) → Single LLM call → Summary (5K tokens)
Quality: 0.75-0.82 | Cost: $0.001 | Iterations: 1
```

### Chain-of-Density Enhancement
```
Document (100K tokens)
  → Iteration 1: Initial summary (5K tokens, sparse)
  → Iteration 2: Add 1-3 key entities (5K tokens, denser)
  → Iteration 3: Add 1-3 more entities (5K tokens, denser)
  → Iteration 4: Add 1-3 more entities (5K tokens, dense)
  → Iteration 5: Final polish (5K tokens, optimal density)

Quality: 0.82-0.90 | Cost: $0.005 (5x) | Iterations: 5
```

**Key Feature**: Each iteration maintains same length but adds missing salient entities, creating progressively denser summaries without verbosity.

---

## Use Cases

### When to Use CoD (Premium Quality Tier)

1. **Critical Educational Content**
   - Final course materials for publication
   - Accreditation/certification content (legal requirements)
   - Medical/legal educational content (high accuracy needed)
   - User explicitly selects "Premium Quality" summarization

2. **Failed Quality Gates**
   - When standard summarization scores <0.75 semantic similarity
   - After hybrid escalation retry still fails to reach threshold
   - As final fallback before marking FAILED_QUALITY_CRITICAL

3. **Admin-Configured Premium Tier**
   - Organizations with PREMIUM billing tier (future)
   - Per-document quality override in admin panel
   - Batch processing for curated content library

### When NOT to Use CoD (Keep Standard)

- Draft/interim course processing (80% of use cases)
- Small documents <10 pages (standard already sufficient)
- Tight latency requirements (<30s SLA)
- Cost-sensitive organizations (TRIAL/STANDARD tiers)

---

## Implementation Plan

### Phase 1: Core CoD Logic

**Task**: Implement CoD iteration engine

**File**: `packages/course-gen-platform/src/orchestrator/strategies/chain-of-density.ts`

```typescript
interface ChainOfDensityConfig {
  iterations: number; // Default: 5
  targetLength: number; // Keep constant (e.g., 5000 tokens)
  entitiesPerIteration: number; // Default: 1-3
  basePrompt: string;
}

async function chainOfDensity(
  originalText: string,
  model: string,
  config: ChainOfDensityConfig
): Promise<{ summary: string; metadata: CoDMetadata }> {

  let currentSummary = '';
  const iterations: IterationResult[] = [];

  for (let i = 1; i <= config.iterations; i++) {
    const prompt = buildCoDPrompt({
      originalText,
      previousSummary: currentSummary,
      iteration: i,
      targetLength: config.targetLength,
      entitiesPerIteration: config.entitiesPerIteration
    });

    const result = await llmClient.generateSummary({
      text: prompt,
      model,
      maxTokens: config.targetLength,
      temperature: 0.3 // Lower temp for factual content
    });

    currentSummary = result.summary;

    iterations.push({
      iteration: i,
      summary: currentSummary,
      addedEntities: extractNewEntities(currentSummary, iterations[i-2]?.summary),
      densityScore: calculateDensity(currentSummary),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    });
  }

  return {
    summary: currentSummary,
    metadata: {
      iterations: iterations.length,
      totalCost: calculateTotalCost(iterations),
      densityProgression: iterations.map(i => i.densityScore),
      finalDensity: iterations[iterations.length - 1].densityScore
    }
  };
}

function buildCoDPrompt(params: CoDPromptParams): string {
  if (params.iteration === 1) {
    // Iteration 1: Create sparse initial summary
    return `Summarize the following document in approximately ${params.targetLength} tokens. Focus on main topics and key points. This is a sparse summary - do not try to include every detail.

Document:
${params.originalText}

Sparse Summary:`;
  } else {
    // Iterations 2-5: Add missing entities while keeping same length
    return `You are refining a summary. Your goal is to add ${params.entitiesPerIteration} missing but important entities from the original document while keeping the summary length at ${params.targetLength} tokens.

Original Document:
${params.originalText}

Current Summary (Iteration ${params.iteration - 1}):
${params.previousSummary}

Instructions:
1. Identify ${params.entitiesPerIteration} important entities (concepts, terms, facts) missing from the current summary
2. Rewrite the summary to incorporate these entities
3. Maintain the same length (~${params.targetLength} tokens)
4. Remove less important details if needed to make room
5. Preserve coherence and readability

Refined Summary (Iteration ${params.iteration}):`;
  }
}
```

**Estimated Effort**: 2-3 days

---

### Phase 2: Admin Panel Integration

**Task**: Add CoD toggle to admin configuration

**File**: `packages/course-gen-platform/src/components/admin/LLMConfig.tsx`

```typescript
// Add to Supabase llm_config table
interface LLMConfig {
  // ... existing fields

  // CoD settings
  enable_chain_of_density: boolean;
  cod_iterations: number; // Default: 5
  cod_trigger_mode: 'manual' | 'auto_quality_fallback' | 'premium_tier';
  cod_quality_threshold: number; // Default: 0.75 (trigger CoD if below)
  cod_max_cost_multiplier: number; // Default: 5 (allow 5x cost)
}

// Admin UI
<Toggle
  label="Enable Chain-of-Density (Premium Quality)"
  description="5x cost, +20% quality. Use for critical content only."
  checked={config.enable_chain_of_density}
  onChange={handleToggleCoD}
/>

<Select
  label="CoD Trigger Mode"
  options={[
    { value: 'manual', label: 'Manual only (admin panel per-document)' },
    { value: 'auto_quality_fallback', label: 'Auto-trigger if quality <0.75' },
    { value: 'premium_tier', label: 'Always use for PREMIUM tier orgs' }
  ]}
/>
```

**Estimated Effort**: 1-2 days

---

### Phase 3: Quality Gate Integration

**Task**: Integrate CoD into hybrid escalation retry

**File**: `packages/course-gen-platform/src/orchestrator/services/summarization-service.ts`

```typescript
async function generateSummaryWithQualityGate(
  params: SummarizationJobData
): Promise<SummarizationResult> {

  // Step 1: Standard hierarchical summarization
  let result = await hierarchicalSummarization(params);

  // Step 2: Quality validation
  const qualityCheck = await validateSummaryQuality(
    params.extracted_text,
    result.processed_content,
    params.quality_threshold || 0.75
  );

  // Step 3: Hybrid escalation retry (existing)
  if (!qualityCheck.quality_check_passed) {
    // Retry #1: Switch strategy
    // Retry #2: Upgrade model (GPT OSS 20B → 120B)
    // Retry #3: Increase output tokens

    // NEW: Retry #4 (FINAL): Chain-of-Density
    if (retryAttempt === 4 && config.enable_chain_of_density) {
      logger.info('Final retry: Using Chain-of-Density', {
        fileId: params.file_id,
        previousQuality: qualityCheck.quality_score
      });

      result = await chainOfDensity(
        params.extracted_text,
        config.model_fallback, // Use best model
        {
          iterations: config.cod_iterations || 5,
          targetLength: params.max_output_tokens || 10000,
          entitiesPerIteration: 2
        }
      );

      // Validate CoD quality
      const codQualityCheck = await validateSummaryQuality(
        params.extracted_text,
        result.processed_content,
        params.quality_threshold || 0.75
      );

      if (!codQualityCheck.quality_check_passed) {
        // Even CoD failed - mark FAILED_QUALITY_CRITICAL
        throw new Error('FAILED_QUALITY_CRITICAL: CoD retry exhausted');
      }
    }
  }

  return result;
}
```

**Estimated Effort**: 2-3 days

---

### Phase 4: Cost & Performance Monitoring

**Task**: Track CoD usage and ROI

**Analytics**:
```sql
-- CoD usage analytics
SELECT
  organization_id,
  COUNT(*) FILTER (WHERE processing_method = 'chain_of_density') as cod_documents,
  COUNT(*) as total_documents,
  AVG((summary_metadata->>'quality_score')::numeric) FILTER (WHERE processing_method = 'chain_of_density') as cod_avg_quality,
  AVG((summary_metadata->>'quality_score')::numeric) FILTER (WHERE processing_method = 'hierarchical') as standard_avg_quality,
  SUM((summary_metadata->>'estimated_cost_usd')::numeric) FILTER (WHERE processing_method = 'chain_of_density') as cod_total_cost,
  SUM((summary_metadata->>'estimated_cost_usd')::numeric) as total_cost
FROM file_catalog
WHERE summary_metadata IS NOT NULL
GROUP BY organization_id;
```

**Cost Alert**:
- If CoD usage >10% of monthly docs → Alert admin (potential cost spike)
- If CoD avg quality <0.80 → Alert (not providing expected benefit)

**Estimated Effort**: 1 day

---

## Expected Outcomes

### Quality Improvements

| Metric | Standard (Hierarchical) | Chain-of-Density | Improvement |
|--------|------------------------|------------------|-------------|
| Semantic Similarity | 0.75-0.82 | 0.82-0.90 | +10-15% |
| Entity Coverage | 70-80% | 85-95% | +15-20% |
| Factual Consistency | 80-85% | 90-95% | +10-12% |
| Human Preference | Baseline | 87% prefer CoD | +87% |

### Cost Trade-offs

**Standard Summarization** (current MVP):
- 5,000 docs/month with GPT OSS 20B: **$7/month**
- Quality: 0.75-0.82

**With 10% CoD Usage** (500 premium docs):
- 4,500 standard (GPT OSS 20B): $6.30/month
- 500 CoD (GPT OSS 120B × 5 iterations): **$31.25/month**
- **Total**: $37.55/month (5.4x increase, but still 92.5% cheaper than GPT-4)
- Quality for premium docs: 0.82-0.90

**ROI Justification**:
- Use CoD only for critical 5-10% of content
- Avoid quality failures requiring manual intervention
- Reduce customer support burden ("summary missing key information")

---

## Alternatives Considered

### 1. Extractive Pre-Processing
- **Pros**: +10-15% quality, no 5x cost multiplier
- **Cons**: Requires TextRank/LexRank implementation, loses nuanced content
- **Decision**: Defer to separate future enhancement (less risky)

### 2. Late Chunking with Qdrant
- **Pros**: Best quality (0.80-0.88), preserves citations
- **Cons**: Requires Qdrant infrastructure, complex to implement
- **Decision**: Overkill for Stage 3, consider for Stage 5 (content generation with retrieval)

### 3. Multi-Model Consensus
- **Pros**: Combines strengths of different models
- **Cons**: 3-5x cost (multiple models per doc), complex voting logic
- **Decision**: Too experimental, stick with proven CoD approach

---

## Implementation Checklist

- [ ] **Phase 1**: Core CoD logic (2-3 days)
  - [ ] Implement `chain-of-density.ts` strategy
  - [ ] Build CoD prompt templates
  - [ ] Add entity extraction logic
  - [ ] Write unit tests

- [ ] **Phase 2**: Admin panel (1-2 days)
  - [ ] Add `enable_chain_of_density` to llm_config table
  - [ ] Build admin UI toggle
  - [ ] Add per-document override in UI

- [ ] **Phase 3**: Quality gate integration (2-3 days)
  - [ ] Integrate CoD as final retry (#4)
  - [ ] Update hybrid escalation logic
  - [ ] Add CoD metadata tracking

- [ ] **Phase 4**: Monitoring (1 day)
  - [ ] Add CoD analytics endpoint
  - [ ] Create cost alert thresholds
  - [ ] Document best practices

- [ ] **Testing**: Integration tests (1 day)
  - [ ] Test CoD with 10-document sample
  - [ ] Validate 5x cost vs quality improvement
  - [ ] Measure latency (5 iterations)

**Total Estimated Effort**: 7-10 days (1-2 weeks)

---

## Success Metrics

### Must-Have (Gate 1)
- ✅ CoD achieves >0.80 semantic similarity on test set (10% improvement)
- ✅ Cost multiplier ≤5x (manage budget)
- ✅ Admin can enable/disable per organization

### Nice-to-Have (Gate 2)
- ⚡ Latency <2 minutes for 100-page doc (5 iterations)
- 📊 Analytics dashboard shows CoD ROI (cost vs quality gains)
- 🎛️ Per-document manual override in admin panel

### Long-Term (Post-Launch)
- 🔄 Automatic A/B testing (CoD vs standard, measure user satisfaction)
- 💰 Dynamic pricing tier (charge premium for CoD usage)
- 🤖 ML model to predict when CoD is needed (avoid blanket 5x cost)

---

## References

- **Academic Paper**: Griffin Adams et al. (2023). "From Sparse to Dense: GPT-4 Summarization with Chain of Density Prompting". EMNLP 2023.
  - Link: https://arxiv.org/abs/2309.04269

- **Research Validation**: `/home/me/code/megacampus2/specs/005-stage-3-create/research/State-of-the-Art Document Summarization for Educational.md`
  - Section: "Chain-of-Density Prompting"
  - Finding: 20% quality improvement, 87% human preference

- **Implementation Example**: OpenAI Cookbook - Chain-of-Density Summarization
  - Demonstrates 5-iteration pattern with entity tracking

---

## Conclusion

Chain-of-Density is a proven technique for premium-quality summarization with clear ROI for critical educational content. Defer to post-MVP (after Stage 3 complete) to avoid scope creep, but implement when organizations demand higher quality for final course materials.

**Recommendation**: Add to backlog as P3 enhancement, revisit after 3 months of MVP data shows quality issues with standard approach.
