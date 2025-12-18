# Optimal LLM Parameters for B2B Educational Course Generation: Production-Ready Recommendations

Your multi-stage educational pipeline requires **conservative, task-specific temperature settings** ranging from 0.0 (classification) to 0.6 (pedagogical synthesis), with OSS models showing comparable behavior to commercial models when properly configured. The critical finding: **educational content prioritizes accuracy over novelty**, requiring temperatures 0.2-0.4 lower than creative writing tasks. Production systems universally avoid per-section temperature strategies due to 5-7x cost increases, favoring single-temperature-per-stage approaches with model routing for optimization.

## Executive findings: What the research reveals

Academic studies show **temperature 0.0-1.0 produces statistically equivalent accuracy** for problem-solving tasks (Renze & Guven, EMNLP 2024, p>0.05 across 1,000 questions), contradicting conventional wisdom. However, **educational AI systems consistently use low temperatures** (0.0-0.3) for factual content to minimize hallucinations. Production deployments reveal **15-30% retry rates** (not optimistic 1.18x projections), creating realistic 1.15-1.3x cost multipliers before overhead. OSS models (Llama 3, Qwen, Mistral) **do not universally require lower temperatures** than GPT-4/Claude—task type matters more than model origin.

Khan Academy's Khanmigo and Duolingo both use GPT-4 with undisclosed parameters (treated as proprietary), but academic research on educational content generation converges on **temperature 0.2-0.3 for explanations** and **0.6-0.8 for pedagogical analogies**. The critical distinction: educational analogies require clarity and accuracy (temp 0.6-0.8), not creative novelty (temp 1.0), which risks confusing or inaccurate metaphors. For RAG synthesis in educational contexts, temperature 0.4-0.6 balances factual grounding with pedagogical reformulation, while pure retrieval requires 0.0-0.2.

Strategic reasoning for curriculum design sits between mathematical logic (0.0-0.3) and creative brainstorming (0.9-1.0), with **optimal range 0.3-0.5** for instructional design tasks. Medical AI studies confirm this hierarchy: diagnostic reasoning requires 0.0-0.3 (100% accuracy at temp 0.0), while strategic planning uses 0.3-0.5. Two-stage generation (reasoning then execution) delivers **40-60% token savings** with maintained quality, mirroring professional curriculum design workflows.

## Stage-by-stage parameter matrix

### Stage 3: Document Classification

**Task**: Binary HIGH/LOW priority classification on OSS 20B model

**Recommended parameters**:
- **Temperature**: **0.0-0.1** (lower than current 0.3)
- **Top-p**: 0.7-0.8 (truncate unreliable tail)
- **Frequency penalty**: 0.0
- **Presence penalty**: 0.0
- **Max tokens**: 10-20 (binary output needs minimal tokens)

**Rationale**: Binary classification requires maximum determinism. Medical AI achieved 90% accuracy across temps 0.2-1.0, but educational B2B content has **zero tolerance for misclassification**. Temperature 0.0 eliminates sampling randomness. For OSS models specifically, Llama 3 documentation recommends temp 0.2-0.3 for classification; Mistral official docs specify 0.0-0.2 range. Your current 0.3 is conservative but can be lowered to 0.0-0.1 for classification with greedy decoding.

**OSS-specific note**: Qwen 2.5 shows strong MMLU performance (70.4) with temperature 0.2-0.3 for accurate tasks. No adjustment needed from commercial baselines—OSS models handle classification identically at near-zero temps.

### Stage 4, Phase 1: Multi-label Classification

**Task**: Category/audience detection on OSS 20B

**Recommended parameters**:
- **Temperature**: **0.1-0.2**
- **Top-p**: 0.8
- **Frequency penalty**: 0.0-0.1
- **Presence penalty**: 0.0
- **Max tokens**: 50-100

**Rationale**: Multi-label classification requires slightly higher temperature than binary (0.1-0.2 vs 0.0-0.1) to avoid overconfident single-class predictions. Academic research shows **no documented difference** between binary and multi-label temperature requirements, but practitioners often use 0.1-0.2 for probability calibration in multi-class scenarios. Frequency penalty 0.1 prevents repetition of same category multiple times.

### Stage 4, Phase 2: Scope Analysis (Numerical Estimation)

**Task**: Lesson count and hours estimation—arithmetic/counting

**Recommended parameters**:
- **Temperature**: **0.0-0.2**
- **Top-p**: 0.7
- **Frequency penalty**: 0.0
- **Presence penalty**: 0.0
- **Max tokens**: 100-200

**Rationale**: Numerical reasoning requires deterministic outputs. Industry consensus (IBM, Microsoft, OpenAI) recommends temp 0.0-0.3 for mathematical calculations. Surprisingly, Renze & Guven (2024) found **no statistical difference** in math problem accuracy across temps 0.0-1.0, BUT this tested MCQA with constrained outputs. Your estimation task requires **precision in number generation**, not just selecting correct answers. Research on numerical fact robustness shows "numerical facts are more resilient than others" to temperature, but increasing temperature "systematically degrades correctness." Conservative approach: **temp 0.0-0.2** for arithmetic accuracy.

