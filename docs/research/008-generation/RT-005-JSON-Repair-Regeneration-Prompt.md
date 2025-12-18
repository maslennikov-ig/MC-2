# RT-005: JSON Repair & Regeneration Strategies - Research Prompt

**Research Task**: RT-005 JSON Repair, Self-Healing, and Regeneration Optimization
**Status**: 🔄 PENDING RESEARCH
**Priority**: HIGH - Blocks efficient T015 (json-repair.ts) implementation
**Date Created**: 2025-11-07

---

## Research Objective

**Determine optimal JSON repair and regeneration strategies for LLM-generated course structure JSON**, balancing cost-effectiveness (token savings), success rates, and implementation complexity. Research should provide production-ready decision criteria for when to repair vs regenerate, which repair techniques to use, and how to integrate with existing retry logic (RT-004).

---

## Current Knowledge (Pre-Research)

### What We Have (Documented Strategies)

**From plan.md/research.md (n8n proof-of-concept)**:
```typescript
// 4-Level JSON Repair Strategy (Current)
1. Brace counting (balance { } brackets)
2. Quote fixing (fix unescaped quotes in strings)
3. Trailing comma removal (remove commas before } and ])
4. Comment stripping (remove // and /* */ comments)

// Success Rate: 85%+ recovery (proven in n8n implementation)
// Cost: Near-zero (deterministic string manipulation)
```

**From RT-004 (Quality Validation Research)**:
```typescript
// Self-Healing Techniques (Production Systems)
Level 1: FSM-based repair (95% success, 0.1x cost)
Level 2: LLM-based semantic repair (80% success, 0.5x cost for context >1K tokens)
Level 3: Full regeneration (100% fresh, 1.0x cost)

// Break-even: Repair justified when (success_rate >50%) AND (token_savings >30%)
```

**Current Retry Strategy** (research.md):
```typescript
// 2-Attempt Progressive Prompt Strictness
Attempt 1: Standard prompt with examples
Attempt 2: Minimal valid JSON with strict schema rules
Exponential backoff: delay = 1000ms * attempt
```

**Field Name Auto-Fix** (research.md):
```typescript
// Recursive camelCase → snake_case transformation
// Maps: courseTitle → course_title, lessonObjectives → lesson_objectives
// Cost: Zero (post-processing)
```

### Gap Analysis

**What's Missing**:
1. **FSM repair implementation details**: Which library? (json-repair npm package?) Custom implementation?
2. **LLM repair prompt patterns**: How to structure validation error feedback for best repair success?
3. **Cost-benefit thresholds**: Exact token count breakpoints (1K? 2K? 5K?) for repair vs regenerate
4. **Schema violation types**: Which errors are repairable (missing fields, type mismatches, constraint violations)?
5. **Integration with RT-004 retry logic**: When does repair fit into 10-attempt escalation sequence?
6. **Multi-language considerations**: Does repair work equally well for EN/RU/DE/ES JSON?

**Questions**:
1. Should we use FSM-based repair (json-repair library) as Level 1, BEFORE 4-level cascade?
2. When should LLM repair be invoked? (After FSM fails? Only for schema violations?)
3. Should regeneration use stricter prompts (RT-004 attempts 6-7) or model escalation (attempts 8-10)?
4. What's the optimal sequence: FSM → 4-level → LLM repair → regenerate OR FSM → LLM repair → regenerate?

---

## Research Scope & Questions

### Primary Research Questions

#### Q1: Repair Techniques - Effectiveness & Cost

**Investigate**:
1. **FSM-based repair libraries**:
   - json-repair (npm): Success rates, edge cases, performance
   - Alternative libraries: jsonrepair, json5, hjson
   - Custom FSM implementation: Worth the effort vs library?

2. **4-level cascade (current strategy)**:
   - Validate 85%+ success rate claim with production data
   - Which level resolves most errors? (brace counting > quote fixing > trailing commas?)
   - Can we optimize by reordering levels?

3. **LLM-based semantic repair**:
   - Prompt patterns for repair (direct error feedback, schema-guided, progressive validation)
   - Success rates by error type: missing fields (80%?), type mismatches (70%?), constraint violations (60%?)
   - Token economics: 31% savings validated? Context size thresholds (1K? 2K?)?

4. **Hybrid approaches**:
   - FSM + 4-level cascade: Complementary or redundant?
   - FSM + LLM repair: Skip 4-level cascade entirely?
   - 4-level + LLM repair: Current stack + semantic layer?

