# Data Model: Stage 4-5 UI Redesign

**Date**: 2025-12-05
**Branch**: `016-stage45-ui-redesign`

## Overview

This feature does not require database schema changes. All data is stored in existing JSONB columns:
- `courses.analysis_result` — Stage 4 output (AnalysisResult)
- `courses.course_structure` — Stage 5 output (CourseStructure)

This document defines **new TypeScript types** for UI components and API contracts.

---

## Existing Entities (No Changes)

### AnalysisResult (Stage 4)
**Location**: `packages/shared-types/src/analysis-result.ts`

Key sections for UI:
- `course_category` — classification with confidence
- `contextual_language` — motivational messages
- `topic_analysis` — topic, complexity, audience, key_concepts
- `recommended_structure` — lessons count, sections breakdown
- `pedagogical_strategy` — teaching style, assessment approach
- `pedagogical_patterns` — theory/practice ratio, assessment types
- `generation_guidance` — tone, analogies, exercise types
- `document_relevance_mapping` — RAG planning

### CourseStructure (Stage 5)
**Location**: `packages/shared-types/src/generation-result.ts`

Key sections for UI:
- Course metadata (title, description, target_audience)
- `sections[]` — with lessons
- `lessons[]` — with learning_objectives, key_topics, duration

---

## New Types

### File: `packages/shared-types/src/regeneration-types.ts`

```typescript
import { z } from 'zod';

// ============================================================================
// Context Tiers for Smart Routing
// ============================================================================

export const contextTierSchema = z.enum(['atomic', 'local', 'structural', 'global']);
export type ContextTier = z.infer<typeof contextTierSchema>;

export const TIER_TOKEN_BUDGETS: Record<ContextTier, { target: number; context: number; total: number }> = {
  atomic: { target: 200, context: 100, total: 300 },
  local: { target: 500, context: 500, total: 1000 },
  structural: { target: 1000, context: 1500, total: 2500 },
  global: { target: 2000, context: 3000, total: 5000 },
};

// ============================================================================
// Regeneration Request/Response
// ============================================================================

export const regenerateBlockInputSchema = z.object({
  courseId: z.string().uuid(),
  stageId: z.enum(['stage_4', 'stage_5']),
  blockPath: z.string(), // e.g., "topic_analysis.key_concepts"
  userInstruction: z.string().min(1).max(500),
});
export type RegenerateBlockInput = z.infer<typeof regenerateBlockInputSchema>;

export const regenerationResponseSchema = z.object({
  regenerated_content: z.unknown(), // Type depends on blockPath
  pedagogical_change_log: z.string(),
  alignment_score: z.number().int().min(1).max(5),
  bloom_level_preserved: z.boolean(),
  concepts_added: z.array(z.string()),
  concepts_removed: z.array(z.string()),
});
export type RegenerationResponse = z.infer<typeof regenerationResponseSchema>;

// ============================================================================
// Semantic Diff
// ============================================================================

export interface SemanticDiff {
  changeType: 'simplified' | 'expanded' | 'restructured' | 'refined';
  conceptsAdded: string[];
  conceptsRemoved: string[];
  alignmentScore: 1 | 2 | 3 | 4 | 5;
  bloomLevelPreserved: boolean;
  changeDescription: string; // Human-readable summary
}

// ============================================================================
// Update Field Request
// ============================================================================

export const updateFieldInputSchema = z.object({
  courseId: z.string().uuid(),
  stageId: z.enum(['stage_4', 'stage_5']),
  fieldPath: z.string(), // e.g., "topic_analysis.key_concepts[0]"
  value: z.unknown(),
});
export type UpdateFieldInput = z.infer<typeof updateFieldInputSchema>;

export interface UpdateFieldResponse {
  success: boolean;
  updatedAt: string; // ISO timestamp
  newValue: unknown;
}
```

### File: `packages/shared-types/src/dependency-graph.ts`