**Critical warning**: Avoid temps >0.5 for any numerical precision tasks. Higher temps increase risk of hallucinated counts (e.g., claiming 47 lessons when content supports 12).

### Stage 4, Phase 3: Expert Analysis (Pedagogical Strategic Reasoning)

**Task**: Curriculum design strategy, pedagogical approach selection on OSS 120B reasoning model

**Recommended parameters**:
- **Temperature**: **0.4-0.5** (NOT 0.85+)
- **Top-p**: 0.9
- **Frequency penalty**: 0.2
- **Presence penalty**: 0.1
- **Max tokens**: 1500-2500

**Rationale**: This is your **most critical parameter decision**. Pedagogical strategic reasoning sits between mathematical logic (0.0-0.3) and creative brainstorming (0.9-1.0). Research on instructional design AI and medical strategic analysis confirms **optimal range 0.3-0.5** for evidence-based yet adaptive decision-making. Medical strategic analysis uses 0.0-0.5; business strategy studies recommend 0.3-0.5 for "thoughtful and human" decisions with "room for experimentation."

**Key distinction**: This is NOT creative fiction writing (0.9-1.0) or pure mathematical reasoning (0.0-0.3). Curriculum design requires **coherent, evidence-based pedagogical decisions with flexibility for diverse learners**. Temperature 0.85+ risks incoherent strategy; 0.0-0.3 produces overly rigid approaches. The sweet spot: **0.4-0.5** balances structure with pedagogical nuance.

**Educational content evidence**: Khan Academy and Duolingo both emphasize prompt engineering over high temperatures. Academic research shows temperature **weakly correlated with novelty, moderately correlated with incoherence**—high temps don't guarantee better pedagogy, just more randomness. Your 120B reasoning model likely handles this well at 0.4-0.5.

**Two-stage option**: Generate strategic outline at temp 0.3-0.4 (coherent structure), then detailed strategies at temp 0.5 (pedagogical flexibility). CoThink framework research shows **11.9% token usage** for planning stage vs. full generation. For curriculum design, two-stage mirrors professional workflow: outline learning objectives (0.3) → develop teaching strategies (0.5). Expected savings: 40-60% tokens with maintained quality.

### Stage 4, Phase 4: Document Synthesis

**Task**: Section structure creation

**Recommended parameters**:
- **Temperature**: **0.3-0.4**
- **Top-p**: 0.9
- **Frequency penalty**: 0.2
- **Presence penalty**: 0.1
- **Max tokens**: 800-1200

**Rationale**: Structural planning requires coherent organization (lower temp) with some flexibility for content-specific adaptation (not 0.0). Similar to curriculum sequencing tasks, which instructional design research recommends temp 0.3-0.4. Higher than binary classification, lower than creative ideation.

### Stage 4, Phase 6: RAG Planning

**Task**: Document-to-section mapping, query generation—needs diversity but precision

**Recommended parameters**:
- **Temperature**: **0.4-0.5**
- **Top-p**: 0.9
- **Frequency penalty**: 0.3 (encourage query diversity)
- **Presence penalty**: 0.2
- **Max tokens**: 600-1000

**Rationale**: RAG query generation requires **balance between diversity (exploring document space) and precision (retrieving relevant chunks)**. Google Vertex AI recommends temp 0.0 for RAG answer generation, but that's for retrieval, not query planning. CoT-RAG study (2025) found **temp 0.4 optimal** for "balance between determinism and diversity" in RAG reasoning tasks. Your query generation needs variety to cover different document sections, justifying 0.4-0.5. Frequency penalty 0.3 prevents repetitive query patterns.

## Stage 5: Lesson Breakdown

### Phase 2: Metadata Generation (Professional Titles)

**Task**: Engaging but professional B2B titles (not clickbait)

**Recommended parameters**:
- **Temperature**: **0.5-0.6**
- **Top-p**: 0.9
- **Frequency penalty**: 0.4
- **Presence penalty**: 0.2
- **Max tokens**: 50-100

**Rationale**: B2B professional engagement requires **moderate creativity without sensationalism**. Temperature 0.5-0.6 provides variety in phrasing while maintaining professional tone. This is higher than factual content (0.2-0.3) but lower than consumer marketing (0.8-1.0). Frequency penalty 0.4 prevents generic title patterns ("Introduction to..." repeated). Educational MCQ generation research found temp 0.2 "repetitive and similar," temp 1.0 "balanced diversity," temp 1.2+ "unusable"—your 0.5-0.6 sits in the usable diversity range.

### Phase 3: Section Generation with RAG (20-30 chunks)

**Task**: Pedagogical reasoning + structured content design + RAG synthesis

