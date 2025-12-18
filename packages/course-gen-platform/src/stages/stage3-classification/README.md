# Stage 3: Document Classification

## Purpose

Stage 3 performs comparative document classification for courses after Stage 2 document processing. Classification assigns priority levels that determine token budget allocation in Stage 4.

## Priority Levels

### CORE (Exactly 1)
- The single most important document for the course
- Primary course material (main textbook, syllabus, etc.)
- Receives highest token budget allocation

### IMPORTANT (Up to 30%)
- Key supporting documents
- Critical references that significantly enhance course quality
- Receives substantial token budget

### SUPPLEMENTARY (Remaining)
- Additional materials
- Nice-to-have content providing extra context
- Receives minimal token budget

## Classification Strategy

**Comparative Ranking**: All documents are compared against each other in a single LLM call (or tournament if too large).

**Tournament Mode**: If total summary tokens exceed budget (100K tokens), documents are divided into balanced groups, classified separately, then finalists are compared in a final round.

## Pipeline Position

```
Stage 2 (Document Processing)
  ↓
  processed_content (summaries) stored in file_catalog
  ↓
[Stage 3 (Classification)] ← YOU ARE HERE
  ↓
  summary_metadata.classification stored in file_catalog
  ↓
Stage 4 (Analysis)
```

## Files

- **orchestrator.ts**: Coordinates classification workflow
- **handler.ts**: BullMQ job handler
- **phases/phase-classification.ts**: Classification logic (comparative + tournament)
- **utils/tournament-classification.ts**: Two-stage tournament for large courses
- **types.ts**: TypeScript interfaces

## Usage

```typescript
import { Stage3ClassificationOrchestrator } from './orchestrator';

const orchestrator = new Stage3ClassificationOrchestrator();
const result = await orchestrator.execute({
  courseId: 'course-uuid',
  organizationId: 'org-uuid',
  onProgress: (progress, message) => console.log(progress, message),
});

console.log(result.coreCount);        // 1
console.log(result.importantCount);   // ~30% of total
console.log(result.supplementaryCount); // Remaining
```

## Database Schema

Classification results are stored in `file_catalog.summary_metadata`:

```json
{
  "classification": {
    "priority": "CORE",
    "importance_score": 0.95,
    "order": 1,
    "classification_rationale": "[Comparative] This is the primary course textbook...",
    "classified_at": "2025-12-02T10:30:00Z"
  }
}
```

## Model Configuration

- **Model**: `openai/gpt-oss-20b` (fast, cheap)
- **Temperature**: 0.0 (deterministic output)
- **Max Tokens**: 2048 (classification output)
- **Input Budget**: 100,000 tokens (triggers tournament if exceeded)

## Quality Gates

Stage 3 enforces:
1. Exactly 1 CORE document
2. Maximum 30% IMPORTANT documents
3. All documents assigned a priority level
4. No missing classifications

## Error Handling

- **Non-fatal**: Classification errors don't block pipeline
- **Fallback**: If comparative fails, falls back to independent classification
- **Logging**: All errors logged to `error_logs` table
- **Recovery**: Can be re-run for a course without side effects

## Next Steps

After Stage 3 completes:
1. Stage 4 reads classifications from `file_catalog.summary_metadata`
2. Token budgets allocated based on priorities
3. Course outline generation proceeds with optimized context