```typescript
import { z } from 'zod';

// ============================================================================
// Dependency Graph Types
// ============================================================================

export const dependencyNodeTypeSchema = z.enum(['course', 'section', 'lesson', 'objective']);
export type DependencyNodeType = z.infer<typeof dependencyNodeTypeSchema>;

export interface DependencyNode {
  id: string;          // e.g., "section.0.lesson.2"
  type: DependencyNodeType;
  label: string;       // Human-readable label
  parentId: string | null;
  learningObjectiveIds?: string[];
  lastModified?: string; // ISO timestamp
}

export const dependencyEdgeTypeSchema = z.enum(['PARENT_OF', 'ALIGNS_TO', 'ASSESSES', 'PREREQUISITE_FOR']);
export type DependencyEdgeType = z.infer<typeof dependencyEdgeTypeSchema>;

export interface DependencyEdge {
  from: string;
  to: string;
  type: DependencyEdgeType;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

// ============================================================================
// Stale Status Types
// ============================================================================

export const staleStatusSchema = z.enum(['fresh', 'potentially_stale', 'definitely_stale']);
export type StaleStatus = z.infer<typeof staleStatusSchema>;

export interface StaleIndicator {
  nodeId: string;
  status: StaleStatus;
  reason: string;
  changedParentId: string;
  changedParentLabel: string;
  changedAt: string; // ISO timestamp
  isLearningObjectiveChange: boolean; // Red if true, yellow if false
}

// ============================================================================
// Impact Analysis Types
// ============================================================================

export interface ImpactAnalysis {
  targetNodeId: string;
  targetNodeLabel: string;
  affectedNodes: {
    nodeId: string;
    label: string;
    type: DependencyNodeType;
    relationship: DependencyEdgeType;
  }[];
  totalAffected: number;
  warningLevel: 'low' | 'medium' | 'high';
}

export const cascadeUpdateModeSchema = z.enum(['mark_stale', 'auto_regenerate', 'review_each']);
export type CascadeUpdateMode = z.infer<typeof cascadeUpdateModeSchema>;
```

### File: `packages/web/lib/generation-graph/phase-names.ts`

```typescript
// Phase name translations for Stage 4 and Stage 5

export interface PhaseInfo {
  ru: string;
  en: string;
  description: {
    ru: string;
    en: string;
  };
}

export const PHASE_NAMES: Record<string, Record<string, PhaseInfo>> = {
  stage_4: {
    phase_0: {
      ru: 'Подготовка',
      en: 'Preparation',
      description: {
        ru: 'Проверка готовности документов к анализу',
        en: 'Checking document readiness for analysis',
      },
    },
    phase_1: {
      ru: 'Классификация',
      en: 'Classification',
      description: {
        ru: 'Определение категории и темы курса',
        en: 'Determining course category and topic',
      },
    },
    phase_2: {
      ru: 'Планирование объёма',
      en: 'Scope Planning',
      description: {
        ru: 'Расчёт количества уроков и секций',
        en: 'Calculating lessons and sections count',
      },
    },
    phase_3: {
      ru: 'Экспертный анализ',
      en: 'Expert Analysis',
      description: {
        ru: 'Глубокий анализ и выбор педагогической стратегии',
        en: 'Deep analysis and pedagogical strategy selection',
      },
    },
    phase_4: {
      ru: 'Синтез документов',
      en: 'Document Synthesis',
      description: {
        ru: 'Анализ загруженных материалов и создание рекомендаций',
        en: 'Analyzing uploaded materials and creating recommendations',
      },
    },
    phase_6: {
      ru: 'RAG-планирование',
      en: 'RAG Planning',
      description: {
        ru: 'Связывание документов с разделами курса',
        en: 'Mapping documents to course sections',
      },
    },
    phase_5: {
      ru: 'Финализация',
      en: 'Finalization',
      description: {
        ru: 'Сборка итогового результата анализа',
        en: 'Assembling final analysis result',
      },
    },
  },
  stage_5: {
    validate_input: {
      ru: 'Валидация',
      en: 'Validation',
      description: {
        ru: 'Проверка входных данных',
        en: 'Input data validation',
      },
    },
    generate_metadata: {
      ru: 'Метаданные',
      en: 'Metadata',
      description: {
        ru: 'Генерация описания и характеристик курса',
        en: 'Generating course description and properties',
      },
    },
    generate_sections: {
      ru: 'Структура',
      en: 'Structure',
      description: {
        ru: 'Создание секций и уроков курса',
        en: 'Creating course sections and lessons',
      },
    },
    validate_quality: {
      ru: 'Проверка качества',
      en: 'Quality Check',
      description: {
        ru: 'Валидация по образовательным стандартам',
        en: 'Validation against educational standards',
      },
    },
    validate_lessons: {
      ru: 'Проверка уроков',
      en: 'Lessons Check',
      description: {
        ru: 'Проверка минимального количества уроков',
        en: 'Checking minimum lessons requirement',
      },
    },
  },
};

export function getPhaseName(stageId: string, phaseId: string, locale: 'ru' | 'en' = 'ru'): string {
  return PHASE_NAMES[stageId]?.[phaseId]?.[locale] ?? phaseId;
}

export function getPhaseDescription(stageId: string, phaseId: string, locale: 'ru' | 'en' = 'ru'): string {
  return PHASE_NAMES[stageId]?.[phaseId]?.description[locale] ?? '';
}
```

