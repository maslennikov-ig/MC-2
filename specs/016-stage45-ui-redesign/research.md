# Research: Stage 4-5 UI Redesign

**Date**: 2025-12-05
**Branch**: `016-stage45-ui-redesign`

## Research Questions

### RQ-1: Virtualization Library Selection

**Question**: Which virtualization library to use for large course structures?

**Decision**: `react-virtuoso` (need to install)

**Rationale**:
- High Source Reputation, Benchmark Score 89.5
- **Production-optimal**: `GroupedVirtuoso` component matches our sections→lessons hierarchy perfectly
- Sticky group headers built-in (no custom implementation)
- Automatic variable height detection (lessons have different content)
- Less boilerplate code compared to headless alternatives
- Active maintenance, 145 code snippets in docs

**Alternatives Considered**:
- `@tanstack/react-virtual` (Score 90.9) — headless, requires ~50+ lines for grouped lists with sticky headers
- `react-virtualized` — older, more complex API, larger bundle
- `react-window` — simpler but no grouped lists support
- Native CSS (`content-visibility`) — browser support inconsistent, less control

**Installation**: `pnpm add react-virtuoso -F @megacampus/web`

**Usage Pattern** (matches our sections/lessons structure):
```tsx
import { GroupedVirtuoso } from 'react-virtuoso'

// sections = [{lessons: [...], ...}, ...]
const groupCounts = sections.map(s => s.lessons.length)

<GroupedVirtuoso
  style={{ height: '100%' }}
  groupCounts={groupCounts}
  groupContent={(sectionIndex) => (
    <SectionHeader section={sections[sectionIndex]} />  // sticky!
  )}
  itemContent={(lessonIndex, sectionIndex) => (
    <LessonRow lesson={sections[sectionIndex].lessons[lessonIndex]} />
  )}
/>
```

**Key Features Used**:
- `GroupedVirtuoso` — grouped lists with sticky headers
- `scrollToIndex` — jump to specific lesson
- Auto variable height — no `estimateSize` needed

---

### RQ-2: Debounced Auto-save Implementation

**Question**: How to implement debounced auto-save with status indication?

**Decision**: Use existing `use-debounce` library + custom `useAutoSave` hook

**Rationale**:
- `use-debounce@10.0.6` already installed in packages/web
- Provides `useDebouncedCallback` with `.flush()` method for immediate save on blur
- Custom hook wraps tRPC mutation + status state

**Existing Code**:
- `packages/web/lib/hooks/use-debounce.ts` — basic implementation exists
- However, it lacks `.flush()` method for immediate trigger
- Better to use `use-debounce` library's `useDebouncedCallback`

**Usage Pattern**:
```tsx
import { useDebouncedCallback } from 'use-debounce'

const useAutoSave = (mutationFn: MutationFn) => {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const debouncedSave = useDebouncedCallback(
    async (fieldPath: string, value: unknown) => {
      setStatus('saving')
      try {
        await mutationFn({ fieldPath, value })
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } catch {
        setStatus('error')
      }
    },
    1000 // 1 second debounce
  )

  return { save: debouncedSave, status, flush: debouncedSave.flush }
}
```

---

### RQ-3: Tiered Context Strategy Implementation

**Question**: How to implement Smart Context Router for AI regeneration?

**Decision**: Rule-based classifier using keyword patterns + context size heuristics

**Rationale**:
- Simple rule-based approach sufficient for MVP
- No need for additional LLM call to classify
- Can be upgraded to ML classifier later if needed

**Implementation**:
```typescript
type ContextTier = 'atomic' | 'local' | 'structural' | 'global'

const TIER_PATTERNS: Record<ContextTier, string[]> = {
  atomic: ['typo', 'fix', 'correct', 'опечатка', 'исправь'],
  local: ['simplify', 'expand', 'tone', 'упрости', 'расширь'],
  structural: ['complexity', 'level', 'audience', 'сложность', 'уровень'],
  global: ['rewrite', 'style', 'complete', 'переписать', 'стиль'],
}

function detectContextTier(instruction: string): ContextTier {
  const lowerInstruction = instruction.toLowerCase()
  for (const [tier, patterns] of Object.entries(TIER_PATTERNS)) {
    if (patterns.some(p => lowerInstruction.includes(p))) {
      return tier as ContextTier
    }
  }
  return 'local' // default
}
```

**Token Budgets by Tier**:
| Tier | Target Content | Context | Total |
|------|---------------|---------|-------|
| atomic | 200 | 100 | 300 |
| local | 500 | 500 | 1,000 |
| structural | 1,000 | 1,500 | 2,500 |
| global | 2,000 | 3,000 | 5,000 |

---

### RQ-4: Dependency Graph Implementation

**Question**: How to track and visualize course element dependencies?

**Decision**: In-memory graph calculation, no DB table

