# Surgical JSON editing via LLM chat: a production playbook

**The single most important insight across all seven research areas is this: never let an LLM address elements by array index.** Production systems from Notion to Figma converge on ID-based, flat-relational structures with fractional ordering — a pattern that eliminates the cascading-update problem entirely and reduces LLM hallucination by an order of magnitude. The JSON Whisperer paper (Lightricks, Oct 2025) confirmed what practitioners already knew: LLMs consistently miscalculate index shifts after insertions and deletions, and confuse zero-based with one-based indexing. Their EASE encoding (converting arrays to keyed dictionaries) improved patch accuracy dramatically, but the better approach for a greenfield system is to skip nested JSON for structure altogether and use a flat node table with stable IDs and fractional order keys.

This report covers seven interlocking implementation areas for a Next.js 15 + Supabase + tRPC + OpenRouter course editing platform, with concrete TypeScript patterns, library recommendations, and cost analysis throughout.

---

## 1. Why production platforms avoid nested JSON for tree operations

**Notion, Outline, and GitBook all store hierarchy relationally, not as nested JSON.** Notion's architecture is particularly instructive: every piece of content is a "block" stored as a flat row in sharded PostgreSQL (96 servers, 480 shards, 200+ billion blocks as of mid-2023). Each block has a globally unique ID, a type, properties, and a `content` array that lists child block IDs. The tree structure emerges from these parent-child references, not from JSON nesting. Structural edits — add, delete, move, reorder — are expressed as transactions containing operations that modify ID arrays, never as surgical updates to deeply nested JSON.

PostgreSQL's `jsonb_set()` becomes painful for array manipulation within nested structures. There is no built-in "insert at index" for nested arrays, and removing by value requires converting to PostgreSQL arrays, filtering, and converting back. The recommended schema for your course platform flips this:

```sql
CREATE TABLE course_nodes (
  id TEXT PRIMARY KEY,             -- nanoid with prefix: sec_hY7a3fRx
  course_id UUID REFERENCES courses(id),
  parent_id TEXT REFERENCES course_nodes(id),
  type TEXT CHECK (type IN ('section', 'lesson', 'content')),
  order_key TEXT NOT NULL,          -- fractional index string
  title TEXT NOT NULL,
  data JSONB DEFAULT '{}'           -- flexible content as JSON
);
```

Structural operations become trivial SQL: `INSERT` for add, `DELETE` for remove, `UPDATE parent_id + order_key` for move, `UPDATE order_key` for reorder. Content stays flexible as JSONB in the `data` column. Reconstruct the nested tree in your tRPC handler with a simple `ORDER BY order_key` query and a grouping loop.

### Fractional indexing eliminates renumbering forever

When inserting a lesson at position 2 in a section with 5 lessons using integer positions, all items at positions 2-4 need renumbering — an O(n) update. **Fractional indexing**, proven at Figma scale, eliminates this entirely. The `fractional-indexing` npm package (by Rocicorp, **1.17M weekly downloads**) generates lexicographically sortable string keys:

```typescript
import { generateKeyBetween } from 'fractional-indexing';

// Insert between "a1" and "a2" → "a1V" (single write, no renumbering)
const newKey = generateKeyBetween('a1', 'a2');

// Bulk insert 3 items between positions
const keys = generateNKeysBetween('a1', 'a2', 3); // ["a1G", "a1V", "a1l"]
```

Every structural operation becomes **O(1) writes**: insert generates one key between neighbors, move generates one key at the new position, delete just removes the row. PostgreSQL's `ORDER BY order_key ASC` handles sorting. This is the same technique Linear and Figma use in production.

If you must keep nested JSON (not recommended), the JSON Whisperer's EASE encoding converts arrays to dictionaries with stable two-character keys and a `display_order` string. This made LLM-generated patches match full-regeneration quality while using **31% fewer tokens**.

---

## 2. Three-tier intent classification saves 3× on LLM costs

**No major production AI editor currently performs fully automatic intent classification for edit scope.** Cursor uses implicit classification via tool selection (the LLM picks `search_replace` for surgical edits vs `write_to_file` for rewrites). Notion AI offers explicit mode choices. This represents a significant opportunity for a better UX pattern.

The recommended architecture uses three tiers that progressively escalate in cost and capability:

**Tier 1 — Regex heuristics (0ms, $0, handles ~40-50% of requests).** Pattern-matching catches obvious cases without any LLM call. "Delete section 3" is clearly surgical; "make this course about Python instead" is clearly full regeneration. A well-crafted set of 15-20 regex patterns covers the most common editing intents:

```typescript
const SURGICAL_PATTERNS = [
  /\b(delete|remove)\b.*\b(section|lesson)\b/i,
  /\b(rename|retitle)\b/i,
  /\b(move|reorder|swap)\b.*\b(section|lesson|before|after)\b/i,
  /\bchange\b.*\b(title|name)\b.*\bto\b/i,
];

const FULL_REGEN_PATTERNS = [
  /\b(completely|entirely)\b.*\b(redo|rewrite|overhaul)\b/i,
  /\b(start\s+over|from\s+scratch)\b/i,
  /\bmake\s+(this|it)\s+about\b/i,
];
```

**Tier 2 — Cheap LLM classifier (~200-500ms, ~$0.00005/call).** For messages that don't match heuristics, a GPT-4.1 Nano call ($0.10/M input tokens) classifies intent into `surgical | partial_regenerate | full_regenerate | clarification_needed` with a confidence score. This model is explicitly designed by OpenAI for classification tasks. Using Vercel AI SDK v6's `Output.object()` with a Zod schema ensures structured output:

```typescript
const { output } = await generateText({
  model: openrouter('openai/gpt-4.1-nano'),
  output: Output.object({
    schema: z.object({
      intent: z.enum(['surgical', 'partial_regenerate', 'full_regenerate', 'clarification_needed']),
      confidence: z.number().min(0).max(1),
      targetSection: z.string().optional(),
    }),
  }),
  system: classifierSystemPrompt,
  prompt: userMessage,
  temperature: 0,
});
```

**Tier 3 — Routed generation model.** Based on the classified intent: surgical edits route to GPT-4.1-mini ($0.40/M input), partial regeneration routes to Claude Sonnet 4 or GPT-4.1, and full regeneration uses the same premium models. For ambiguous requests (confidence below **0.6** — the industry-standard clarification threshold used by Amazon Lex and most production systems), the system asks a targeted clarification question. The safe default for truly ambiguous requests like "make it better" is `partial_regenerate`, which preserves structure while allowing meaningful improvement.

For a platform processing 10,000 edit messages per day, this three-tier architecture costs approximately **$36/day** compared to **$100+/day** if every request hit an expensive model — a 3× cost reduction.

### Tool-based routing as an alternative

Vercel AI SDK supports defining tools like `surgical_edit`, `partial_regenerate`, and `full_regenerate`, letting the LLM choose which tool to invoke. This approach is simpler (one call instead of two) but ties classification to the expensive generation model and makes debugging harder. For production, **explicit classification with a cheap model is superior** — it's more debuggable, allows different generation models per intent, and costs less.

---

## 3. Stable IDs that are both token-efficient and LLM-accurate

### Token cost of IDs is a hidden multiplier

A course structure with 50 lessons, each referenced 3-4 times in context, means **150-200 ID occurrences per LLM call**. BAML's research showed that UUID v4 costs approximately **24 tokens each** in the OpenAI tokenizer, while a 3-digit integer costs **1 token**. More critically, LLMs make dramatically more errors with high-entropy IDs: experiments with 200 items showed **29-68 errors with UUIDs vs 5-7 errors with integers**.

The recommended approach uses two ID representations:

- **Storage IDs**: `nanoid(8)` with type prefix — `sec_hY7a3fRx`, `les_kM9b2cQw` (~3-4 tokens, sufficient entropy for single-course collision safety)
- **LLM-facing IDs**: Sequential remapping — `sec_1`, `les_3` (~1-2 tokens, zero ambiguity)

The server remaps between representations before sending context to the LLM and after receiving operations back. This is the pattern BAML and Prosus AI both independently validated, yielding **95.6% token reduction** on IDs specifically.

### The LLM must never generate IDs

**Server generates all real IDs; the LLM uses placeholder references.** When the LLM needs to create new elements and reference them within the same operation batch, it uses placeholders like `__new_1__`, `__new_2__`:

```typescript
// LLM generates:
{ type: "add_section", id: "__new_1__", title: "Introduction to React" }
{ type: "add_lesson", parentId: "__new_1__", id: "__new_2__", title: "What is JSX?" }

// Server resolves placeholders to real IDs before persisting:
function resolvePlaceholders(ops: CourseOperation[]): CourseOperation[] {
  const map = new Map<string, string>();
  return ops.map(op => {
    if (op.id?.startsWith('__new_')) {
      const realId = generatePrefixedId(op.type); // sec_hY7a3fRx
      map.set(op.id, realId);
      op.id = realId;
    }
    // Resolve all reference fields through the same map
    for (const key of ['parentId', 'targetId', 'afterId']) {
      if (op[key] && map.has(op[key])) op[key] = map.get(op[key]);
    }
    return op;
  });
}
```

### Migration path for existing data

A three-phase migration adds IDs without breaking existing schemas: (1) make `id` optional in the type, (2) backfill all existing records with generated IDs (either via a Supabase migration or lazy-on-read), (3) make `id` required once backfill is complete. Track progress with a `schemaVersion` field on each course document.

For human-readable references, include both display indices and stable IDs when sending structure to the LLM: `Section 1 [sec_1]: "Introduction to React"`. This lets users say "Section 2, Lesson 3" while the LLM references `les_5`. The server resolves natural language references using regex for pattern matches (`/section\s*(\d+)/i`) and `fuse.js` for fuzzy title matching.

---

## 4. Operation schemas that LLMs can actually follow

### Discriminated unions with Zod minimize hallucination

The operation schema is the contract between your LLM and your application logic. **Flat discriminated unions with a `type` literal field** are the most reliable format for LLM-generated structured output. Key design principles validated across multiple sources:

- Use `z.discriminatedUnion('type', [...])` for O(1) parsing and clear LLM guidance
- Prefer `.nullable()` over `.optional()` — Vercel Academy confirms that explicitly requiring a field but allowing null yields more reliable results from LLMs than making it optional
- Add `.describe()` on every field to give the LLM semantic context
- Keep the union flat — don't nest discriminated unions
- **Minimize operation types** — 8-10 well-designed types cover all course editing needs

```typescript
const CourseOperation = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add_lesson'),
    reasoning: z.string().describe('Why this change is being made'),
    id: z.string().describe('Placeholder ID like __new_1__'),
    parentId: z.string().describe('ID of the parent section'),
    title: z.string(),
    afterId: z
      .string()
      .nullable()
      .describe('Insert after this lesson ID, or null for first position'),
  }),
  z.object({
    type: z.literal('update_lesson'),
    reasoning: z.string(),
    targetId: z.string().describe('ID of the lesson to update'),
    title: z.string().nullable().describe('New title or null to keep unchanged'),
    content: z.string().nullable().describe('New content or null to keep unchanged'),
  }),
  z.object({
    type: z.literal('delete_lesson'),
    reasoning: z.string(),
    targetId: z.string().describe('ID of the lesson to delete'),
  }),
  z.object({
    type: z.literal('move_lesson'),
    reasoning: z.string(),
    targetId: z.string(),
    newParentId: z.string().describe('Destination section ID'),
    afterId: z.string().nullable().describe('Insert after this ID in destination'),
  }),
  // ... similar for sections and content blocks
]);

const CourseEditResponse = z.object({
  operations: z.array(CourseOperation).max(15),
  summary: z.string().describe('Human-readable summary of all changes'),
});
```

Note that operations reference elements by **ID, not by path or index** — the LLM copies IDs it sees in context rather than counting array positions. This plays to LLM strengths (pattern matching) rather than weaknesses (arithmetic).

### Three-layer safety prevents destructive operations

**Layer 1 (schema-level):** The schema simply doesn't include a `delete_all` or `replace_course` operation type. `z.array().max(15)` caps batch size. Enum constraints on `blockType` prevent arbitrary content types.

**Layer 2 (pre-flight validation):** Before applying any operation, validate that all referenced IDs exist, positions are within bounds, and safety rules are met (max 3 deletes per batch, no deleting >50% of content in one batch, protected elements list).

**Layer 3 (human confirmation):** Delete operations show a confirmation UI. Operations touching >5 elements require explicit user approval. Content replacements show a diff before applying.

### Structured output across providers

**Vercel AI SDK v6 with `@openrouter/ai-sdk-provider` is the clear winner** for enforcing operation schemas across models. It abstracts provider differences, supports Zod schemas natively with `.describe()` hints, and includes a `response-healing` plugin that fixes malformed JSON from weaker models. For models that don't support `json_schema` mode (some DeepSeek/Qwen variants), the SDK falls back to JSON mode or prompt-based schema instruction automatically.

