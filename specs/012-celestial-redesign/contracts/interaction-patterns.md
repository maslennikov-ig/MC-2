# Interaction Patterns

## Server Actions

### `approveStage(courseId: string, stage: number)`
- **Trigger**: User clicks "Approve & Continue" in `MissionControlBanner`.
- **Effect**: Updates `courses.generation_status` to remove `_awaiting_approval` suffix and triggers next backend job.
- **Response**: `void` (Promise). Errors throw exceptions.

### `cancelGeneration(courseId: string)`
- **Trigger**: User clicks "Cancel" in `MissionControlBanner` or global controls.
- **Effect**: Updates `courses.generation_status` to `cancelled`.
- **Response**: `void` (Promise).

### `getStageResults(courseId: string, stage: number)`
- **Trigger**: User clicks "View Results" in `MissionControlBanner` or expands a completed `PlanetNode`.
- **Response**: Returns `StageData` object containing stage-specific outputs (summaries, analysis text, structure JSON, etc.).

## Realtime Subscription

### Channel: `course-progress-{courseId}`
- **Event**: `postgres_changes` on `courses` table (UPDATE).
- **Payload**:
  ```json
  {
    "new": {
      "generation_status": "analyzing_task",
      "generation_progress": {
        "percentage": 45,
        "current_stage": "stage_4",
        "message": "Analyzing course scope...",
        ...
      }
    }
  }
  ```
- **Frontend Handler**: Updates local reducer state to reflect new progress/status.

### Channel: `generation-trace-{courseId}`
- **Event**: `INSERT` on `generation_trace` table.
- **Payload**: `GenerationTrace` row.
- **Frontend Handler**: Adds trace to `GenerationRealtimeProvider` context; updates active stage metrics (cost, tokens, phase).
