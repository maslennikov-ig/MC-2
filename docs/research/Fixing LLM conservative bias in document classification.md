# Fixing LLM conservative bias in document classification

Claude's tendency to classify everything as SUPPLEMENTARY stems from well-documented LLM behaviors: **majority label bias, RLHF-induced hedging, and position sensitivity**. Research shows models trained with RLHF often default to "safe" labels when uncertain—and your three-tier classification likely has SUPPLEMENTARY as the cognitively "safest" default. The fix requires restructuring your prompts to combat these biases directly through balanced examples, reasoning-first approaches, and explicit forcing techniques.

The most effective strategy combines **few-shot examples with balanced label distribution**, **reasoning-before-classification ordering**, and **feature-extraction prompts** that guide the model to identify specific signals before making decisions. Studies show these techniques can improve classification accuracy by **8-15%** while dramatically reducing label distribution skew.

## Why LLMs default to low-importance labels

Three research-documented biases explain the "everything is SUPPLEMENTARY" problem:

**Majority label bias** causes models to output the most frequent label they've seen in training or examples. If your few-shot examples don't include balanced CORE documents, Claude will under-predict CORE. **Recency bias** makes models repeat labels appearing toward the end of prompts—if SUPPLEMENTARY appears last in your category list, it gets favored. **RLHF-induced hedging** trains models to avoid confident assertions that might be wrong; "SUPPLEMENTARY" feels like a non-committal, low-risk choice.

Research from Zhao et al. (2021) demonstrates that permuting few-shot examples can cause accuracy to swing from **54.3% to 93.4%** on identical tasks—label ordering alone causes massive performance variation. This explains why your classification might be systematically biased toward one category regardless of actual document content.

## Strategy 1: Balanced few-shot examples with explicit reasoning chains

Few-shot prompting significantly outperforms zero-shot for classification, but **balance is critical**. Provide 2-3 examples per category, ensuring equal representation. Include reasoning that demonstrates what signals triggered each classification.

```
EXAMPLES:

Document: "Course: Advanced Machine Learning | Prerequisites: Linear algebra, Python 
proficiency | Learning Objectives: By the end of this course, students will implement 
neural networks... | Grading: Midterm 30%, Final 40%, Projects 30% | Required Text: 
Deep Learning by Goodfellow..."
Reasoning: Contains explicit learning objectives, grading breakdown, prerequisites, 
and required materials. These are definitive syllabus components.
Classification: CORE

Document: "Case Study: Netflix Recommendation System | In this exercise, apply the 
collaborative filtering techniques from Chapter 5. Discussion Questions: 1) How would 
you modify the algorithm for..."
Reasoning: Labeled as case study with practice exercises. References core content but 
designed for application rather than primary instruction.
Classification: IMPORTANT

Document: "Bibliography | Anderson, J. (2019) Machine Learning Foundations... | 
For further reading on advanced topics, see the resources below..."
Reasoning: Consists primarily of citations with "further reading" language. No learning 
objectives or assessable content. Reference material only.
Classification: SUPPLEMENTARY
```

**Critical implementation details**: Randomize example order across API calls to prevent position bias. Include examples that show **borderline cases** classified as CORE or IMPORTANT rather than SUPPLEMENTARY—this counteracts the conservative default.

## Strategy 2: Feature extraction before classification

Research shows that asking models to identify specific features **before** classifying improves accuracy by forcing systematic analysis rather than snap judgments. This "reasoning-first" approach achieved **8.7% accuracy improvement** in emotion classification studies.

Structure your prompt to extract signals first:

```
Analyze this document and identify signals for each category:

CORE SIGNALS (check all present):
□ Explicit learning objectives ("By the end of...", "Students will...")
□ Grading criteria or assessment weights
□ "Required reading" or "required text" language
□ Course schedule with due dates
□ Prerequisites listed
□ Instructor contact information

IMPORTANT SIGNALS:
□ Practice exercises or discussion questions (without grade weights)
□ "Case study" or "worked example" labels
□ "Apply what you've learned" language
□ Procedural lab/workshop instructions

SUPPLEMENTARY SIGNALS:
□ "Optional", "recommended", "further reading" labels
□ Primarily citation lists (bibliography format)
□ "Appendix", "glossary", or "index" designation
□ No learning objectives or assessments

Document: [content]

First, identify which signals are present. Then classify based on the highest-priority 
signals found (CORE signals override IMPORTANT, IMPORTANT overrides SUPPLEMENTARY).
```

This approach forces the model to systematically check for CORE signals before it can conclude SUPPLEMENTARY—directly combating the conservative default.

## Strategy 3: Explicit label distribution forcing

Combat conservative bias by explicitly instructing the model about expected distributions and forcing decisive classification:

```
You must classify documents into exactly ONE category. In a typical course document 
set: ~20-30% are CORE, ~30-40% are IMPORTANT, ~30-40% are SUPPLEMENTARY.

Classification rules:
1. If ANY strong CORE signal is present, classify as CORE (do NOT downgrade to 
   SUPPLEMENTARY for safety)
2. When in doubt between adjacent categories, choose the HIGHER priority category
3. SUPPLEMENTARY is ONLY for documents with explicit optional/reference indicators 
   or pure citation lists
4. A document with learning content but no "optional" label defaults to IMPORTANT, 
   not SUPPLEMENTARY

CRITICAL: Do NOT classify primary instructional content as SUPPLEMENTARY. 
A syllabus is ALWAYS CORE. A textbook chapter is ALWAYS CORE. Only use SUPPLEMENTARY 
for clearly optional reference material.
```

The explicit distribution guidance and "upward default" instruction directly counteract the hedging tendency. Research shows that **negative constraints** ("do NOT classify X as SUPPLEMENTARY") combined with **forcing language** ("You must choose exactly one") significantly reduce ambiguous classifications.

