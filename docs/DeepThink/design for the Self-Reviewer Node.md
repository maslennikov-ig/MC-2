Here is a comprehensive design for the **Self-Reviewer Node**.

This design prioritizes a **"Fail-Fast" architecture**. Since the Self-Reviewer uses a cheaper model, its primary job is to filter out "garbage" (truncated, broken, or wrong-language content) immediately, saving the expensive Judge tokens for nuanced pedagogical evaluation.

### 1. The Self-Reviewer Prompt

This prompt is designed to be system-injected. It uses **XML-style delimiters** to robustly separate instructions from the content, preventing "prompt injection" confusion when the lesson content contains its own headers.

**System Prompt:**

```markdown
# Role
You are the **Quality Assurance Sentinel** for an educational content pipeline.
Your goal is to validate generated lesson content against its specification and source materials.
You act as a gatekeeper: you must **REJECT** broken content, **FIX** minor hygiene issues, and **FLAG** semantic risks for human-like judges.

# Input Data
You will receive four inputs wrapped in XML tags:
1. `<TARGET_LANGUAGE>`: The ISO code (e.g., 'ru', 'en', 'zh').
2. `<LESSON_SPEC>`: The architectural blueprint (objectives, difficulty).
3. `<RAG_CONTEXT>`: Summary of source facts (ground truth).
4. `<LESSON_CONTENT>`: The generated JSON content to review.

# Evaluation Protocol (Execute in Order)
Perform these checks in strict sequence. Stop at the first status that applies.

## Phase 1: Integrity & Critical Failures (Status: REGENERATE)
Check for fatal errors that make the content unusable.
1. **Truncation**: Does the `<LESSON_CONTENT>` string end abruptly? Check if the JSON structure is closed properly (ends with `}`) and if the final text field ends with punctuation.
2. **Language Failure**: Is the content primarily in the wrong language?
   - *Constraint*: English/Latin technical terms (e.g., "API", "React", "var x = 1") are **ALLOWED** and expected in technical topics.
   - *Failure*: Random characters from unrelated scripts (e.g., Chinese characters in Russian text, Cyrillic in English) appearing pervasively.
3. **Empty Fields**: Are required sections (intro, conclusion) empty or filled with placeholders like "[Insert text here]"?

## Phase 2: Hygiene & Self-Repair (Status: FIXED)
If Phase 1 passes, scan for fixable surface issues.
1. **Chatbot Artifacts**: Phrases like "Sure, here is the lesson:", "As an AI...", or "In conclusion, I hope...".
2. **Script Pollution**: Isolated foreign characters (1-3 instances) that are NOT technical terms (e.g., a stray "的" or "Д" in English text).
3. **Markdown Syntax**: Unclosed bolding (`**text`), broken links, or malformed lists.
*Action*: If found, **repair** these issues directly in the content. Do NOT rewrite sections, only scrub the noise.

## Phase 3: Semantic Verification (Status: FLAG_TO_JUDGE)
If content is clean, check for deep issues that require Judge attention.
1. **LO Alignment**: Do the sections semantically address the IDs in `<LESSON_SPEC>`?
   - *Trigger*: If an LO is "Explain Photosynthesis" and the content is about "Geology", flag it.
2. **Hallucination Risk**: Does the lesson make specific factual claims (dates, formulas) that **contradict** `<RAG_CONTEXT>`?
   - *Note*: Absence of evidence is not a contradiction. Only flag direct conflicts.
3. **Logic Flow**: Are there obvious internal contradictions (e.g., Intro says "Beginner", Content is "Advanced")?

## Phase 4: Acceptance (Status: PASS / PASS_WITH_FLAGS)
- **PASS_WITH_FLAGS**: Content is good but has minor non-critical warnings (e.g., "Tone is slightly dry").
- **PASS**: Content is flawless.

# Output Format
Return **ONLY** a single valid JSON object.

```json
{
  "status": "PASS" | "PASS_WITH_FLAGS" | "FIXED" | "REGENERATE" | "FLAG_TO_JUDGE",
  "reasoning": "Concise explanation (max 2 sentences).",
  "issues": [
    {
      "type": "TRUNCATION" | "LANGUAGE" | "ALIGNMENT" | "HALLUCINATION" | "HYGIENE",
      "severity": "CRITICAL" | "FIXABLE" | "COMPLEX",
      "location": "section_id or 'intro'",
      "description": "Specific error details."
    }
  ],
  "patched_content": { ... } // Full LessonContent object if status is FIXED, otherwise null
}

```

```

**User Message (Dynamic Injection):**

```text
<TARGET_LANGUAGE>
{{target_language}}
</TARGET_LANGUAGE>

<LESSON_SPEC>
{{lesson_spec_json}}
</LESSON_SPEC>

<RAG_CONTEXT>
{{rag_context_summary}}
</RAG_CONTEXT>

<LESSON_CONTENT>
{{lesson_content_json}}
</LESSON_CONTENT>

```

---

### 2. Design Decisions & Rationale