**CRITICAL DECISION: Single-stage vs Two-stage**

#### Option A: Single-stage (Recommended for MVP)

**Parameters**:
- **Temperature**: **0.4-0.5**
- **Top-p**: 0.9
- **Frequency penalty**: 0.2
- **Presence penalty**: 0.1
- **Max tokens**: 2000-3000

**Rationale**: RAG-grounded educational synthesis requires **factual accuracy (low temp) + pedagogical reformulation (moderate temp)**. Google recommends temp 0.0 for RAG to "minimize deviation from sources," but educational content needs synthesis, not verbatim copying. Academic research on RAG synthesis suggests **temp 0.4-0.6 balances grounding with engagement**. CoT-RAG study found temp 0.4 optimal across tested range (0.3-0.7).

**For OSS models**: Qwen 3 with thinking mode officially uses temp 0.6 for reasoning. Llama 3 defaults to 0.5 for balanced tasks. Mistral official range 0.0-0.7 accommodates this. **No OSS-specific adjustment needed**—use 0.4-0.5 for Llama/Qwen/Mistral.

**Production systems evidence**: Educational platforms prioritize accuracy over novelty. Khan Academy's "secret sauce" emphasizes prompt engineering to avoid errors, suggesting conservative temps. Temperature 0.4-0.5 provides pedagogical synthesis while maintaining RAG grounding.

#### Option B: Two-stage generation

**Stage 1 (Reasoning/Structure)**:
- Temperature: 0.4
- Top-p: 0.9
- Max tokens: 400-600 (outline only)

**Stage 2 (Content Execution)**:
- Temperature: 0.5
- Top-p: 0.9
- Max tokens: 1800-2400

**Cost-quality analysis**:
- **Cost**: 2x API calls, but CoThink research shows Stage 1 uses only **11.9% tokens** of full generation. Total: ~1.12x base cost, NOT 2x.
- **Quality**: CodePlan study showed **25.1% performance gain** with two-stage structured approach. Token-budget-aware reasoning reduced usage 258→86 tokens while maintaining correctness.
- **Latency**: Sequential calls add 2-4 seconds. For lesson generation (not real-time), acceptable.

**Recommendation**: **Use single-stage for MVP** (simpler, lower latency, 0.4-0.5 temp). **Consider two-stage for optimization phase** if quality issues emerge. Two-stage best when: (1) content complexity varies widely, (2) token costs exceed $10k/month, (3) quality improvements justify 2-4s latency. Most production systems avoid two-stage complexity unless clear ROI exists.

### Phase 4: LLM-as-Judge Evaluation

**Task**: Evaluate lesson quality consistently

**Recommended parameters**:
- **Temperature**: **0.0**
- **Top-p**: Disabled or 1.0
- **Frequency penalty**: 0.0
- **Presence penalty**: 0.0
- **Max tokens**: 200-400

**Rationale**: Industry consensus and academic research **universally recommend temp 0.0** for LLM judges. Google documentation: "For evaluations, you don't need creativity—set low temperature for consistent answers." Systematic evaluation study tested temps 0.0-1.0; selected 0.0 for large-scale experiments.

**Critical warning**: Even at temp 0.0, LLMs aren't perfectly deterministic due to hardware/implementation factors. Research shows same statement scored 6, 7, 8, 9, 9 across 5 runs (40% variance) even at temp 0. **Mitigation**: Run 3-5 evaluations and use majority voting. Set temperature 0.0 as baseline, then aggregate multiple samples for consistency.

## Stage 6: Lesson Content (Planned Archetypes)

### Archetype 1: Technical Content (Code Tutorials)

**Recommended parameters**:
- **Temperature**: **0.2-0.3**
- **Top-p**: 0.6-0.7
- **Top-k**: 5-10 (for code specificity)
- **Frequency penalty**: 0.0-0.1 (allow necessary loops/patterns)
- **Presence penalty**: 0.0-0.1 (maintain variable consistency)
- **Max tokens**: 2000-3000

**Rationale**: Code generation requires precision to avoid syntax errors. Llama 3 official guidance specifies **temp 0.2-0.3, top-p 0.6-0.7, top-k 5-10** for code tasks. Qwen 2.5 Coder achieves 85%+ HumanEval with temp 0.2-0.4. Mistral Codestral uses 0.0-0.3. Frequency/presence penalties kept near-zero to allow loops and maintain variable naming consistency.

### Archetype 2: Conceptual Content with Analogies

**CRITICAL QUESTION ANSWERED: Educational Analogy Temperature**

**Recommended parameters**:
- **Temperature**: **0.6-0.7** (NOT 1.0)
- **Top-p**: 0.9-0.95
- **Frequency penalty**: 0.3
- **Presence penalty**: 0.2
- **Max tokens**: 2500-3500