**Deliverable**: Ranked repair techniques table with success rates, cost multipliers, use cases

---

#### Q2: Regeneration Strategies - When & How

**Investigate**:
1. **Regeneration triggers**:
   - After how many repair attempts? (1? 2? 3?)
   - Schema violations only, or all parse errors?
   - Quality thresholds: semantic similarity <0.75 → regenerate?

2. **Progressive prompt strictness** (RT-004 attempts 6-7):
   - Effectiveness of stricter prompts: "Output ONLY JSON" vs "Generate sections"?
   - Examples in prompts: Increase success by how much? (10%? 20%?)
   - Chain-of-thought prompts: "Step 1: List topics. Step 2: Generate JSON" - worth the extra tokens?

3. **Model escalation** (RT-004 attempts 8-10):
   - When to escalate: After repair fails? After 2 regeneration attempts?
   - OSS 120B vs qwen3-max for regeneration: Cost-benefit for JSON generation?
   - Gemini for overflow: Does 1M context help with complex JSON generation?

4. **Regeneration vs repair cost comparison**:
   - Small contexts (<1K tokens): Always regenerate (cheaper)?
   - Large contexts (>2K tokens): Always repair first (31% savings)?
   - Medium contexts (1-2K tokens): Decision criteria?

**Deliverable**: Decision tree for repair vs regenerate with exact token thresholds

---

#### Q3: Error Classification - Repairability Matrix

**Investigate**:
1. **Parse errors** (JSON syntax):
   - Missing brackets/braces: FSM repair (95% success)?
   - Unescaped quotes: 4-level cascade (90% success)?
   - Trailing commas: Deterministic fix (100% success)?
   - Comments in JSON: Stripping effective (100% success)?
   - **Repairability**: HIGH (95%+ success with FSM/cascade)

2. **Schema violations** (Zod validation errors):
   - Missing required fields: LLM repair (80% success?) or regenerate?
   - Type mismatches (string vs number): LLM repair (70%?) or regenerate?
   - Constraint violations (min/max, regex): LLM repair (60%?) or regenerate?
   - Nested object errors: LLM repair (50%?) or regenerate?
   - **Repairability**: MEDIUM (50-80% success with LLM repair)

3. **Field naming errors** (camelCase vs snake_case):
   - Simple mapping: fixFieldNames() (100% success, zero cost)
   - Inconsistent naming: Partial fix + LLM repair?
   - **Repairability**: HIGH (95%+ success with auto-fix)