| Feature | Design Decision | Rationale |
| --- | --- | --- |
| **Fail-Fast Hierarchy** | Truncation/Language checks are Phase 1 (Fatal). | If content is truncated, checking Learning Objectives is a waste of compute. We short-circuit to `REGENERATE` immediately to save costs. |
| **"Script Pollution" vs. Tech Terms** | Explicitly distinguish "Unrelated Scripts" from "Technical Terms". | A regex check often fails here. In a Russian Python course, English code is required. The LLM is context-aware enough to permit "code" while rejecting "noise." |
| **The `FIXED` Strategy** | Return the *full* JSON object, not a diff. | **Trade-off:** Higher output token cost (~1k tokens) vs. reliability. Applying JSON patches/diffs generated by LLMs is error-prone. Swapping the whole object is safe and keeps the pipeline code simple. |
| **"Chatbot Artifact" Removal** | Specific check in Phase 2. | "Smoother" nodes often leave conversational debris ("Here is your revised lesson..."). Catching and fixing this automatically avoids a round-trip to the expensive Judge. |
| **Flag vs. Reject** | LO Misalignment triggers `FLAG_TO_JUDGE`, not `REGENERATE`. | Cheap models may misunderstand subtle pedagogical goals. It is safer to flag potential misalignment for the smart Judge than to auto-reject potentially valid content. |

---

### 3. JSON Output Schema

This schema matches the prompt's output format and is ready for your Typescript definitions.

```typescript
type Status = "PASS" | "PASS_WITH_FLAGS" | "FIXED" | "REGENERATE" | "FLAG_TO_JUDGE";

interface SelfReviewResponse {
  status: Status;
  
  // Concise summary for logs/debugging
  reasoning: string;
  
  // Structured defect list
  issues: Array<{
    type: "TRUNCATION" | "LANGUAGE" | "ALIGNMENT" | "HALLUCINATION" | "HYGIENE";
    severity: "CRITICAL" | "FIXABLE" | "COMPLEX";
    location: string; // e.g., "intro", "sec_1", "exercise_2"
    description: string;
  }>;
  
  // If status === 'FIXED', this contains the FULL corrected content object.
  // The pipeline should overwrite the original content with this.
  // If status !== 'FIXED', this is null.
  patched_content: LessonContent | null;
}

```

---

### 4. Example Outputs

#### Scenario A: The "Money Saver" (Truncation)

**Context:** The generation hit a token limit and the JSON cuts off inside the `exercises` array.

```json
{
  "status": "REGENERATE",
  "reasoning": "The content is truncated. The JSON structure is incomplete in the exercises section.",
  "issues": [
    {
      "type": "TRUNCATION",
      "severity": "CRITICAL",
      "location": "exercises",
      "description": "Unexpected end of input while parsing JSON array; text ends abruptly."
    }
  ],
  "patched_content": null
}

```

*Pipeline Action:* Do not send to Judge. Trigger `Smoother` or `Expander` again (perhaps with higher token limit).

#### Scenario B: The "Janitor" (Auto-Fix)

**Context:** A Russian lesson on SQL. The content is good, but the intro starts with "Sure! Here is the lesson:" and there is a random Chinese character in Section 1.

```json
{
  "status": "FIXED",
  "reasoning": "Removed conversational AI filler from intro and isolated foreign character artifact in Section 1.",
  "issues": [
    {
      "type": "HYGIENE",
      "severity": "FIXABLE",
      "location": "intro",
      "description": "Removed phrase 'Sure! Here is the lesson:'"
    },
    {
      "type": "LANGUAGE",
      "severity": "FIXABLE",
      "location": "sec_1",
      "description": "Removed Chinese character '的' from Cyrillic text."
    }
  ],
  "patched_content": {
    "intro": "SQL (Structured Query Language) - это стандартный язык...",
    "sections": [ ... ],
    "examples": [ ... ],
    "exercises": [ ... ]
  }
}

```

*Pipeline Action:* Update content in DB with `patched_content`. Proceed to Judge.

#### Scenario C: The "Whistleblower" (Flag to Judge)

**Context:** The lesson looks fine, but the Reviewer notices it explains "Photosynthesis" when the Learning Objective was "Cellular Respiration".

```json
{
  "status": "FLAG_TO_JUDGE",
  "reasoning": "Major misalignment detected between content and Learning Objective LO2.",
  "issues": [
    {
      "type": "ALIGNMENT",
      "severity": "COMPLEX",
      "location": "sec_2",
      "description": "LO2 requires explanation of 'Cellular Respiration', but Section 2 covers 'Photosynthesis'."
    }
  ],
  "patched_content": null
}

```

*Pipeline Action:* Send to Judge, but append the `issues` list to the Judge's prompt. This "primes" the Judge to look exactly where the problem is.

---

### 5. Potential Improvements (v2)

If this implementation works well, here are logical next steps:

1. **Diff-Based Patching**: If your lessons are very long (>2000 tokens), returning the full `patched_content` is expensive. You could switch to returning a **JSON Patch (RFC 6902)** (e.g., `[{"op": "replace", "path": "/intro", "value": "New text"}]`). This requires a robust patch applier on your backend but reduces output tokens by ~90%.
2. **RAG Fact-Checking Tool**: If factual accuracy is critical, give the Self-Reviewer a "tool" (function calling) to perform vector searches. Instead of relying on the provided `RAG_CONTEXT` (which is a static summary), the reviewer could query: `verify_claim(claim="The capital of France is Mars")`.
3. **Tone Archetype Check**: Add a `content_archetype` field to the Spec (e.g., "Professional", "Playful", "Socratic"). Instruct the Self-Reviewer to flag content that drifts from this persona.