**Rationale**: This addresses your core question about educational analogies. Research from Harper et al. (ITiCSE 2024) and "Unlocking Scientific Concepts" (CHI 2025) studied LLM-generated pedagogical analogies in classrooms. Key findings:

1. **Educational analogies require clarity, accuracy, and helpfulness**—not pure novelty
2. Students remembered "personally and culturally relevant" analogies best
3. **Teacher guidance essential** to prevent over-reliance
4. Biology analogies showed "significant improvement"; physics mixed results
5. Academic study on temperature and creativity found it **weakly correlated with novelty, moderately correlated with incoherence**

**Critical insight**: Educational analogy quality = Clarity × Accuracy × Helpfulness. High temperature (1.0) sacrifices accuracy/clarity for novelty. **Temperature 1.0 too risky** for educational context—increases hallucination risk and incoherent comparisons. Research on educational content generation recommends **temp 0.3-0.7 for pedagogical analogies**, distinct from creative fiction analogies (entertainment value, temp 1.0+).

**Your specific use case**: HTTP=restaurant, blockchain=ledger require **structural alignment and accuracy**. Temperature 0.6-0.7 provides creative yet pedagogically sound analogies. Lower than creative writing (0.9-1.0), higher than factual explanations (0.2-0.3). Frequency penalty 0.3 encourages variety in analogy types.

**Khan Academy pattern**: Khanmigo emphasizes "carefully adapted" prompts to avoid math errors, suggesting conservative parameters. While specific temps undisclosed, the focus on error prevention implies lower temps than creative applications.

### Archetype 3: Compliance Content

**Task**: Legal/regulatory content—zero error tolerance

**Recommended parameters**:
- **Temperature**: **0.0-0.1**
- **Top-p**: 0.7-0.8
- **Frequency penalty**: 0.0
- **Presence penalty**: 0.0
- **Max tokens**: 2000-3000

**Rationale**: Legal/compliance AI universally uses temp 0.0-0.3. Legal tech case studies emphasize "precision and unambiguity." Medical AI achieved 100% diagnostic accuracy at temp 0.0 in high-stakes scenarios. For compliance training, **any factual error creates liability risk**. Use temp 0.0-0.1 with human expert review mandatory.

## OSS model-specific adjustments

### The Universal Adjustment Myth

**Key finding**: OSS models (Llama 3, Qwen, Mistral) **do NOT universally require lower temperatures** than GPT-4/Claude. The "-0.1 to -0.2 adjustment rule" is **not supported** by empirical evidence.

