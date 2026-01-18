# Automatic Course Generation Mode

> **Version**: 1.0.0
> **Date**: 2026-01-14
> **Status**: Implemented

## Overview

Automatic generation mode allows users to create courses without manual approval at each stage. The system automatically progresses through all stages and notifies users upon completion via Push, Email, and Telegram.

## Features

### Core Functionality

| Feature           | Description                                           |
| ----------------- | ----------------------------------------------------- |
| **Auto-Approval** | Stages 2, 3, 4, 5 auto-approve when mode is automatic |
| **Notifications** | Push, Email, Telegram on completion/error/stage       |
| **Pause/Resume**  | Pause generation and optionally switch to manual mode |
| **Cost Preview**  | Show estimated cost before starting                   |
| **Read-only UI**  | GraphView disables edit buttons in automatic mode     |

### Generation Modes

| Mode             | Description                                        |
| ---------------- | -------------------------------------------------- |
| `automatic`      | No approvals, auto-progress, notifications enabled |
| `semi_automatic` | Stage approvals required (existing behavior)       |

## Architecture

### Database Schema

**Migration**: `20260115000000_add_generation_mode.sql`

```sql
-- Courses table additions
ALTER TABLE public.courses
ADD COLUMN generation_mode TEXT DEFAULT 'semi_automatic'
  CHECK (generation_mode IN ('automatic', 'semi_automatic')),
ADD COLUMN notify_on_completion BOOLEAN DEFAULT true,
ADD COLUMN notify_on_error BOOLEAN DEFAULT true,
ADD COLUMN notify_on_stage_complete BOOLEAN DEFAULT false,
ADD COLUMN estimated_cost_usd NUMERIC(10,4) DEFAULT NULL;

-- Users table additions
ALTER TABLE public.users
ADD COLUMN telegram_chat_id TEXT DEFAULT NULL,
ADD COLUMN telegram_notifications_enabled BOOLEAN DEFAULT false;
```

### New Services

#### 1. Auto-Approval Service

**Location**: `packages/course-gen-platform/src/shared/auto-approval/index.ts`

```typescript
export async function handleStageCompletion(
  courseId: string,
  currentStage: number,
  supabase?: SupabaseClient
): Promise<{ autoApproved: boolean; nextStage?: number }>;
```

**Logic**:

1. Check `generation_mode` of course
2. If `automatic`: auto-approve and queue next stage
3. If `semi_automatic`: set status to `stage_X_awaiting_approval`

#### 2. Course Notifications Service

**Location**: `packages/course-gen-platform/src/shared/notifications/course-notifications.ts`

```typescript
export async function notifyCourseCompletion(courseId: string): Promise<void>;
export async function notifyCourseError(
  courseId: string,
  stage: number,
  error: string
): Promise<void>;
export async function notifyStageComplete(courseId: string, stage: number): Promise<void>;
```

**Channels**:

- Push notifications (via web-push)
- Email (if user email present)
- Telegram (if `telegram_chat_id` configured)

#### 3. Telegram Service

**Location**: `packages/course-gen-platform/src/shared/telegram/send.ts`

```typescript
export async function sendTelegramMessage(
  chatId: string,
  message: string,
  options?: { parseMode?: 'Markdown' | 'HTML' }
): Promise<TelegramSendResult>;
```

#### 4. Cost Preview Service

**Location**: `packages/shared-types/src/cost-preview.ts`

```typescript
export function estimateCost(input: EstimateCostInput): CostEstimate;
export function formatCostRange(estimate: CostEstimate): string;
```

**Cost Coefficients**:

- Stage 2: $0.0005 per document
- Stage 4: $0.05 (with docs) / $0.02 (no docs)
- Stage 5: $0.05 base + $0.002 per lesson
- Stage 6: $0.08 per lesson

### Modified Stage Handlers

All stage handlers now call auto-approval and notification services:

| Stage | Handler Location                                         | Changes                                             |
| ----- | -------------------------------------------------------- | --------------------------------------------------- |
| 2     | `stage2-document-processing/orchestrator.ts:660-666`     | `handleStageCompletion()` + `notifyStageComplete()` |
| 3     | `stage3-classification/handler.ts:91-100`                | `handleStageCompletion()` + `notifyStageComplete()` |
| 4     | `stage4-analysis/handler.ts:600-609`                     | `handleStageCompletion()` + `notifyStageComplete()` |
| 5     | `stage5-generation/handler.ts:664`                       | `handleStageCompletion()` (auto-queues Stage 6)     |
| 6     | `stage6-lesson-content/services/database-service.ts:559` | `notifyCourseCompletion()`                          |

### API Changes

#### New tRPC Mutation: `generation.switchToManualMode`

**Location**: `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts:1289`

```typescript
switchToManualMode: instructorProcedure
  .input(z.object({ courseId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    // Verify course is paused and in automatic mode
    // Update generation_mode to 'semi_automatic'
    // Clear pause state
  });
```

### UI Components

#### 1. GenerationModeSection

**Location**: `packages/web/components/forms/create-course/components/GenerationModeSection.tsx`

Toggle switch for selecting generation mode with:

