# Optimal architecture for LLM-powered course editing

**A hybrid pipeline-plus-tools architecture—combining cheap intent classification, targeted context selection, and Immer-based undo—can cut your token costs by 87% while solving every known bug in your current system.** The most successful production AI editors (Cursor, Notion AI, GitHub Copilot) have converged on a pattern where a lightweight classifier routes requests to specialized handlers, each receiving only the context they need. Your current approach of sending 42K tokens per request with no structured proposal system for Stage 6 is both expensive and brittle. The recommended migration requires three phases over roughly 2–3 weeks and leverages your existing Supabase/tRPC stack without introducing heavy new dependencies.

---

## How Cursor, Notion, and Google solved this problem

Production AI editing tools have split into two camps: **agentic tool-calling systems** (Cursor, Notion AI, GitHub Copilot) and **simple generate-and-replace systems** (Google Docs, Jasper, Copy.ai). The distinction matters because your course editor sits between these worlds—it needs structural operations (add/delete/move lessons) that demand tool-calling precision, but also content generation (rewrite markdown) where simpler generation works fine.

**Cursor's "Sketch + Apply" two-model architecture** is the most instructive pattern. A powerful LLM generates a "semantic diff"—a simplified representation of intended changes using comments to mark unchanged regions. A separate, cheaper, faster model then takes this sketch and writes the actual file. If linting fails, the main agent self-corrects. This separation is critical: **the reasoning model focuses on _what_ to change while a specialized model handles _how_ to apply it**. Cursor also keeps its entire system prompt static to maximize prompt caching, reducing both cost and time-to-first-token.

**Notion AI rebuilt its entire stack** for agentic AI in 2024–2025, moving from task-specific prompt chains to a central reasoning model coordinating modular sub-agents. Notion's block-based architecture gives it a structural advantage—every paragraph is a typed block with metadata and relationships, not just raw text. The AI can reason about workspace structure rather than just matching keywords. Notion routes different tasks to different models: high-reasoning models for complex writing, specialized fine-tuned models for database operations (cutting latency in half), and large-context models for Q&A requiring workspace history.

**Google Docs takes the simplest approach**: Gemini with a 1M+ token context window simply ingests entire documents. No RAG, no chunking—just put everything in context. Generated text appears in a floating window with Insert/Replace/Close options. This works for Google because their context windows are enormous and their documents are flat text, but it doesn't translate well to hierarchical structured content like courses. The lesson here is that **simpler approaches work when your content model is simple**; your hierarchical course structure demands more sophisticated routing.

The content marketing tools (Jasper, Copy.ai) use template-driven generation with brand context via RAG—not agentic at all. They generate text that users accept or reject wholesale, with no diff view. Their contribution is the concept of **contextual quick actions**: buttons that change based on what you're doing (writing → "expand," editing → "rewrite," reviewing → "simplify").

---

## The recommended hybrid pipeline architecture

The optimal architecture for your course editor is a **hybrid pipeline-plus-tools** system that combines cheap intent classification with targeted context loading and structured tool execution. This avoids the fragility of single-call approaches while keeping latency manageable.