4. **Semantic quality errors** (content doesn't match requirements):
   - Low similarity to learning outcomes: Regenerate (repair won't help)
   - Incomplete content: LLM repair (40%?) or regenerate?
   - Reasoning errors: Regenerate with improved prompt
   - **Repairability**: LOW (20-40% success, regeneration better)

**Deliverable**: Repairability matrix (error type → repair technique → success rate → cost)

---

#### Q4: Integration with RT-004 Retry Logic

**Investigate**:
1. **Repair in retry sequence**:
   - Where does repair fit in 10-attempt escalation?
   - Option A: Repair after every failed generation (attempts 1-10)
   - Option B: Repair only on attempts 1-3 (network retry), then regenerate
   - Option C: Repair on parse errors, regenerate on quality errors

2. **Optimal escalation sequence**:
   ```
   Current RT-004:
   Attempts 1-3: Network retry (same params)
   Attempts 4-5: Temperature reduction (1.0 → 0.3)
   Attempts 6-7: Prompt enhancement (constraints, examples)
   Attempts 8-10: Model escalation (OSS 120B → qwen3-max)

   With Repair Integration:
   Attempt 1: Generate → FSM repair → 4-level cascade → Validate
   Attempt 2: Generate (same params) → FSM repair → 4-level cascade → Validate
   Attempt 3: Generate (same params) → FSM + LLM repair → Validate
   Attempt 4: Generate (temp 0.7) → Repair cascade → Validate
   Attempt 5: Generate (temp 0.3) → Repair cascade → Validate
   Attempt 6: Generate (stricter prompt) → Repair cascade → Validate
   Attempt 7: Generate (with examples) → Repair cascade → Validate
   Attempt 8: Generate (OSS 120B) → Repair cascade → Validate
   Attempt 9: Generate (qwen3-max) → Repair cascade → Validate
   Attempt 10: Generate (qwen3-max, temp 0.1) → Minimal repair → Fail if still invalid
   ```

3. **Cost optimization**:
   - Total cost with aggressive repair: 0.1x-0.7x per attempt
   - Total cost with regeneration only: 1.0x per attempt
   - Break-even point: How many repair attempts before regeneration cheaper?

4. **Success rate optimization**:
   - RT-004 target: 90-95% success rate after retries
   - With repair: Can we achieve same with fewer attempts (cost savings)?
   - Without repair: Do we need more attempts (cost increase)?

**Deliverable**: Integrated retry sequence with repair hooks + cost-benefit analysis

---

#### Q5: Production Implementation - Libraries & Patterns

**Investigate**:
1. **JSON repair libraries** (npm ecosystem):
   - **json-repair**: 1M+ downloads, FSM-based, handles most syntax errors
   - **jsonrepair**: Alternative FSM implementation
   - **json5**: Superset of JSON, handles trailing commas, comments
   - **hjson**: Human-friendly JSON, handles unquoted keys
   - **Recommendation**: Which library for production?

2. **LLM repair prompt patterns** (from Instructor, Guardrails, LangChain):
   - **Direct error feedback**: "Your output failed with: {error}. Fix it."
   - **Schema-guided repair**: "Output must conform to: {schema}. Your error: {details}. Regenerate."
   - **Progressive validation**: "Iteration {N}: Fixed {previous}, remaining: {current}. Focus on remaining."
   - **Constitutional repair**: "Your response violates: {principle}. Critique, then revise."
   - **Recommendation**: Which pattern for highest success rate?

3. **Integration with Pydantic/Zod**:
   - Pydantic: Automatic retries with error messages (Instructor pattern)
   - Zod: Manual error handling with .parse() try-catch
   - **Recommendation**: Best integration pattern for TypeScript + Zod?

4. **Monitoring & metrics**:
   - Track repair success rate by error type
   - Track token savings from repair vs regeneration
   - Track total cost per course (baseline vs optimized)
   - Alert thresholds: Repair success <70% → investigate

**Deliverable**: Production-ready implementation guide with library recommendations

---

### Secondary Research Questions

#### Q6: Multi-Language JSON Repair

**Investigate**:
- Do repair techniques work equally for EN/RU/DE/ES JSON?
- Are LLM repair prompts language-agnostic or need translation?
- Field name mapping: language-specific patterns (Russian camelCase conventions)?

#### Q7: Token Budget Impact

**Investigate**:
- RT-003 defines INPUT_BUDGET_MAX = 90K tokens
- Repair adds: error message (100 tokens) + repair prompt (50 tokens) + delta output (100 tokens) = +250 tokens
- Impact on per-batch budget: 250/90,000 = 0.28% overhead (negligible)
- **Validation**: Repair fits within token budget without triggering Gemini fallback

#### Q8: Edge Cases & Failure Modes

**Investigate**:
- Very large JSON (>10K tokens): Repair becomes expensive, regeneration better?
- Deeply nested structures: Repair may corrupt sibling fields?
- Multiple concurrent errors: Repair one, break another (cascading failures)?
- Malicious input: Can repair accidentally introduce security issues (XSS)?

---

## Research Methodology

### Data Sources

1. **Industry Production Systems**:
   - Instructor library (Pydantic auto-retries): success rates, patterns
   - Guardrails AI (OnFailAction: FIX): repair implementation
   - LangChain (RetryWithErrorOutputParser): repair patterns
   - OpenAI structured outputs: error handling

2. **Academic Research**:
   - "Self-Refine: Iterative Refinement with Self-Feedback" (2023)
   - "Reflexion: Language Agents with Verbal Reinforcement Learning" (2023)
   - "Constitutional AI: Critiques and Revisions" (Anthropic, 2022)
   - Papers on LLM self-correction and repair

3. **npm Package Analysis**:
   - json-repair: GitHub issues, success rate claims, edge cases
   - jsonrepair, json5, hjson: Comparison benchmarks
   - Production usage stats (downloads, stars, issues)

4. **Our Existing Data**:
   - n8n proof-of-concept: 4-level cascade success rate (85%+)
   - RT-004 research: Self-healing success rates (62-89% with feedback)
   - Stage 4 Analyze: JSON generation patterns, common errors

### Analysis Framework

**For Each Repair Technique**:
1. **Success Rate**: % of errors successfully repaired
2. **Cost Multiplier**: Token cost vs full regeneration (0.1x - 1.0x)
3. **Latency**: Time to repair vs regenerate
4. **Complexity**: Implementation difficulty (simple string ops vs LLM calls)
5. **Edge Cases**: Known failure modes
6. **Production Readiness**: Library stability, community support

**Decision Criteria Matrix**:
```
Error Type × Context Size × Success Rate × Cost → Repair or Regenerate?

Example:
Parse error (missing bracket) × Any size × 95% × 0.1x → ALWAYS repair (FSM)
Schema violation (missing field) × >2K tokens × 80% × 0.5x → Repair first (LLM)
Schema violation (missing field) × <1K tokens × 80% × 1.2x → Regenerate (cheaper)
Semantic quality error × Any size × 20% × 2.0x → ALWAYS regenerate (repair fails)
```

---

## Expected Deliverables

### 1. Decision Document: `rt-005-json-repair-regeneration.md`

**Structure**:
```markdown
# RT-005: JSON Repair & Regeneration Strategy - FINAL DECISION

## Executive Summary
- Approved strategy: [FSM + 4-level + LLM repair + regeneration]
- Cost impact: [token savings, total cost per course]
- Success rate: [% of courses generated without manual intervention]

## Repair Techniques (Ranked)
1. FSM-based repair (95% success, 0.1x cost) - Level 1
2. 4-level cascade (85% success, 0.0x cost) - Level 2
3. Field name auto-fix (100% success, 0.0x cost) - Level 3
4. LLM semantic repair (80% success, 0.5x cost) - Level 4
5. Full regeneration (100% fresh, 1.0x cost) - Level 5

## Decision Tree
[Flowchart: Parse error → FSM → 4-level → Validate → Pass/Fail]
[Flowchart: Schema error → Check context → >2K: LLM repair / <2K: Regenerate]

## Integration with RT-004 Retry Logic
[10-attempt sequence with repair hooks at each stage]

## Implementation Guide
- Library: json-repair (npm)
- LLM repair prompt: [validated pattern]
- Code examples: TypeScript/Zod integration
- Monitoring metrics: repair success rate, token savings

## Cost-Benefit Analysis
- Baseline (no repair): $0.38-0.51 per course (RT-004 with retries)
- With repair: $0.30-0.42 per course (20-30% savings on repairs)
- ROI: [savings justify implementation complexity]

## Tasks to Update
- T015: json-repair.ts (add FSM + LLM repair)
- T019: metadata-generator.ts (integrate repair cascade)
- T020: section-batch-generator.ts (integrate repair cascade)
- T029-B: generation-phases.ts (wrap with repair logic)
```

### 2. Research Report: `rt-005-research-report-json-repair.md`

**Structure**:
- Comprehensive literature review (30-50KB)
- Repair technique comparisons (benchmarks, case studies)
- Production system analysis (Instructor, Guardrails, LangChain patterns)
- npm package evaluations (json-repair, jsonrepair, json5, hjson)
- Token economics deep dive (break-even calculations)
- Edge cases and failure modes

### 3. Updated Tasks in `tasks.md`

**New task**: T005-R-IMPL - Apply RT-005 JSON Repair Strategy

**Updated tasks**:
- T015: json-repair.ts (extend with FSM + LLM repair)
- T019: metadata-generator.ts (integrate repair cascade)
- T020: section-batch-generator.ts (integrate repair cascade)
- T029-B: generation-phases.ts (wrap with repair + retry logic)

---

## Success Criteria

**Research Quality**:
- [ ] All 8 research questions (Q1-Q8) answered with data-backed conclusions
- [ ] Decision tree with exact thresholds (token counts, success rates, cost multipliers)
- [ ] Production-ready library recommendations (npm packages, versions)
- [ ] Integration guide with TypeScript/Zod code examples

**Cost-Benefit Validation**:
- [ ] Token savings quantified: repair vs regeneration (target: 20-30% savings)
- [ ] Success rate validated: target 90-95% with repair + retry (RT-004 level)
- [ ] Total cost per course: target ≤$0.45 (within RT-001/RT-004 budgets)

**Implementation Readiness**:
- [ ] Clear specifications for T015 (json-repair.ts) implementation
- [ ] Integration patterns for T019/T020 (metadata/section generators)
- [ ] Monitoring metrics defined (repair success rate, token savings, failure modes)

---

## Timeline & Dependencies

**Estimated Research Time**: 4-6 hours (comprehensive production system analysis + benchmarking)

**Dependencies**:
- RT-001 ✅ (model routing strategy)
- RT-004 ✅ (retry logic and quality thresholds)
- plan.md ✅ (4-level cascade documented)
- research.md ✅ (n8n proof-of-concept patterns)

**Blocks**:
- T015 (json-repair.ts implementation)
- T019 (metadata-generator.ts integration)
- T020 (section-batch-generator.ts integration)
- T029-B (generation-phases.ts retry wrapping)

---

## DeepResearch Prompt (Copy to Research Tool)

```
Research Topic: JSON Repair and Regeneration Strategies for LLM-Generated Educational Content

Context:
We're building a production course generation system (TypeScript/Node.js) that generates complex JSON structures (course metadata, sections, lessons, exercises) via LLMs (OpenRouter API: OSS 120B, qwen3-max, Gemini 2.5 Flash). Current strategy uses 4-level JSON repair (brace counting, quote fixing, trailing commas, comments) with 85%+ success rate. We need to optimize for cost (token savings) while maintaining 90-95% success rate.

Research Questions:
1. FSM-based JSON repair libraries (json-repair, jsonrepair, json5): Success rates, edge cases, production readiness for complex nested JSON (10-50 levels deep, 10K-100K tokens)?

2. LLM-based semantic repair for schema violations: Optimal prompt patterns (direct error feedback, schema-guided, progressive validation)? Success rates by error type (missing fields 80%?, type mismatches 70%?, constraint violations 60%?)?

3. Cost-benefit thresholds: At what context size (tokens) does repair become more cost-effective than regeneration? Break-even calculation: repair success rate × token savings vs regeneration cost?

4. Integration with 10-attempt retry escalation: Where to inject repair in sequence (attempts 1-3 network retry, 4-5 temperature reduction, 6-7 prompt enhancement, 8-10 model escalation)? Should repair run after every attempt or only specific error types?

5. Error classification and repairability: Which errors are repairable (parse errors 95%, schema violations 50-80%, semantic errors 20%)? Decision matrix: error type × context size → repair technique or regenerate?

6. Production implementations: How do Instructor (Pydantic), Guardrails AI (OnFailAction: FIX), LangChain (RetryWithErrorOutputParser) handle JSON repair? Validated patterns and success rates?

7. Multi-language considerations: Do repair techniques work equally for English, Russian, German, Spanish JSON? Language-specific field naming patterns?

8. Token budget impact: Repair adds ~250 tokens (error message + prompt + delta output). Impact on 90K token input budget? Does repair fit without triggering overflow fallback?

Constraints:
- Per-batch token budget: 90K input tokens max
- Target success rate: 90-95% after repairs/retries
- Target cost: ≤$0.45 per course (including repairs/retries)
- Error types: JSON parse errors, Zod schema violations, field naming (camelCase vs snake_case), semantic quality errors
- Stack: TypeScript, Zod (schema validation), OpenRouter (LLM API), Pino (logging)

Deliverables:
1. Ranked repair techniques with success rates, cost multipliers, use cases
2. Decision tree: error type × context size → repair or regenerate
3. Optimal repair sequence integrated with 10-attempt retry escalation
4. Library recommendations: json-repair, jsonrepair, json5, or custom?
5. LLM repair prompt patterns with validated success rates
6. Cost-benefit analysis: token savings from repair vs regeneration
7. Implementation guide: TypeScript/Zod integration, monitoring metrics

Focus on production-ready strategies with data-backed recommendations. Prioritize cost-effectiveness (token savings) while maintaining high success rates (90-95%). Include real-world case studies from Instructor, Guardrails AI, LangChain implementations.
```

---

## Notes for Implementation

**After Research Complete**:
1. Review decision document (`rt-005-json-repair-regeneration.md`)
2. Update `tasks.md` with:
   - Mark T005-R as COMPLETE ✅
   - Add T005-R-IMPL (implementation task)
   - Update T015, T019, T020, T029-B descriptions with RT-005 references
3. Move research report to `specs/008-generation-generation-json/research-decisions/`
4. Update plan.md if strategy significantly differs from current 4-level cascade
5. Create implementation checklist for T015 (json-repair.ts) with library integration steps

---

**Research Status**: 🔄 PENDING - Ready for DeepResearch execution
**Next Step**: Run DeepResearch with prompt above, analyze results, create decision document