**Rationale**:
- Courses are small (<100 lessons)
- Dependencies are derivable from structure (parent-child, LO alignment)
- No need for persistent storage — recalculate on load
- Simpler implementation, no migration needed

**Data Structure**:
```typescript
interface DependencyNode {
  id: string          // e.g., "section.0.lesson.2"
  type: 'course' | 'section' | 'lesson' | 'objective'
  parentId: string | null
  learningObjectiveId?: string
}

interface DependencyEdge {
  from: string
  to: string
  type: 'PARENT_OF' | 'ALIGNS_TO' | 'ASSESSES'
}

function buildDependencyGraph(structure: CourseStructure): DependencyGraph {
  const nodes: DependencyNode[] = []
  const edges: DependencyEdge[] = []

  // Traverse structure, build graph
  structure.sections.forEach((section, si) => {
    nodes.push({ id: `section.${si}`, type: 'section', parentId: 'course' })
    edges.push({ from: 'course', to: `section.${si}`, type: 'PARENT_OF' })

    section.lessons.forEach((lesson, li) => {
      const lessonId = `section.${si}.lesson.${li}`
      nodes.push({ id: lessonId, type: 'lesson', parentId: `section.${si}` })
      edges.push({ from: `section.${si}`, to: lessonId, type: 'PARENT_OF' })

      // LO alignment
      if (lesson.learning_objectives) {
        lesson.learning_objectives.forEach(lo => {
          edges.push({ from: lessonId, to: lo, type: 'ALIGNS_TO' })
        })
      }
    })
  })

  return { nodes, edges }
}
```

**Stale Detection**:
- Track `lastModified` timestamp per node
- When parent changes, mark children as "potentially stale"
- Red indicator for LO changes, Yellow for other changes

---

### RQ-5: Semantic Diff Generation

**Question**: How to generate conceptual diff after AI regeneration?

**Decision**: LLM-generated diff in structured output + keyword extraction

**Rationale**:
- LLM already generates content — add structured output schema
- Include `concepts_added`, `concepts_removed` in response
- Calculate Alignment Score via simple heuristics or second LLM call

**Implementation**:
```typescript
interface RegenerationResponse {
  regenerated_content: string
  pedagogical_change_log: string
  alignment_score: 1 | 2 | 3 | 4 | 5
  bloom_level_preserved: boolean
  concepts_added: string[]
  concepts_removed: string[]
}

// Zod schema for structured output
const regenerationResponseSchema = z.object({
  regenerated_content: z.string(),
  pedagogical_change_log: z.string(),
  alignment_score: z.number().int().min(1).max(5),
  bloom_level_preserved: z.boolean(),
  concepts_added: z.array(z.string()),
  concepts_removed: z.array(z.string()),
})
```

---

### RQ-6: Token Balance Check Integration

**Question**: How to integrate token-based billing for regeneration?

**Decision**: Check balance before request, estimate cost, show warning

**Rationale**:
- Existing billing infrastructure (`billing.getUsage`, `billing.getQuota`)
- Add token tracking to organization (similar to storage quota)
- Frontend shows estimated cost before sending

**Implementation Sketch**:
```typescript
// Backend: Add to billing router
billing.getTokenBalance = protectedProcedure.query(async ({ ctx }) => {
  // Query organization token balance
  return { tokensRemaining, tokensUsedThisMonth, limit }
})

billing.estimateRegenerationCost = protectedProcedure
  .input(z.object({ tier: contextTierSchema, blockType: z.string() }))
  .query(async ({ input }) => {
    const { tier } = input
    const tokenBudget = TIER_TOKEN_BUDGETS[tier]
    // Estimate: input tokens + output tokens
    return { estimatedTokens: tokenBudget.total * 1.2 }
  })

// Frontend: Before regeneration
const balance = await trpc.billing.getTokenBalance.query()
const cost = await trpc.billing.estimateRegenerationCost.query({ tier, blockType })
if (cost.estimatedTokens > balance.tokensRemaining) {
  showWarning('Недостаточно токенов')
  return
}
```

**Deferred**: Full token tracking implementation — requires schema changes. For MVP, log token usage but don't enforce limits.

---

## Library Decisions Summary

| Purpose | Library | Status | Notes |
|---------|---------|--------|-------|
| Virtualization | `react-virtuoso` | **INSTALL** | GroupedVirtuoso for sections/lessons hierarchy |
| Debounce | `use-debounce` | Installed | Already in package.json |
| State management | `zustand` + `immer` | Installed | Use for edit state |
| Nested object updates | `lodash` | Installed | Use `_.set()`, `_.get()` |
| Toast notifications | `sonner` | Installed | For save status |
| Accordion | `@radix-ui/react-accordion` | Installed | For phase sections |

---

## Open Questions (Deferred to Implementation)

1. **Token tracking schema** — requires migration, defer to Phase 2
2. **Context caching** — OpenRouter supports prompt caching, implement in Phase 2
3. **Bloom's level validation** — need Bloom's taxonomy mapping, implement basic version first
