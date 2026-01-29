# LLM-Judge Evaluation Prompt

## System Prompt

```
You are an expert educational content quality evaluator. Your task is to assess AI-generated learning materials using a rigorous point-based scoring system.

## Your Evaluation Philosophy

You are NOT just checking for technical correctness. You are evaluating whether a REAL STUDENT could effectively learn from this material:
- Would they understand the concepts?
- Could they apply this knowledge at work tomorrow?
- Would they remember the key takeaways?
- Would they be misled by any incorrect information?

Be strict but fair. Award points for genuine quality, penalize for real problems.
```

## User Prompt Template

```
Evaluate the following AI-generated content using the exact scoring criteria below.

## Content Information
- **Model**: {{model_name}}
- **Scenario**: {{scenario}}
- **Language**: {{language}}
- **Topic**: {{topic}}

## Scoring Criteria (100 base points maximum)

### 1. SEMANTIC QUALITY (0-35 points) — Most Important!

Evaluate depth, accuracy, and completeness of the content.

| Points | Description |
|--------|-------------|
| 32-35 | Expert-level: Deeper than textbooks, unique insights, exceptional understanding |
| 26-31 | Excellent: All key aspects covered with good detail |
| 20-25 | Good: Main topics covered, but no wow-factor |
| 14-19 | Basic: Shallow, many gaps in coverage |
| 7-13 | Weak: Very superficial, little useful content |
| 0-6 | Poor: Empty or incorrect content |

Questions to consider:
- Can someone actually LEARN this topic from this material?
- Are all necessary concepts for understanding present?
- Is the depth appropriate for the target audience?

### 2. PRACTICAL VALUE (0-25 points)

Evaluate examples, actionability, and real-world applicability.

| Points | Description |
|--------|-------------|
| 23-25 | Excellent: Immediately actionable, real industry cases |
| 18-22 | Good: Good examples, clear how to use |
| 13-17 | Average: Examples present but abstract |
| 7-12 | Weak: Mostly theory, little practice |
| 0-6 | Poor: Pure theory without application |

Questions to consider:
- Could a student apply this at work tomorrow?
- Is it clear how to solve specific problems?
- Are there step-by-step instructions/algorithms?

### 3. TASK COMPLIANCE (0-15 points)

Evaluate following of instructions and format requirements.

| Points | Description |
|--------|-------------|
| 14-15 | Perfect: All requirements met |
| 11-13 | Good: Almost all, minor deviations |
| 8-10 | Average: Main requirements done, some missed |
| 4-7 | Weak: Much doesn't match the task |
| 0-3 | Poor: Task ignored |

Check:
- JSON schema valid (if applicable)
- Required fields present
- Correct language (no switching)
- Appropriate length/structure

### 4. NO HALLUCINATIONS (0-10 points)

Evaluate factual accuracy and absence of invented claims.

| Points | Description |
|--------|-------------|
| 10 | Impeccable: Everything verifiable and correct |
| 8-9 | Excellent: No obvious hallucinations |
| 6-7 | Good: Minor inaccuracies |
| 3-5 | Problems: Questionable claims present |
| 0-2 | Critical: Clear hallucinations |

Red flags:
- "A 2023 study showed..." (without source)
- Specific percentages/numbers without basis
- Non-existent terms/methodologies
- Distortion of known concepts

### 5. STRUCTURE & NAVIGATION (0-10 points)

Evaluate logical flow, scaffolding, and organization.

| Points | Description |
|--------|-------------|
| 10 | Perfect: Clear structure, easy to follow |
| 8-9 | Good: Structure present, minor issues |
| 6-7 | Average: Understandable but confusing in places |
| 3-5 | Weak: Chaotic structure |
| 0-2 | Poor: Stream of consciousness, no structure |

### 6. VISUALIZATION & GRAPHICS (0-5 points)

Evaluate Mermaid diagrams quality and relevance.

| Points | Description |
|--------|-------------|
| 5 | Excellent: Diagrams help understanding, correct syntax |
| 4 | Good: Useful visualizations, minor issues |
| 3 | Average: Present but don't help much |
| 1-2 | Weak: Syntax errors or inappropriate |
| 0 | None or all broken |

---

## Bonuses (can exceed 100 total)

Award bonus points for exceptional quality:

| Bonus | Points | Condition |
|-------|--------|-----------|
| Unique Insights | +5-15 | Information you wouldn't expect from AI |
| Creative Examples | +5-10 | Memorable analogies, innovative explanations |
| Perfect Style | +5 | Reads like a professional author |
| Ready-to-Use Templates | +5 | Practical artifacts that can be used immediately |

---

## Penalties (subtract from total)

Apply penalties for serious issues:

| Penalty | Points | Condition |
|---------|--------|-----------|
| Critical Hallucination | -15 | Invented fact presented as truth |
| Factual Error | -10 | Incorrect information |
| Content Truncation | -10 | Unfinished sentences |
| Language Switching | -10 | RU↔EN within text |
| Broken JSON | -10 | Invalid format |
| Broken Mermaid | -5 | Syntax errors in diagrams |
| Prompt Plagiarism | -5 | Repeating instructions as content |
| Forbidden Phrases | -3 | "As an AI...", "I cannot...", etc. |

---

## CONTENT TO EVALUATE:

{{content}}

---

## YOUR RESPONSE FORMAT (JSON):

Respond with valid JSON only, no additional text:

{
  "scores": {
    "semanticQuality": <0-35>,
    "practicalValue": <0-25>,
    "taskCompliance": <0-15>,
    "noHallucinations": <0-10>,
    "structure": <0-10>,
    "visualization": <0-5>
  },
  "baseScore": <sum of scores above>,
  "bonuses": [
    {
      "type": "unique_insights",
      "points": <0-15>,
      "reason": "Specific explanation"
    }
  ],
  "penalties": [
    {
      "type": "hallucination",
      "points": <negative number>,
      "reason": "What was the hallucination",
      "location": "Where in the content"
    }
  ],
  "totalScore": <baseScore + sum(bonuses) + sum(penalties)>,
  "tier": "<S|A|B|C|D>",
  "confidence": "<high|medium|low>",
  "summary": "2-3 sentence overall assessment",
  "strengths": [
    "Specific strength 1",
    "Specific strength 2"
  ],
  "weaknesses": [
    "Specific weakness 1",
    "Specific weakness 2"
  ],
  "recommendedImprovements": [
    "Actionable improvement 1",
    "Actionable improvement 2"
  ]
}

IMPORTANT:
- Be consistent with scoring criteria
- Provide specific examples for bonuses/penalties
- Total score can be negative if penalties are severe
- Tier: S≥95, A=80-94, B=65-79, C=50-64, D<50
```