**Evidence**:
- Qwen 3 official guidance: temp 0.6 for reasoning (higher than GPT-4's common 0.3-0.5)
- Llama 3 defaults: temp 0.9 in official configs (Llama-2-hf)
- Mistral official range: 0.0-0.7 aligns with commercial recommendations
- Community best practice: temp 1.0 with Min-P 0.02-0.05 for modern OSS models
- Medical study: Llama-3 maintained 90% accuracy across temps 0.2-1.0

### When OSS Behavior Differs

**Base/foundation models** (non-instruct): May need -0.1 to -0.2 adjustment vs commercial chat-tuned models

**Instruct-tuned variants** (Llama 3-Instruct, Qwen2.5-Instruct, Mistral-Instruct): **No adjustment needed**—use same temps as commercial models

**Smaller models** (7B vs 70B): May show more temperature sensitivity at extremes

### Model-specific recommendations

#### Llama 3.x (via OpenRouter)

**Classification/Technical**: temp 0.2, top-p 0.7, top-k 5-10
**Strategic reasoning**: temp 0.5, top-p 0.95
**Creative pedagogical**: temp 0.7-0.8, top-p 0.95, top-k 40

**Special consideration**: Community recommends temp 1.0 + Min-P 0.02-0.05 + DRY sampling for modern Llama models. This "trusts the model's training" rather than distorting probabilities. For production B2B: stick with conservative temps (0.2-0.7 range) for reliability.

#### Qwen 2.5/3 (via OpenRouter)

**Classification**: temp 0.2-0.3
**Reasoning (with thinking mode)**: temp 0.6, top-p 0.95, top-k 20, **do_sample=True** (critical)
**Creative**: temp 0.7-0.9

**Special consideration**: Qwen 3 thinking mode **requires temp 0.6** per official docs. If using Qwen for Stage 4 Phase 3 (expert analysis), temp 0.6 appropriate. For other Qwen models, follow general educational guidelines (0.2-0.5 range).

**Knowledge gap warning**: Qwen models show strong MMLU performance (70.4) but may hallucinate on popular culture outside academic domains. Temperature won't compensate—use RAG grounding.

#### Mistral 7B/8x7B (via OpenRouter)

**All tasks**: Stay within **0.0-0.7 range** (official maximum)
**Classification**: temp 0.0-0.2
**Strategic reasoning**: temp 0.3-0.5
**Creative**: temp 0.7 (maximum per docs)

**Special consideration**: Mistral official API docs specify "higher values like 0.7 make output more random." Unlike Llama/Qwen which tolerate temps up to 1.0+, **Mistral designed for 0.0-0.7 range**. Exceeding 0.7 not recommended per vendor guidance.

**Performance note**: Mixtral 8x7B has 6x faster inference due to sparse mixture-of-experts. Speed advantage matters more than temperature tweaking for production efficiency.

### Top-p, frequency, and presence penalties for OSS

**Top-p (nucleus sampling)**:
- **General rule**: Adjust temperature OR top-p, not both simultaneously
- Llama 3: Code (0.6-0.7), Creative (0.95), General (1.0)
- Qwen 3: Thinking mode (0.95), General (1.0)
- Mistral: Default 1.0, adjust alternatively to temperature

**Frequency penalty**:
- All OSS models: Low values (0.0-0.2) for technical content
- Llama 3 code generation: 0.0-0.1 (allows necessary repetition)
- Higher values (0.3-0.5) for creative content to reduce repetition

**Presence penalty**:
- Llama 3 code: 0.0-0.1 (maintains variable consistency)
- General: Keep low (0.0-0.2) for structured outputs

**Repetition penalty** (OSS-specific):
- Traditional: 1.05-1.1
- Modern DRY sampling: multiplier=0.8, base=1.75, allowed_length=2 (preferred by r/LocalLLaMA community)
- For production B2B: Use traditional repetition penalty 1.05-1.1 for simplicity

### Benchmarking your OSS configuration

**Validation protocol**:
1. Test temperature ranges: [0.0, 0.3, 0.5, 0.7] for each task type
2. Use Promptfoo, Langfuse, or similar evaluation frameworks
3. Measure: factual accuracy, coherence, pedagogical quality
4. Compare OSS vs commercial (if available) at same temps
5. Select optimal based on your specific content and standards

**Don't assume**: Public benchmarks (MMLU, HumanEval) don't reflect your B2B educational use case. Run systematic evals on representative samples.

## Production implementation strategy

### Phase 1: MVP (Single temperature per stage)

**Goal**: Prove value with minimal complexity (Month 1-2)

**Implementation**:
- **Stage 3**: temp 0.0 (classification)
- **Stage 4**: temp 0.4 (strategic reasoning + RAG planning)
- **Stage 5**: temp 0.5 (lesson generation)
- **LLM Judge**: temp 0.0 with 3x voting
- Single model per stage (likely Qwen 2.5 20B for most, 120B for expert analysis)
- Basic retry logic (3 attempts max)

**Monitoring**:
- Token usage per stage
- Human spot-checks on 5-10% of outputs
- User satisfaction scores

**Cost target**: $500-2,000/month at pilot scale

**Success criteria**:
- Core functionality works
- Educational quality acceptable (human review)
- Cost per course understood

### Phase 2: Optimization (Archetype routing)

**Goal**: Reduce costs 40-60% while improving quality (Month 3-6)

**Week 1-2: Prompt optimization**
- Compress system prompts (20-40% token reduction expected)
- Remove redundancy
- Test A/B variants with Promptfoo

**Week 3-4: Caching layer**
- Implement semantic caching (GPTCache, Langfuse, Helicone)
- Target 40-70% hit rate for repeated content patterns
- Expected: 15-30% immediate cost reduction

**Week 5-8: Archetype routing** (HIGHEST ROI)
- Classify content complexity (simple/technical/conceptual/compliance)
- Route 70% to Llama 3 8B-Instruct (cheaper, faster)
- Reserve Qwen 2.5 20B for complex reasoning
- Reserve 120B for strategic expert analysis only
- Expected: **40-60% cost reduction**

**Production finding**: This is what real systems do instead of per-section temperature. Model routing delivers proven ROI (40-60% savings documented). Per-section temperature delivers 5-7x cost increase with unproven value.

**Temperature tuning per archetype**:
- Technical (code tutorials): temp 0.2-0.3
- Conceptual (analogies): temp 0.6-0.7
- Compliance: temp 0.0-0.1
- A/B test each archetype separately

**Monitoring**:
- Cost per request by model and archetype
- Cache hit rates (target 50%+)
- Quality metrics (LLM-graded with temp 0.0 judge)
- Latency percentiles (p50, p95, p99)

**Success criteria**:
- 40-60% cost reduction achieved
- Quality maintained or improved (human evals)
- System reliability >99%

### Phase 3: Advanced optimization (If scale justifies)

**Goal**: Scale efficiently with minimal human intervention (Month 6-12)

**Consider only if volume >1M tokens/day**:

**Fine-tuning smaller models**:
- For high-volume, repetitive tasks (e.g., metadata generation, classification)
- Target: 5x cost reduction + 30x speedup (Checkr case study: Llama-3-8b-instruct achieved 90% accuracy vs GPT-4)
- Investment: $10k-50k initial
- Break-even: ~2M tokens/day sustained

**Advanced guardrails**:
- Smart filtering to minimize false positives (<10% rate)
- Use only for security/compliance, not functionality
- Avoid "40% false positive rate destroying economics" (Confident AI finding)

**Dynamic context management**:
- Summarize long conversation histories
- Intelligent context pruning
- Target: Cap context at 2,000 tokens (prevents 4x cost multiplier from context growth)

**Batch processing**:
- 50%+ discounts from OpenRouter/providers
- For non-real-time lesson generation

**Monitoring**:
- Full observability stack (Langfuse, Helicone, Portkey)
- Cost attribution by stage/archetype/model
- Real-time alerting (>2x baseline = alert)
- Automated quality checks with LLM judges

**Success criteria**:
- Total cost multiplier <2x base tokens (includes retries, monitoring, overhead)
- 85-95% cost reduction vs unoptimized baseline
- Predictable, scalable economics

### What NOT to implement

**Per-section dynamic temperature**: Production research shows **zero adoption** of this pattern. Reasons:

1. **5-7x cost increase**: 5 sections = 5 API calls = 5x base cost
2. **No proven ROI**: No case studies show quality improvement justifies cost
3. **Latency issues**: Sequential calls add 10-20 seconds; parallel adds complexity
4. **Better alternatives exist**: Model routing delivers 40-60% savings with proven results

**Recommendation**: Use single temperature per document/lesson. Invest in model routing instead.

## Cost-quality tradeoffs with realistic numbers

### Realistic retry rates

**Finding**: Production systems experience **15-30% retry rates**, not optimistic 1.18x projections.

**Sources**:
- Aplex/Medium (2025): "15-30% of total volume" need regeneration
- Confident AI: 40% false positive rate from excessive guardrails causes needless retries
- Production case studies: 1.15-1.3x cost multiplier from retries alone

**Total production cost multipliers**:
- Direct API costs: 1.0x (baseline)
- Retry overhead: 1.15-1.3x
- Quality assurance: 1.1-1.2x
- Infrastructure (monitoring, logging): 1.3-1.4x
- **Total: 2-5x base token costs** in production

**Real example** (Appunite case study):
- Pilot: $10/month
- Production Week 6: $5,900/month
- Breakdown: $3,500 tokens, $1,800 RAG+guardrails, $2,200 observability

### Cost targets by scale

**Startup/MVP** (<100K requests/month):
- Cost: $500-2,000/month
- Focus: Prove value
- Optimization: Basic prompts + single temp

**Growth** (100K-1M requests/month):
- Cost: $2,000-10,000/month
- Focus: Efficiency
- Optimization: Caching + routing (40-60% reduction)

**Scale** (1M+ requests/month):
- Cost: $10,000-50,000/month
- Focus: Sustainability
- Optimization: Fine-tuning + advanced routing

### Single-stage vs two-stage economics

**Single-stage** (recommended for MVP):
- Cost: 1.0x base
- Latency: 2-4 seconds
- Quality: Good with proper temp (0.4-0.5)
- Complexity: Low

**Two-stage**:
- Cost: **1.12x base** (not 2.0x—Stage 1 uses only 11.9% tokens per CoThink research)
- Latency: 4-8 seconds (sequential calls)
- Quality: 6.6-25.1% improvement documented
- Complexity: Moderate
- **ROI breakeven**: When quality improvement justifies 2-4s latency and 12% cost increase

**Recommendation**: Start single-stage. Consider two-stage if:
- Content complexity varies widely (simple vs complex lessons)
- Quality issues emerge with single-stage
- Token costs exceed $10k/month (12% increase = $1,200/month vs quality gain)

### Temperature testing ROI

**Low ROI**: Testing 10+ temperature values per stage (diminishing returns)

**High ROI**: Testing 3-4 key values: [0.0, 0.3, 0.5, 0.7]

**Process**:
1. Week 1: Test [0.3, 0.5, 0.7] for Stage 4 strategic reasoning
2. Week 2: Evaluate with LLM judge (temp 0.0) + human review on 20 samples
3. Week 3: Select optimal (likely 0.4-0.5), deploy to production
4. Month 2-3: Monitor quality metrics, adjust if needed

**Expected ROI**: Minimal cost reduction from temperature tuning alone. Quality improvement: 5-15% from optimal vs suboptimal temp. **Model routing delivers 10x better ROI** than temperature optimization.

## Risk mitigation and diagnostics

### Symptoms of incorrect temperature

**Temperature too low (<0.3 for strategic tasks)**:
- Repetitive outputs (same phrasing across lessons)
- Overly rigid responses lacking pedagogical nuance
- "Robotic" feel in analogies and explanations
- Reduced variety in teaching approaches

**Fix**: Increase to 0.4-0.6 for strategic/creative tasks

**Temperature too high (>0.7 for factual content)**:
- Factual hallucinations (incorrect dates, stats, procedures)
- Incoherent pedagogical strategies
- Nonsensical analogies ("Start a sponge-ball baseball home run contest near Becksmith Stein Man Beach" - actual example from research)
- Overconfident but wrong classifications
- Mentions of "as an AI language model" (indicates breakdown)

**Fix**: Decrease to 0.2-0.5 for factual/strategic content

**Temperature too high for task** (example: temp 0.8 for code generation):
- Syntax errors increase
- Variable naming inconsistency
- Logical errors in procedures
- Hallucinated API calls

**Fix**: Decrease to 0.2-0.3 for code

### Diagnostic checklist

**Before production**:
- [ ] Model real costs at 10x current usage
- [ ] Include retry overhead (1.3x multiplier minimum)
- [ ] Budget for monitoring/logging (30-40% overhead)
- [ ] Test failure modes (what breaks at scale?)
- [ ] Set up cost alerting (>2x baseline triggers review)
- [ ] Validate temperatures on representative samples (n=20+ per stage)

**During scaling (first 2 months)**:
- [ ] Monitor prompt length growth (track tokens per stage)
- [ ] Track cache hit rates (target 50%+)
- [ ] Implement retry limits (3 max recommended)
- [ ] Review cost weekly
- [ ] Human review 5-10% of outputs
- [ ] Monitor for temperature-related issues (hallucinations, repetition)

**Optimization triggers**:
- Cost/lesson >$1: Implement caching
- Cost/lesson >$2: Add model routing
- Volume >1M tokens/day: Consider fine-tuning
- Cost growth >2x month-over-month: Emergency optimization
- Quality drop >10%: Review temperature settings, add validation

### Validation process for OSS models

**Temperature validation protocol** (run before production):

1. **Select 20 representative samples** per stage (total 100 samples across all stages)
2. **Generate outputs at 3 temperatures**: [optimal-0.2, optimal, optimal+0.2]
3. **Evaluate with LLM judge** (temp 0.0, 3x voting) on:
   - Factual accuracy
   - Pedagogical soundness
   - Coherence
   - Alignment to objectives
4. **Human review** on 20% of samples (4 per temp setting)
5. **Select optimal** based on quality metrics
6. **Document**: Optimal temp for each model+stage combination

**Frequency**: Re-run quarterly or when changing models

### What happens when parameters are wrong

**Classification (Stage 3) at temp 0.7 instead of 0.0**:
- Symptom: Inconsistent priority assignments for similar documents
- Impact: Downstream stages process wrong content
- Detection: Compare classifications for duplicate/similar documents
- Fix: Lower to 0.0-0.1, validate on test set

**Strategic reasoning (Stage 4.3) at temp 0.9 instead of 0.4**:
- Symptom: Incoherent curriculum strategies, contradictory recommendations
- Impact: Lessons lack logical structure
- Detection: Human review flags "doesn't make sense"
- Fix: Lower to 0.4-0.5, compare outputs side-by-side

**RAG synthesis (Stage 5.3) at temp 0.0 instead of 0.4**:
- Symptom: Verbatim copying from RAG chunks, disjointed prose
- Impact: Content reads like concatenated excerpts, not coherent lessons
- Detection: Plagiarism tools flag high overlap with source documents
- Fix: Increase to 0.4-0.6 for pedagogical synthesis

**LLM Judge (Stage 5.4) at temp 0.7 instead of 0.0**:
- Symptom: Inconsistent scoring (same lesson gets different scores across runs)
- Impact: Can't trust quality metrics
- Detection: Run same lesson 5x, observe score variance >2 points
- Fix: Lower to 0.0, implement 3x voting for consistency

## Final parameter matrix summary

| Stage | Task | Temperature | Top-P | Freq Penalty | Pres Penalty | Max Tokens | Rationale |
|-------|------|-------------|-------|--------------|--------------|------------|-----------|
| **Stage 3** | Binary classification | 0.0-0.1 | 0.7-0.8 | 0.0 | 0.0 | 10-20 | Maximum determinism for classification |
| **Stage 4.1** | Multi-label classification | 0.1-0.2 | 0.8 | 0.0-0.1 | 0.0 | 50-100 | Calibrated probabilities for multi-class |
| **Stage 4.2** | Numerical estimation | 0.0-0.2 | 0.7 | 0.0 | 0.0 | 100-200 | Arithmetic accuracy critical |
| **Stage 4.3** | Pedagogical strategy (120B) | **0.4-0.5** | 0.9 | 0.2 | 0.1 | 1500-2500 | **Strategic reasoning, not creative** |
| **Stage 4.4** | Document synthesis | 0.3-0.4 | 0.9 | 0.2 | 0.1 | 800-1200 | Structural coherence with flexibility |
| **Stage 4.6** | RAG planning | 0.4-0.5 | 0.9 | 0.3 | 0.2 | 600-1000 | Query diversity with precision |
| **Stage 5.2** | Metadata/titles | 0.5-0.6 | 0.9 | 0.4 | 0.2 | 50-100 | Professional engagement, not clickbait |
| **Stage 5.3** | RAG section generation | **0.4-0.5** | 0.9 | 0.2 | 0.1 | 2000-3000 | **Grounded synthesis, single-stage** |
| **Stage 5.4** | LLM Judge | **0.0** | 1.0 | 0.0 | 0.0 | 200-400 | **Consistency via voting (3x)** |
| **Stage 6.1** | Code tutorials | 0.2-0.3 | 0.6-0.7 | 0.0-0.1 | 0.0-0.1 | 2000-3000 | Syntax precision |
| **Stage 6.2** | Conceptual + analogies | **0.6-0.7** | 0.9-0.95 | 0.3 | 0.2 | 2500-3500 | **Clear analogies, NOT temp 1.0** |
| **Stage 6.3** | Compliance content | 0.0-0.1 | 0.7-0.8 | 0.0 | 0.0 | 2000-3000 | Zero error tolerance |

### OSS model notes

- **Llama 3**: Use recommended temps directly, no adjustment from commercial baselines
- **Qwen 2.5/3**: If using thinking mode for Stage 4.3, temp 0.6 per official docs; otherwise follow matrix
- **Mistral**: Stay within 0.0-0.7 range (official maximum), adjust other stages proportionally

### Implementation priorities

**Week 1**: Stages 3, 4.1, 4.2 (classification and numerical—deterministic tasks)
**Week 2**: Stage 4.3 (expert analysis—most critical strategic reasoning)
**Week 3**: Stages 4.4, 4.6, 5.2 (structural and planning tasks)
**Week 4**: Stage 5.3 (RAG synthesis—complex integration)
**Week 5**: Stage 5.4 (LLM judge validation)
**Week 6+**: Stage 6 archetypes as content generation scales

## Critical distinctions reinforced

**Educational analogies (temp 0.6-0.7) vs Creative fiction (temp 1.0+)**:
- Educational: Clarity × Accuracy × Helpfulness = pedagogical tool
- Creative: Novelty × Entertainment = creative expression
- Research shows temp 1.0 too risky for educational analogies—increases confusion risk

**Strategic pedagogical reasoning (temp 0.4-0.5) vs Creative brainstorming (temp 0.9-1.0)**:
- Pedagogical: Evidence-based curriculum design, coherent strategy
- Creative: Divergent ideation, exploratory thinking
- Educational AI requires structure, not pure creativity

**RAG grounded synthesis (temp 0.4-0.6) vs RAG verbatim retrieval (temp 0.0)**:
- Synthesis: Pedagogical reformulation with factual grounding
- Retrieval: Direct extraction, minimal interpretation
- B2B educational content needs synthesis for engaging lessons

**B2B professional engagement (temp 0.5-0.6) vs Consumer marketing (temp 0.8-1.0)**:
- B2B: Professional tone, substantive value, trust-building
- Consumer: Attention-grabbing, viral potential, entertainment
- Corporate training prioritizes credibility over novelty

## Conclusion and next steps

Your MegaCampusAI B2B course generation pipeline requires **conservative, task-specific parameters** optimized for educational accuracy over creative novelty. The research converges on clear recommendations: **classification at temp 0.0-0.2, strategic reasoning at 0.4-0.5, RAG synthesis at 0.4-0.6, and educational analogies at 0.6-0.7**—distinctly lower than creative writing applications. OSS models (Llama 3, Qwen, Mistral) perform comparably to commercial models at these temperatures when using instruct-tuned variants.

**Critical findings**: (1) Production systems universally avoid per-section temperature strategies due to 5-7x cost increases, favoring model routing for optimization. (2) Real retry rates reach 15-30%, not optimistic 1.18x projections. (3) Educational content generation prioritizes accuracy and coherence, requiring temps 0.2-0.4 lower than creative applications. (4) Two-stage generation offers 40-60% token savings but adds latency—best reserved for complex curriculum planning, not every lesson.

**Implementation path**: Start with MVP using single temperature per stage (Month 1-2), optimize via caching and model routing for 40-60% cost reduction (Month 3-6), and consider advanced strategies like fine-tuning only if scale exceeds 1M tokens/day. Validate all parameters empirically on your specific content with systematic A/B testing. The key to production success: conservative parameters + excellent prompts + human validation + efficient model routing. Temperature tuning alone delivers minimal ROI compared to architectural optimizations.

**Your current temp 0.7 across all stages is suboptimal**—implement stage-specific temperatures per this matrix, with highest priority on Stage 4.3 (pedagogical strategy: 0.4-0.5) and Stage 6.2 (educational analogies: 0.6-0.7, not 1.0). Monitor with LLM judges at temp 0.0, validate with human reviews, and optimize based on actual quality metrics from your B2B customers.