```
User Message
    │
    ▼
┌──────────────────────────────────┐
│ Step 1: Intent Classification     │  ← GPT-4.1-mini / Haiku (~1K tokens, ~200ms)
│ • Classify into 10-15 intents    │
│ • Extract target reference        │
│ • Confidence score (0-1)          │
└──────┬───────────────┬───────────┘
       │ ≥ 0.75        │ < 0.75
       ▼               ▼
   ┌───────┐    Ask Clarification
   │Step 2 │    (with clickable options)
   └───┬───┘
       ▼
┌──────────────────────────────────┐
│ Step 2: Reference Resolution      │  ← Deterministic (no LLM needed)
│ • Fuzzy match against course tree │
│ • Positional reference parsing    │
│ • Chat history context boost      │
└──────┬───────────────┬───────────┘
       │ Resolved      │ Ambiguous
       ▼               ▼
   ┌───────┐    Present top-3 options
   │Step 3 │
   └───┬───┘
       ▼
┌──────────────────────────────────┐
│ Step 3: Route to Handler          │
│ • Field updates → direct mutation │
│ • Content rewrite → LLM + schema  │
│ • Structural change → logic+confirm│
│ • Info query → LLM with skeleton  │
└──────┬───────────────────────────┘
       ▼
┌──────────────────────────────────┐
│ Step 4: Generate via Structured   │  ← Sonnet/DeepSeek (~8K tokens)
│ Output (Zod schema enforcement)   │     Only receives skeleton + target
│ • Validate paths against schema   │
│ • Retry up to 3x with error feedback│
└──────┬───────────────────────────┘
       ▼
┌──────────────────────────────────┐
│ Step 5: Snapshot + Apply + Verify │
│ • Immer produceWithPatches()      │
│ • Save version to course_versions │
│ • Optimistic UI update            │
│ • Persist to Supabase             │
└──────────────────────────────────┘
```

**Why this beats the current architecture**: Your current system uses a single LLM call for everything in Stage 5 (classification + generation + proposal) while Stage 6 has no structured output at all. The pipeline approach lets you use a **$0.0008 classification call** to avoid wasteful $0.126 full-context generation calls. It isolates failures—a misclassification doesn't waste expensive generation tokens, and a generation error doesn't corrupt your intent understanding.

The key architectural decision is **separating intent classification from content generation**. Research consistently shows this outperforms single-call approaches. Anthropic's own "Building Effective Agents" guide notes that most teams find optimizing single LLM calls sufficient for simple tasks, but compound tasks require decomposition. The pipeline also enables a critical optimization: **the classifier needs only the user message plus recent chat history (~1K tokens), not the full 42K course structure**.

---

## Context management cuts costs by 87%

Your biggest immediate win is **context windowing**. Instead of sending the full course structure with every request, send a skeleton outline (~2–3K tokens) plus the full content of only the targeted section (~3–8K tokens). This "table of contents plus detail" approach mirrors how Cursor handles large codebases—index everything, load only what's relevant.

The skeleton should always be included so the LLM maintains structural awareness:

```
COURSE: "Introduction to Machine Learning" (4 sections, 16 lessons)
├─ S1: Fundamentals (4 lessons) — Basics of ML concepts
├─ S2: Supervised Learning (5 lessons) — Classification and regression  [EDITING]
│  ├─ L1: Linear Regression (id: s2-l1)
│  ├─ L2: Logistic Classification (id: s2-l2)  ← [TARGET]
│  ├─ L3: Decision Trees (id: s2-l3)
│  └─ ...
├─ S3: Unsupervised Learning (4 lessons)
└─ S4: Neural Networks (3 lessons)

FULL CONTENT for S2.L2:
[complete markdown here]
```

