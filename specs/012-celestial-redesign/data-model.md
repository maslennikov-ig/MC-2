# Data Model: Generation Progress Page Redesign

**Feature**: Celestial Mission Redesign
**Source**: `courses.generation_progress` (JSONB) and `generation_trace` (Table)

## Entities

### 1. GenerationProgress (JSONB)
Stored in `courses` table, column `generation_progress`.

| Field | Type | Description |
|-------|------|-------------|
| `percentage` | `number` | Overall progress (0-100). |
| `message` | `string` | Current status message displayed to user. |
| `current_step` | `number` | Legacy step index. |
| `current_stage` | `string` | Current active stage identifier (e.g., "stage_4"). |
| `steps` | `GenerationStep[]` | Array of detailed steps (legacy, but kept). |
| `has_documents` | `boolean` | If true, Stage 2 was performed. |
| `document_size` | `number` | Total size of uploaded documents. |
| `lessons_completed`| `number` | Count for Stage 6 progress. |
| `lessons_total` | `number` | Total lessons to generate. |
| `started_at` | `string` (ISO Date) | When generation started. |
| `estimated_completion` | `string` (ISO Date) | Estimated finish time. |

### 2. StageInfo (Frontend Model)
Derived from `GenerationProgress` and `status` string. Not stored in DB directly.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stage ID (e.g., "stage_2"). |
| `number` | `number` | Numeric order (2-6). |
| `name` | `string` | Display name. |
| `status` | `enum` | 'pending' \| 'active' \| 'completed' \| 'error' \| 'awaiting'. |
| `progress` | `number` | 0-100 progress *within* this stage. |

### 3. GenerationTrace (Table)
Table `generation_trace`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `uuid` | Primary Key. |
| `course_id` | `uuid` | FK to courses. |
| `stage` | `string` | Stage identifier (e.g., "stage_4"). |
| `phase` | `string` | Sub-phase (e.g., "phase_1_classifier"). |
| `step_name` | `string` | Human-readable step name. |
| `model_used` | `string` | LLM model identifier (e.g., "claude-3-5-sonnet"). |
| `tokens_used` | `number` | Total tokens consumed. |
| `cost_usd` | `number` | Cost of the call. |
| `duration_ms` | `number` | Duration in milliseconds. |
| `input_data` | `jsonb` | Inputs to the LLM/function. |
| `output_data` | `jsonb` | Outputs from the LLM/function. |
| `error_data` | `jsonb` | Error details if failed. |
| `created_at` | `timestamptz` | Creation timestamp. |

## Validation Rules

1. **Stage Sequence**: Stages must progress in order: 2 -> 3 -> 4 -> 5 -> 6.
2. **Approval Lock**: If `status` is `stage_X_awaiting_approval`, no further progress updates should occur until approved.
3. **Realtime Consistency**: The UI `percentage` should never decrease unless the process is restarted/reset.