---

## Editor Field Types

### File: `packages/web/components/generation-graph/panels/output/types.ts`

```typescript
// Editor field type definitions for inline editing

export type EditorFieldType = 'text' | 'textarea' | 'chips' | 'select' | 'number' | 'toggle';

export interface FieldConfig {
  path: string;           // JSON path in data structure
  label: string;          // Display label
  type: EditorFieldType;
  options?: string[];     // For 'select' type
  min?: number;           // For 'number' type
  max?: number;           // For 'number' type
  placeholder?: string;
  helpText?: string;
  regeneratable?: boolean; // Can be regenerated via AI
}

// Stage 4 field configurations
export const ANALYSIS_RESULT_FIELDS: FieldConfig[] = [
  // Course Classification
  { path: 'course_category.primary', label: 'Категория', type: 'select', options: ['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic'] },
  { path: 'contextual_language.why_matters_context', label: 'Почему это важно', type: 'textarea', regeneratable: true },
  { path: 'contextual_language.motivators', label: 'Мотиваторы', type: 'textarea', regeneratable: true },

  // Topic Analysis
  { path: 'topic_analysis.determined_topic', label: 'Тема', type: 'text', regeneratable: true },
  { path: 'topic_analysis.complexity', label: 'Сложность', type: 'select', options: ['narrow', 'medium', 'broad'] },
  { path: 'topic_analysis.target_audience', label: 'Аудитория', type: 'select', options: ['beginner', 'intermediate', 'advanced', 'mixed'] },
  { path: 'topic_analysis.key_concepts', label: 'Ключевые концепции', type: 'chips', regeneratable: true },

  // Recommended Structure
  { path: 'recommended_structure.total_lessons', label: 'Уроков', type: 'number', min: 10, max: 100 },
  { path: 'recommended_structure.total_sections', label: 'Секций', type: 'number', min: 1, max: 30 },
  { path: 'recommended_structure.lesson_duration_minutes', label: 'Длительность урока (мин)', type: 'number', min: 3, max: 45 },

  // Pedagogical Strategy
  { path: 'pedagogical_strategy.teaching_style', label: 'Стиль обучения', type: 'select', options: ['hands-on', 'theory-first', 'project-based', 'mixed'] },
  { path: 'pedagogical_strategy.interactivity_level', label: 'Интерактивность', type: 'select', options: ['high', 'medium', 'low'] },
  { path: 'pedagogical_patterns.assessment_types', label: 'Типы заданий', type: 'chips' },

  // Generation Guidance
  { path: 'generation_guidance.tone', label: 'Тон', type: 'select', options: ['conversational but precise', 'formal academic', 'casual friendly', 'technical professional'] },
  { path: 'generation_guidance.use_analogies', label: 'Использовать аналогии', type: 'toggle' },
  { path: 'generation_guidance.specific_analogies', label: 'Специфичные аналогии', type: 'chips', regeneratable: true },
];

// Stage 5 field configurations (per lesson)
export const COURSE_STRUCTURE_LESSON_FIELDS: FieldConfig[] = [
  { path: 'title', label: 'Название', type: 'text', regeneratable: true },
  { path: 'learning_objectives', label: 'Цели обучения', type: 'chips', regeneratable: true },
  { path: 'key_topics', label: 'Ключевые темы', type: 'chips', regeneratable: true },
  { path: 'estimated_duration_minutes', label: 'Длительность (мин)', type: 'number', min: 3, max: 60 },
];
```

---

## State Management

### Save Status State
```typescript
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface EditState {
  status: SaveStatus;
  lastSavedAt: string | null;
  pendingChanges: Map<string, unknown>;
  error: string | null;
}
```

### Stale Tracking State
```typescript
interface StaleState {
  indicators: Map<string, StaleIndicator>;
  lastCheckedAt: string;
}
```

---

## Validation Rules

### Field Validation
| Field Path | Validation |
|------------|------------|
| `topic_analysis.determined_topic` | 3-200 chars |
| `recommended_structure.total_lessons` | 10-100 |
| `recommended_structure.total_sections` | 1-30 |
| `recommended_structure.lesson_duration_minutes` | 3-45 |
| `topic_analysis.key_concepts` | 3-10 items |

### Business Rules
1. **Minimum 10 Lessons**: AI generation enforces minimum, user can delete below
2. **Duration Recalculation**: When lesson duration changes, recalculate section and course totals
3. **Lesson Numbering**: When lesson added/removed, renumber all subsequent lessons