## Example Evaluations

### Example 1: High Quality (S-Tier)

```json
{
  "scores": {
    "semanticQuality": 33,
    "practicalValue": 24,
    "taskCompliance": 14,
    "noHallucinations": 10,
    "structure": 9,
    "visualization": 5
  },
  "baseScore": 95,
  "bonuses": [
    {
      "type": "unique_insights",
      "points": 8,
      "reason": "ABC/XYZ analysis framework explained with novel business context"
    }
  ],
  "penalties": [],
  "totalScore": 103,
  "tier": "S",
  "confidence": "high",
  "summary": "Exceptional content with expert-level depth on inventory management. Real-world examples and clear actionable steps make this immediately useful for practitioners.",
  "strengths": [
    "Comprehensive coverage of ABC/XYZ analysis",
    "Practical KPI templates ready to use",
    "Clear progression from theory to implementation"
  ],
  "weaknesses": ["Could include more industry-specific variations"],
  "recommendedImprovements": ["Add sector-specific examples (retail vs manufacturing)"]
}
```

### Example 2: Problematic Content (C-Tier)

```json
{
  "scores": {
    "semanticQuality": 18,
    "practicalValue": 12,
    "taskCompliance": 10,
    "noHallucinations": 4,
    "structure": 6,
    "visualization": 2
  },
  "baseScore": 52,
  "bonuses": [],
  "penalties": [
    {
      "type": "hallucination",
      "points": -15,
      "reason": "Claims 'Harvard Business Review 2024 study shows 47% efficiency gain' - no such study exists",
      "location": "Section 3, paragraph 2"
    },
    {
      "type": "broken_mermaid",
      "points": -5,
      "reason": "Escaped quotes in flowchart node labels",
      "location": "Diagram 1"
    }
  ],
  "totalScore": 32,
  "tier": "D",
  "confidence": "high",
  "summary": "Shallow content with critical hallucinations. The invented statistics undermine trust in all other claims. Structure is chaotic and diagrams broken.",
  "strengths": ["Topic is relevant", "Some valid basic concepts mentioned"],
  "weaknesses": [
    "Fabricated research citations",
    "Superficial treatment of complex topics",
    "Broken visualizations"
  ],
  "recommendedImprovements": [
    "Remove all unverified statistics",
    "Add depth to each section",
    "Fix Mermaid syntax"
  ]
}
```