```typescript
import { generateText, Output } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const { output } = await generateText({
  model: openrouter('deepseek/deepseek-chat'),
  output: Output.object({ schema: CourseEditResponse }),
  system: buildEditingSystemPrompt(course),
  prompt: userMessage,
});

// output is fully typed as CourseEditResponse
const validated = validateOperationBatch(output.operations, course);
if (!validated.valid) return { error: validated.errors };
```

OpenAI's Structured Outputs has a known issue with bare `discriminatedUnion` schemas at the root level — always wrap in an object (the `CourseEditResponse` pattern above handles this).

---

## 5. Model routing that reads from Supabase and degrades gracefully

### OpenRouter handles provider-level routing; you handle task-level routing

OpenRouter's native `models` array parameter provides ordered fallback across models, and `provider.sort` routes by `price`, `latency`, or `throughput` at the provider level. The response's `model` field reveals which model actually served the request. **Don't add Portkey or LiteLLM** — they add complexity when OpenRouter already handles provider-level failover, health monitoring, and load balancing.

What you build on top is **task-level routing**: which model for which task type, configured in Supabase with hardcoded fallbacks for when the database is unreachable.

```sql
CREATE TABLE task_model_routing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,           -- 'intent_classification', 'surgical_edit', 'content_generation'
  model_config_id UUID REFERENCES model_configs(id),
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(task_type, priority)
);
```

The TypeScript model router reads from this table with a **60-second in-memory cache** and falls back to hardcoded defaults (`FALLBACK_ROUTING`) when the database is unreachable. This gives you admin-panel configurability for model selection without code deploys, while guaranteeing the system never stops working due to a database blip.

### Circuit breakers with cockatiel

**`cockatiel`** (~1M weekly downloads, zero dependencies, native TypeScript) is the recommended circuit breaker library over `opossum`. It provides composable policies — retry, circuit breaker, timeout, bulkhead — that chain together cleanly:

```typescript
import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  retry,
  circuitBreaker,
  timeout,
  wrap,
  handleAll,
} from 'cockatiel';

const policy = wrap(
  timeout(30_000, TimeoutStrategy.Aggressive),
  retry(handleAll, { maxAttempts: 2, backoff: new ExponentialBackoff() }),
  circuitBreaker(handleAll, {
    halfOpenAfter: 30_000,
    breaker: new ConsecutiveBreaker(3), // Open after 3 consecutive failures
  })
);
```

Maintain a per-model circuit breaker Map so that one model's failures don't block calls to other models. When the primary model's circuit breaker opens, automatically route to the next model in the fallback chain.

---

## 6. The complete library toolkit

After evaluating dozens of packages across seven categories, here are the winners for this specific stack:

| Category              | Package                              | Weekly Downloads | Why It Wins                                                                          |
| --------------------- | ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------ |
| JSON diffing          | `fast-json-patch`                    | 5.3M             | RFC 6902 compliant, LCS array diffs, use with immer for undo                         |
| State + undo          | `immer` (keep)                       | 12M+             | `produceWithPatches()` gives inverse patches for free                                |
| Ordering              | `fractional-indexing`                | 1.17M            | Figma-proven, O(1) reorder, zero renumbering                                         |
| Structured LLM output | `ai` + `@openrouter/ai-sdk-provider` | millions         | Native tRPC/Zod integration, OpenRouter-maintained                                   |
| Schema validation     | `zod` (keep)                         | 28M+             | tRPC + AI SDK lock-in; use Zod Mini v4 if bundle matters                             |
| Diff visualization    | `jsondiffpatch`                      | 500K+            | Array-aware diffs with `objectHash: obj => obj.id`, built-in HTML formatter          |
| Fuzzy matching        | `fuse.js`                            | 5.4M             | No indexing needed for 50-200 items, weighted search, battle-tested                  |
| ID generation         | `nanoid`                             | 61M+             | 130-byte bundle, `customAlphabet('0-9a-z', 8)` for token-efficient IDs               |
| Circuit breaker       | `cockatiel`                          | 1M               | TypeScript-native, composable policies, zero deps                                    |
| Token counting        | `gpt-tokenizer`                      | growing          | Pure TS, synchronous, all OpenAI encodings, `countTokens()` + `isWithinTokenLimit()` |

**Total new dependencies: 6 lightweight packages** (fast-json-patch, fractional-indexing, jsondiffpatch, fuse.js, cockatiel, gpt-tokenizer). All are TypeScript-native or have bundled types. No heavy frameworks.