## Strategy 4: Structured JSON output with confidence gating

Require structured output that separates reasoning from classification and includes confidence scoring:

```json
{
  "document_type_detected": "syllabus | textbook_chapter | case_study | bibliography | ...",
  "core_signals_found": ["learning objectives present", "grading criteria listed"],
  "important_signals_found": [],
  "supplementary_signals_found": [],
  "primary_classification": "CORE",
  "confidence": 0.92,
  "reasoning": "Contains explicit learning objectives and grading breakdown consistent 
               with course syllabus. No optional/supplementary indicators found."
}
```

**Confidence gating rules**: If the model outputs confidence <0.7, flag for human review. If `core_signals_found` is non-empty but classification is SUPPLEMENTARY, trigger automatic re-evaluation (this catches the hedging behavior directly).

## Strategy 5: Batch classification with distribution constraints

Research on RAG systems shows that **relative classification** within a document set produces better results than isolated document evaluation. Classify all documents together:

```
You will classify a SET of documents for a course. Your classifications must satisfy:
- At least 1 document MUST be CORE (courses always have core materials)
- Total CORE + IMPORTANT should be ≥50% of documents
- Use SUPPLEMENTARY only for clearly optional materials

For each document, provide classification with the signal that determined it:

Documents:
1. [Document A - first 500 chars or filename + summary]
2. [Document B - first 500 chars or filename + summary]
3. [Document C - first 500 chars or filename + summary]

Output format:
| # | Classification | Key Signal | Confidence |
|---|----------------|------------|------------|
```

This prevents the scenario where every document individually gets classified as SUPPLEMENTARY by imposing distribution constraints that force at least some CORE classifications.

## Recommended production prompt template

```
You are an expert curriculum designer classifying documents for an AI course 
generation platform. Your task is to categorize each document by its educational 
importance.

CATEGORIES (classify into exactly ONE):

**CORE**: Essential documents required for course completion
- Syllabi, course outlines, official requirements
- Primary textbooks or main instructional content  
- Exams, graded assignments, assessments
- Content with explicit learning objectives and grading criteria
- Signal keywords: "required", "must", "learning objectives", "assessment", "prerequisite"

**IMPORTANT**: Valuable supporting materials that reinforce learning
- Case studies and worked examples
- Practice exercises and worksheets (non-graded)
- Study guides and review materials
- Lab guides and tutorial content
- Signal keywords: "practice", "exercise", "case study", "apply", "review"

**SUPPLEMENTARY**: Optional reference and enrichment material
- Bibliographies and reading lists
- Appendices and glossaries
- Background readings marked as optional
- Extended reference tables
- Signal keywords: "optional", "recommended", "further reading", "appendix", "bibliography"

CLASSIFICATION RULES:
1. Default UP not down: When uncertain, choose the higher-priority category
2. Instructional content defaults to IMPORTANT minimum (never SUPPLEMENTARY unless 
   explicitly optional)
3. Any document with learning objectives = CORE or IMPORTANT, never SUPPLEMENTARY
4. SUPPLEMENTARY requires explicit optional indicators OR pure reference format

ANALYSIS PROCESS:
1. First, identify the document type from filename and content structure
2. List specific signals found for each category
3. Apply classification rules to determine category
4. Assign confidence level

DOCUMENT TO CLASSIFY:
Filename: {{filename}}
Content preview (first 2000 chars):
{{content_preview}}

OUTPUT (JSON):
{
  "detected_document_type": "string",
  "signals": {
    "core": ["signal1", "signal2"],
    "important": ["signal1"],
    "supplementary": []
  },
  "classification": "CORE | IMPORTANT | SUPPLEMENTARY",
  "confidence": 0.0-1.0,
  "primary_signal": "The specific feature that determined this classification"
}
```

## Evaluation criteria for classification quality

**Quantitative metrics**:
- **Label distribution entropy**: Measure whether classifications are reasonably distributed. If >80% fall into any single category, flag for prompt tuning
- **Precision/recall per category**: Track how often CORE documents are correctly identified as CORE (aim for >85% recall on CORE)
- **Confidence calibration**: Check if stated confidence correlates with actual accuracy

**Qualitative validation checklist**:
- Every course has at least one CORE document identified
- Syllabi are always classified as CORE (100% accuracy required)
- Documents with "optional" or "supplementary" in filename/content are classified as SUPPLEMENTARY
- Case studies and exercises are classified as IMPORTANT, not SUPPLEMENTARY

**Red flags indicating bias**:
- More than 60% of documents classified as SUPPLEMENTARY
- Syllabi or textbook chapters appearing in SUPPLEMENTARY
- Zero CORE classifications in any batch
- Classification changes significantly with prompt rewording (indicates low confidence)

## Implementation recommendations

**Temperature setting**: Use temperature **0.0-0.2** for deterministic, consistent classifications. Higher temperatures introduce unnecessary variation.

**Self-consistency voting**: For high-stakes classifications, sample **3-5 responses** and take majority vote. Research shows this reduces errors significantly, particularly for borderline cases.

**Calibration testing**: Before production, run your prompt on 20-30 known-label documents. If the model systematically misclassifies a category, add more few-shot examples for that category and strengthen the relevant signal descriptions.

**Monitoring in production**: Track classification distributions weekly. If SUPPLEMENTARY percentage creeps above 50%, investigate whether new document types are being misclassified and add examples to address gaps.

The core insight is that Claude's conservative classification isn't a bug in the model—it's a predictable behavior that can be systematically counteracted through balanced examples, feature-first reasoning, explicit distribution constraints, and "default up" instructions. The recommended prompt template combines all these techniques into a production-ready solution.