**Prompt caching amplifies these savings dramatically.** Anthropic offers **90% discount** on cached input tokens (vs. OpenAI's 50%). The skeleton and system instructions form a stable prefix that gets cached across requests in the same editing session. Structure your prompts with static content first (system instructions → tool definitions → course skeleton) and dynamic content last (target content → conversation history → user message).

| Approach                       | Tokens/request     | Monthly cost (100 req/day) |
| ------------------------------ | ------------------ | -------------------------- |
| Current (full 42K every time)  | 42,000             | ~$378                      |
| Skeleton + targeted context    | ~10,000            | ~$93                       |
| + Prompt caching               | ~10K (3.5K cached) | ~$75                       |
| + Intent router on cheap model | ~1K + ~8K          | ~$48                       |

**Total potential savings: $378 → $48/month (87% reduction).** The skeleton-plus-target approach alone gets you 75% savings with minimal code changes—this should be your first implementation priority.

For conversation memory, implement a **sliding window plus summarization** pattern. Keep the last 5 messages verbatim (~1–2K tokens) and maintain a running summary of older messages (~200–500 tokens). Store this in a `chat_sessions` table with a `summary` column that gets updated when the conversation exceeds a token threshold. This gives the LLM enough context to handle references like "undo that last change" without loading the entire conversation history.

---

## ID-based change representation with Immer undo

The research is clear: **LLMs struggle with array index arithmetic**. The "JSON Whisperer" paper (2025) found that LLMs generating RFC 6902 patches frequently botch index shifts—after removing element at index 2, they fail to adjust subsequent indices and conflate 0-based with 1-based indexing. Your current custom path notation (`sections[0].lessons[1].lesson_title`) inherits this vulnerability.

The fix is **ID-based operations**. Have the LLM reference elements by stable identifiers (lesson UUIDs or human-readable IDs like "s2-l3"), then resolve these to array indices in application code. Define a discriminated union schema in Zod:

```typescript
const ChangeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_field'),
    targetId: z.string(),
    field: z.enum(['title', 'description', 'objectives', 'duration', 'key_topics']),
    value: z.any(),
  }),
  z.object({
    type: z.literal('rewrite_content'),
    lessonId: z.string(),
    sectionTitle: z.string().optional(),
    newContent: z.string(),
  }),
  z.object({
    type: z.literal('add_item'),
    parentId: z.string(),
    position: z.number().optional(),
    item: z.object({ title: z.string(), content: z.string().optional() }),
  }),
  z.object({
    type: z.literal('remove_item'),
    targetId: z.string(),
  }),
  z.object({
    type: z.literal('move_item'),
    targetId: z.string(),
    newParentId: z.string(),
    newPosition: z.number(),
  }),
]);
```

**For undo, use Immer's `produceWithPatches`**—it generates both forward and inverse patches automatically, giving you free undo without snapshots:

```typescript
const [nextState, patches, inversePatches] = produceWithPatches(currentCourse, draft => {
  /* apply LLM changes to draft */
});
undoStack.push({ patches, inversePatches, timestamp: Date.now() });
// To undo: applyPatches(currentState, undoEntry.inversePatches)
```

Back this with a **database version table** in Supabase for cross-session undo and audit trail. Store the course snapshot, forward patches, inverse patches, and the user's original instruction. A PostgreSQL trigger can auto-create version records before each update. This two-layer approach (Immer for instant client-side undo, database for durable history) is both practical and robust. OT and CRDTs are overkill—they solve concurrent multi-user editing, which isn't your problem.

---

## Solving the six known bugs

Each of your current known problems maps directly to a component of the recommended architecture:

**Empty chat responses** stem from the LLM returning whitespace or malformed output. The fix is threefold: use OpenAI's strict structured output mode or Anthropic tool use with `input_schema` (which guarantees valid JSON at the token level), implement a `has_yielded_content` check that triggers automatic retry with error feedback (up to 3 attempts), and show a graceful fallback message ("I had trouble with that request—could you try rephrasing?") rather than a blank bubble.

**Changes not applied** is likely a deep-clone or path-resolution bug in your current immutable update logic. Replacing the manual `parsePath → setAtPath` chain with **Immer's draft-based mutations** eliminates this entire class of errors. Immer handles structural sharing correctly and throws on invalid paths rather than silently failing. After applying changes optimistically to the UI, persist to Supabase and rollback on failure.

**Stage 6 lacking structured proposals** is solved by extending the same Zod-schema-based generation pipeline to lesson content. Define a `LessonContentChange` schema that outputs the target lesson ID, target section title, and new markdown content. The LLM generates structured output instead of free-form text, and the same proposal → preview → accept flow applies.

**No multi-turn context** is addressed by the sliding-window-plus-summarization memory system described above, backed by `chat_sessions` and `chat_messages` tables in Supabase.

**High token cost** drops by 87% with the skeleton-plus-target context strategy and prompt caching.

**No undo/rollback** is solved by the Immer inverse patches (client-side) plus database version table (server-side) approach.

---

## UX patterns that build user trust

The most critical UX principle from studying production AI editors is **preview before commit**. Cursor's user acceptance rates dropped from 84% to 57% when users couldn't see enough context around changes. Always show proposed changes as a suggestion layer with sufficient surrounding context, never overwrite directly.

For your course editor, implement **progressive disclosure** across four levels. A toast notification ("✓ 3 changes applied to Module 2" with an Undo button) handles the 80% case where users trust the AI. Clicking expands to a summary list of specific changes. Clicking any change reveals the full before/after diff. A history panel provides the complete audit trail with revert capabilities.

**Use a single unified chat with smart context switching**, not separate chat instances per editing level. The chat should display a scope indicator badge ("Editing: Lesson 3 — Neural Networks") that updates automatically as users navigate the course tree. Quick action buttons should adapt to the current level: course-level shows "Add module" and "Reorder sections," lesson-level shows "Expand content," "Add quiz," and "Simplify language." Research shows these quick actions reduce interaction time from 30–60 seconds (typing a prompt) to 1–2 seconds.

For **clarification**, prefer structured follow-up questions with clickable options over open-ended asks. Instead of "Which lesson do you mean?", present: "Did you mean: (A) Lesson 2: Linear Regression, (B) Lesson 5: ML Applications?" with buttons. For **non-destructive operations** with high confidence, adopt the "assume and disclose" pattern: execute the likely intent but show what was assumed—"I shortened this lesson by ~30%. Would you prefer a different amount?"

---

## Three-phase migration path

**Phase 1 (3–5 days, immediate impact):** Implement the skeleton-plus-target context strategy to cut tokens from 42K to ~10K per request. Enable prompt caching by restructuring prompts with static prefix. Add Zod schema validation to Stage 5 proposal generation. Extend structured proposal generation to Stage 6. Add empty-response detection with automatic retry. These changes alone solve the token cost problem and the empty-response bug while establishing the foundation for everything else.

**Phase 2 (5–7 days, core architecture):** Add the lightweight intent classifier as a separate first step using a cheap model. Build the reference resolution system with fuzzy title matching and positional parsing. Replace manual deep-clone logic with Immer's `produceWithPatches` for both application and undo. Create the `course_versions` table and auto-snapshot trigger. Implement conversation memory with the sliding-window-plus-summarization pattern. This phase solves the undo, multi-turn context, and changes-not-applied bugs.

**Phase 3 (5–7 days, UX polish):** Build the inline diff preview component (gray strikethrough for deletions, blue highlight for additions). Add the progressive disclosure system (toast → summary → diff → history). Implement context-aware quick action buttons. Add the clarification card component with clickable options. Build the change history panel with selective revert. This phase transforms the user experience from a bare chat into a professional editing environment.

The key libraries for this stack are **Immer** (immutable updates + inverse patches), **Zod** (schema validation + LLM structured output), **fast-json-patch** (RFC 6902 application and validation), the **Vercel AI SDK** (`generateObject()` with Zod schemas that works with OpenAI, Anthropic, and OpenRouter), and **Supabase's built-in pgvector** if you later need semantic search. No heavy frameworks like LangChain are necessary—the pipeline is simple enough to build with direct API calls through the Vercel AI SDK.

## Conclusion

The core insight from studying production AI editors is that **the editing problem is not primarily an LLM problem—it's a systems engineering problem**. Cursor doesn't succeed because it uses better models; it succeeds because its two-model architecture, static prompt caching, and tool-calling pipeline turn unreliable LLM outputs into reliable code edits. Your course editor needs the same treatment: a cheap classifier to avoid wasting expensive tokens, ID-based change representation to dodge LLM arithmetic failures, Immer for bulletproof undo, and structured output schemas to eliminate malformed responses. The 87% cost reduction from context optimization alone justifies the migration, and the architectural improvements resolve every known bug in the current system. Start with Phase 1's context windowing—it's the highest-impact, lowest-risk change and will immediately validate the approach.