Notable exclusions: **LangChain** (massive dependency tree for minimal benefit when you have Vercel AI SDK), **instructor-js** (last published ~1 year ago, redundant with AI SDK v6), **tree-model-js** (your 3-level hierarchy is better served by 50 lines of typed utility functions than a general-purpose tree library).

For diff visualization specifically, configure `jsondiffpatch` with `objectHash: (obj) => obj.id` so it correctly detects when lessons are moved (not deleted+added). Build a custom React component on top of its HTML formatter for tree-friendly rendering with collapsible sections.

---

## 7. Token budgets, caching, and when to use which model

### Prompt caching varies dramatically by provider

| Provider  | Activation             | Read Discount | TTL         | Minimum      |
| --------- | ---------------------- | ------------- | ----------- | ------------ |
| Anthropic | Manual `cache_control` | **90% off**   | 5min or 1hr | 1,024 tokens |
| DeepSeek  | Automatic              | **90% off**   | Hours-days  | 64 tokens    |
| OpenAI    | Automatic              | **50% off**   | ~1 hour     | 1,024 tokens |
| Gemini    | Implicit               | **75% off**   | 3-5 min     | 1,028 tokens |

**For editing sessions, DeepSeek's automatic 90% caching provides the best hands-off value.** Structure your prompts with a stable prefix — system prompt + course structure + editing instructions — that remains identical across conversation turns. Only the user's latest message changes. OpenRouter passes through all caching mechanics transparently and routes to the same provider to leverage warm caches.

### Model selection by task type

Design your `task_model_routing` table around these tiers:

- **Tier 1 — Classification and simple field updates** ($0.10-0.28/M input): GPT-4.1 Nano for intent classification, DeepSeek V3 for bulk operations like renaming. At $0.10/M input, a classification call with ~500 tokens costs **$0.00005**.
- **Tier 2 — Surgical edits and moderate generation** ($0.40-0.60/M input): GPT-4.1-mini for generating operation schemas, Kimi K2 for agentic tasks with long context.
- **Tier 3 — Content rewriting and structural reasoning** ($2-3/M input): GPT-4.1 or Claude Sonnet 4 for high-quality content generation and complex structural changes.

### Token counting before calls

Use `gpt-tokenizer` for pre-flight estimation. It's pure TypeScript, synchronous, and supports all OpenAI encodings. For DeepSeek and Qwen models (which use different tokenizers), add a **15% buffer** to the `cl100k_base` count:

```typescript
import { countTokens } from 'gpt-tokenizer';

function estimateTokens(text: string, model: string): number {
  const base = countTokens(text);
  if (model.startsWith('deepseek/') || model.startsWith('qwen/')) return Math.ceil(base * 1.15);
  return base;
}
```

### Batch strategy for bulk operations

When a user says "rename all lessons in section 2," **batch into a single LLM call**. The system prompt is shared (saving tokens), the LLM sees full context for naming coherence, and you make one round trip instead of N. For very large sets (50+ items), use a hybrid: batch into chunks of 10, run chunks in parallel with `Promise.allSettled`, merge successful results, and retry failed chunks individually.

---

## Conclusion: the architecture that emerges

The patterns across these seven areas converge on a clear architecture. Store hierarchy relationally with fractional ordering — not as nested JSON. Use short, type-prefixed IDs for storage and remap to sequential integers for LLM context. Define operations as a Zod discriminated union where the LLM references elements by ID, never by index. Classify intent through a three-tier pipeline (heuristics → GPT-4.1 Nano → routed generation) that cuts costs by 3×. Enforce operations through Vercel AI SDK's `Output.object()` with pre-flight validation and safety limits. Route models from a Supabase config table with cockatiel circuit breakers and hardcoded fallbacks. Log every call for cost tracking and continuous optimization.

The two non-obvious insights that should most influence your implementation: first, the BAML research showing that **LLMs make 5-10× more errors with UUID-style IDs than with short sequential IDs** — this isn't just a token cost issue, it's an accuracy issue that compounds across a 200-item course structure. Second, the JSON Whisperer finding that **few-shot examples of correct operations in the system prompt** are critical for patch quality — synthetic examples generated via a capable model (they used Claude 3.5 Sonnet) dramatically improved operation accuracy for both GPT-4o-mini and Claude Sonnet. Invest time in crafting 3-5 high-quality few-shot examples of each operation type for your system prompt; the ROI on reduced validation failures is substantial.
