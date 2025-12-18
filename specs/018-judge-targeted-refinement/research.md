# Phase 0 Research: Stage 6 Targeted Refinement

**Date**: 2025-12-11 | **Status**: Complete

## Research Questions

### 1. Krippendorff's Alpha npm Package

**Question**: Is there a suitable npm package for calculating Krippendorff's Alpha for inter-rater agreement?

**Decision**: Use `krippendorff` npm package

**Rationale**:
- Package exists on npm: `krippendorff@0.1.0`
- TypeScript support: Yes (`types: ./dist/index.d.ts`)
- License: MIT
- Author: Max Schaefer (GitHub)
- Published: March 2024
- Build: TypeScript 5.4.3, Jest tests, ESLint
- Zero runtime dependencies

**Alternatives Considered**:
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| `krippendorff` npm | TypeScript, maintained, tested | Single version 0.1.0 | ✅ CHOSEN |
| Custom implementation | Full control | Development time, testing | ❌ |
| Python port via WebAssembly | Access to mature `krippendorff` Python lib | Complexity, bundle size | ❌ |

**Installation**:
```bash
pnpm add krippendorff
```

**API Usage** (expected):
```typescript
import { krippendorff } from 'krippendorff';

// Rating matrix: rows = raters, columns = items
// Missing values represented as undefined/null
const ratings = [
  [1, 2, 3, 3],  // Judge 1
  [1, 2, 3, 4],  // Judge 2
  [1, 2, 3, 4],  // Judge 3 (if invoked)
];

const alpha = krippendorff(ratings, { level: 'ordinal' });
// Returns: number between 0 and 1
// Interpretation:
//   >= 0.80: High agreement (accept all issues)
//   >= 0.67: Moderate agreement (accept 2+ judge consensus issues)
//   < 0.67: Low agreement (only CRITICAL issues, flag for review)
```

---

### 2. Parallel Execution Pattern in BullMQ

**Question**: How to execute parallel Patcher tasks with constraint (non-adjacent sections only)?

**Decision**: Use custom parallel executor with dependency validation

**Rationale**:
- BullMQ supports `Promise.all` for parallel job execution
- Need custom logic for adjacency constraint (sections i and i±1 cannot run together)
- Max 3 concurrent Patchers (configurable)

**Implementation Pattern**:
```typescript
// Batch creation algorithm (from spec):
// 1. Sort tasks by priority (critical > major > minor)
// 2. Group by sectionId
// 3. Create batches where no two tasks have adjacent sectionIds
// 4. Execute batch in parallel, wait, then next batch

async function executeBatches(
  tasks: SectionRefinementTask[],
  maxConcurrent: number = 3
): Promise<Map<string, PatchResult>> {
  const batches = createNonAdjacentBatches(tasks);
  const results = new Map<string, PatchResult>();

  for (const batch of batches) {
    const batchTasks = batch.slice(0, maxConcurrent);
    const batchResults = await Promise.all(
      batchTasks.map(task => executePatch(task))
    );
    // Merge results...
  }

  return results;
}

function createNonAdjacentBatches(
  tasks: SectionRefinementTask[]
): SectionRefinementTask[][] {
  // Greedy coloring algorithm for section indices
  const batches: SectionRefinementTask[][] = [];
  const used = new Set<number>();

  for (const task of tasks.sort((a, b) =>
    priorityOrder(b.priority) - priorityOrder(a.priority)
  )) {
    const sectionIdx = parseSectionIndex(task.sectionId);
    const canAddToBatch = (batch: SectionRefinementTask[]) =>
      batch.every(t =>
        Math.abs(parseSectionIndex(t.sectionId) - sectionIdx) > 1
      );

    let addedToExisting = false;
    for (const batch of batches) {
      if (batch.length < 3 && canAddToBatch(batch)) {
        batch.push(task);
        addedToExisting = true;
        break;
      }
    }

    if (!addedToExisting) {
      batches.push([task]);
    }
  }

  return batches;
}
```

**Alternatives Considered**:
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| BullMQ Flow dependencies | Native support | Overkill, complex setup | ❌ |
| Custom Promise.all batching | Simple, controllable | Manual dependency logic | ✅ CHOSEN |
| p-limit with adjacency check | Proven library | Still need custom logic | ❌ |

---

### 3. Existing Readability Metric Utilities

**Question**: Does the codebase have existing readability calculation utilities?

**Decision**: Reuse existing `heuristic-filter.ts` utilities

**Rationale**:
Existing implementation found in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts`:

- `countSyllables(word: string): number` - Syllable counting for readability
- `calculateFleschKincaidGrade(text: string): number` - Flesch-Kincaid grade level
- `calculateFleschReadingEase(text: string): number` - Flesch Reading Ease score
- `checkWordCount(content, config)` - Word count validation
- `checkFleschKincaid(content, config)` - Readability validation
- `checkSectionHeaders(content, requiredSections)` - Structure validation
- `checkKeywordCoverage(content, keywords)` - Keyword coverage
- `checkContentDensity(content, threshold)` - Content density

**For Targeted Refinement**, we need:
1. **Universal Readability Metrics** (from spec FR-035..FR-037):
   - `avgSentenceLength`: Calculate from `sentenceCount` / word count ratio
   - `avgWordLength`: New utility needed
   - `paragraphBreakRatio`: New utility needed

2. **Language-agnostic approach**:
   - Existing Flesch-Kincaid is **English-only** (syllable counting)
   - Spec requires **universal metrics** (sentence length, word length, paragraph ratio)
   - These work for Russian, English, and other languages

**New Utilities Needed**:
```typescript
// In verifier/quality-lock.ts or shared utilities

export function calculateUniversalReadability(text: string): UniversalReadabilityMetrics {
  const sentences = text.split(/[.!?。！？]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  return {
    avgSentenceLength: words.length / Math.max(1, sentences.length),
    avgWordLength: words.reduce((sum, w) => sum + w.length, 0) / Math.max(1, words.length),
    paragraphBreakRatio: paragraphs.length / Math.max(1, sentences.length),
  };
}

export function validateReadability(
  metrics: UniversalReadabilityMetrics,
  config: typeof REFINEMENT_CONFIG.readability
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  if (metrics.avgSentenceLength > config.avgSentenceLength.max) {
    issues.push(`Average sentence length ${metrics.avgSentenceLength.toFixed(1)} exceeds max ${config.avgSentenceLength.max}`);
  }
  if (metrics.avgWordLength > config.avgWordLength.max) {
    issues.push(`Average word length ${metrics.avgWordLength.toFixed(1)} exceeds max ${config.avgWordLength.max}`);
  }
  if (metrics.paragraphBreakRatio < config.paragraphBreakRatio.min) {
    issues.push(`Paragraph break ratio ${metrics.paragraphBreakRatio.toFixed(2)} below min ${config.paragraphBreakRatio.min}`);
  }

  return { passed: issues.length === 0, issues };
}
```

---

## Summary

| Research Item | Status | Decision |
|---------------|--------|----------|
| Krippendorff's Alpha library | ✅ Complete | Use `krippendorff` npm package |
| Parallel execution pattern | ✅ Complete | Custom batching with adjacency check |
| Readability utilities | ✅ Complete | Extend existing heuristic-filter.ts with universal metrics |

## Dependencies to Add

```json
{
  "dependencies": {
    "krippendorff": "^0.1.0"
  }
}
```

## Next Phase

Proceed to **Phase 1: Design & Contracts** with:
1. Generate `data-model.md` - Entity definitions and relationships
2. Generate `contracts/` - API schemas for new endpoints
3. Generate `quickstart.md` - Implementation guide