- Mode description
- Notification preference checkboxes
- Push notification permission request

#### 2. CostPreviewCard

**Location**: `packages/web/components/forms/create-course/components/CostPreviewCard.tsx`

Animated card showing:

- Total estimated cost range
- Breakdown by stage
- Confidence indicator

#### 3. AutomaticModeControlPanel

**Location**: `packages/web/components/generation/AutomaticModeControlPanel.tsx`

Control panel with two states:

**Running State**:

- Pause button
- Cancel button
- Status indicator

**Paused State**:

- Resume button (continue automatic)
- Switch to Manual button
- Cancel button

#### 4. GraphView Read-Only Mode

**Location**: `packages/web/components/generation-graph/GraphViewWrapper.tsx`

Props added:

- `readOnly?: boolean`

When `readOnly=true`:

- Edit buttons hidden
- Regenerate buttons hidden
- Approval buttons hidden
- Add section/lesson buttons hidden

### Form Schema Updates

**Location**: `packages/web/components/forms/create-course/_schemas/form-schema.ts`

```typescript
generationMode: z.enum(['automatic', 'semi_automatic']).default('semi_automatic'),
notifyOnCompletion: z.boolean().default(true),
notifyOnError: z.boolean().default(true),
notifyOnStageComplete: z.boolean().default(false),
```

## User Flow

### Starting Automatic Generation

1. User opens "Create Course" form
2. Toggles "Automatic Mode" on
3. Sees cost preview card
4. Configures notification preferences
5. Submits form
6. Sees GraphView in read-only mode with control panel
7. Can close page - will be notified when done

### Pausing and Switching

1. User clicks "Pause" during generation
2. Current stage completes (graceful pause)
3. Panel shows three options:
   - **Resume**: Continue automatically
   - **Manual Mode**: Switch to semi-automatic, full control
   - **Cancel**: Stop generation entirely
4. On "Manual Mode": GraphView becomes interactive

### Receiving Notifications

1. **Push**: Browser notification with course link
2. **Email**: Completion email with course details
3. **Telegram**: Message with course link (if configured)

## Environment Variables

| Variable              | Purpose                   |
| --------------------- | ------------------------- |
| `TELEGRAM_BOT_TOKEN`  | Telegram Bot API token    |
| `NEXT_PUBLIC_APP_URL` | Base URL for course links |
| `VAPID_PUBLIC_KEY`    | Web Push public key       |
| `VAPID_PRIVATE_KEY`   | Web Push private key      |

## Files Created

| File                                                                      | Purpose               |
| ------------------------------------------------------------------------- | --------------------- |
| `supabase/migrations/20260115000000_add_generation_mode.sql`              | Database schema       |
| `src/shared/auto-approval/index.ts`                                       | Auto-approval logic   |
| `src/shared/notifications/course-notifications.ts`                        | Notification dispatch |
| `src/shared/telegram/send.ts`                                             | Telegram API wrapper  |
| `shared-types/src/cost-preview.ts`                                        | Cost estimation       |
| `web/components/generation/AutomaticModeControlPanel.tsx`                 | Control panel UI      |
| `web/components/forms/create-course/components/GenerationModeSection.tsx` | Form section          |
| `web/components/forms/create-course/components/CostPreviewCard.tsx`       | Cost preview UI       |

## Files Modified

| File                                                                | Changes                             |
| ------------------------------------------------------------------- | ----------------------------------- |
| `stage2-document-processing/orchestrator.ts`                        | Auto-approval + notifications       |
| `stage3-classification/handler.ts`                                  | Auto-approval + notifications       |
| `stage4-analysis/handler.ts`                                        | Auto-approval + notifications       |
| `stage6-lesson-content/services/database-service.ts`                | Completion notification             |
| `server/routers/generation/lifecycle.router.ts`                     | switchToManualMode mutation         |
| `forms/create-course/_schemas/form-schema.ts`                       | Mode and notification fields        |
| `forms/create-course-form.tsx`                                      | GenerationModeSection + CostPreview |
| `courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx` | Control panel + readOnly            |
| `generation-graph/GraphViewWrapper.tsx`                             | readOnly prop                       |
| `shared-types/src/index.ts`                                         | Export cost-preview                 |

## Testing Checklist

- [ ] Create course in automatic mode - verify `generation_mode = 'automatic'`
- [ ] Verify stages auto-progress without approval
- [ ] Test pause button - verify `generation_paused_at` is set
- [ ] Test resume - verify generation continues
- [ ] Test switch to manual - verify `generation_mode` changes
- [ ] Test cancel - verify `generation_status = 'cancelled'`
- [ ] Verify push notifications on completion
- [ ] Verify Telegram notifications (if configured)
- [ ] Verify cost preview shows correct estimates
- [ ] Verify GraphView buttons hidden in automatic mode
- [ ] Verify stage notifications when `notify_on_stage_complete = true`

## Future Improvements

- [ ] Telegram bot deep linking for `chat_id` setup
- [ ] Email notification templates
- [ ] ETA prediction based on historical data
- [ ] Partial automatic mode (auto for some stages)
- [ ] Admin dashboard for monitoring automatic generations
