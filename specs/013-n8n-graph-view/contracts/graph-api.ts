/**
 * API Contracts: n8n-Style Graph Pipeline View
 *
 * This file defines the API contracts for the graph visualization feature.
 * These are TypeScript types only - implementation is separate.
 *
 * @date 2025-11-28
 */

import { z } from 'zod';

// =============================================================================
// 1. Refinement API
// =============================================================================

/**
 * POST /api/generation/refine
 *
 * Sends a refinement instruction to improve AI-generated content
 * without full regeneration.
 */

// Request Schema
export const refinementRequestSchema = z.object({
  /** Course ID */
  courseId: z.string().uuid(),

  /** Stage identifier (e.g., "stage_3", "stage_6") */
  stageId: z.enum(['stage_3', 'stage_4', 'stage_5', 'stage_6']),

  /** Optional specific node ID for parallel items */
  nodeId: z.string().optional(),

  /** Previous output to refine (truncated if too long) */
  previousOutput: z.string().min(1).max(50000),

  /** User's refinement instruction */
  userMessage: z.string().min(1).max(2000),

  /** Current attempt number */
  attemptNumber: z.number().int().min(1).max(10),
});

export type RefinementRequest = z.infer<typeof refinementRequestSchema>;

// Response Schema
export const refinementResponseSchema = z.object({
  /** New trace ID */
  traceId: z.string().uuid(),

  /** Processing status */
  status: z.enum(['queued', 'processing', 'completed', 'failed']),

  /** Error message if failed */
  error: z.string().optional(),

  /** Estimated completion time in seconds */
  estimatedTime: z.number().optional(),
});

export type RefinementResponse = z.infer<typeof refinementResponseSchema>;

// Error Responses
export const refinementErrorSchema = z.object({
  code: z.enum([
    'UNAUTHORIZED',
    'COURSE_NOT_FOUND',
    'STAGE_NOT_REFINEABLE',
    'RATE_LIMITED',
    'GENERATION_IN_PROGRESS',
    'MAX_ATTEMPTS_REACHED',
    'INTERNAL_ERROR',
  ]),
  message: z.string(),
});

export type RefinementError = z.infer<typeof refinementErrorSchema>;

// =============================================================================
// 2. Retry API
// =============================================================================

/**
 * POST /api/generation/retry
 *
 * Retries a failed node without affecting successful parallel siblings.
 */

// Request Schema
export const retryRequestSchema = z.object({
  /** Course ID */
  courseId: z.string().uuid(),

  /** Node ID to retry */
  nodeId: z.string(),

  /** Stage ID */
  stageId: z.enum([
    'stage_1',
    'stage_2',
    'stage_3',
    'stage_4',
    'stage_5',
    'stage_6',
  ]),

  /** Optional modified input for retry */
  modifiedInput: z.record(z.unknown()).optional(),
});

export type RetryRequest = z.infer<typeof retryRequestSchema>;

// Response Schema
export const retryResponseSchema = z.object({
  /** Whether retry was accepted */
  success: z.boolean(),

  /** New trace ID if accepted */
  traceId: z.string().uuid().optional(),

  /** Error message if rejected */
  error: z.string().optional(),
});

export type RetryResponse = z.infer<typeof retryResponseSchema>;

// =============================================================================
// 3. Approval API
// =============================================================================

/**
 * POST /api/generation/approve
 *
 * Approves a stage awaiting user confirmation.
 */

export const approvalRequestSchema = z.object({
  /** Course ID */
  courseId: z.string().uuid(),

  /** Stage to approve */
  stageId: z.enum([
    'stage_3',
    'stage_4',
    'stage_5',
    'stage_6',
  ]),

  /** Approval action */
  action: z.enum(['approve', 'reject']),

  /** Rejection reason (required if action === 'reject') */
  rejectionReason: z.string().max(500).optional(),

  /** Whether to regenerate after rejection */
  regenerateAfterReject: z.boolean().optional(),

  /** Custom prompt for regeneration */
  regenerationPrompt: z.string().max(2000).optional(),
});

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const approvalResponseSchema = z.object({
  success: z.boolean(),
  newStatus: z.string().optional(),
  error: z.string().optional(),
});

export type ApprovalResponse = z.infer<typeof approvalResponseSchema>;

// =============================================================================
// 4. Graph State API
// =============================================================================

/**
 * GET /api/generation/graph-state/:courseId
 *
 * Fetches the complete graph state for initial render.
 */

export const graphStateResponseSchema = z.object({
  /** Course metadata */
  course: z.object({
    id: z.string().uuid(),
    title: z.string(),
    status: z.string(),
    documentCount: z.number(),
    moduleCount: z.number(),
    lessonCount: z.number(),
  }),

  /** All nodes in the graph */
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['stage', 'document', 'lesson', 'module', 'merge', 'end']),
      status: z.enum(['pending', 'active', 'completed', 'error', 'awaiting']),
      label: z.string(),
      stageNumber: z.number().nullable(),
      progress: z.number().optional(),
      parentId: z.string().optional(),
      isCollapsed: z.boolean().optional(),
      metrics: z
        .object({
          duration: z.number().optional(),
          tokens: z.number().optional(),
          cost: z.number().optional(),
        })
        .optional(),
    })
  ),

  /** All edges in the graph */
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      status: z.enum(['idle', 'active', 'completed', 'error']),
    })
  ),

  /** Overall stats */
  stats: z.object({
    overallProgress: z.number(),
    elapsedTime: z.number(),
    totalCost: z.number(),
    completedStages: z.number(),
    totalStages: z.number(),
  }),
});

export type GraphStateResponse = z.infer<typeof graphStateResponseSchema>;

// =============================================================================
// 5. Trace Details API
// =============================================================================

/**
 * GET /api/generation/trace/:traceId
 *
 * Fetches detailed trace data for the node details drawer.
 */

export const traceDetailsResponseSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  stage: z.string(),
  phase: z.string(),
  stepName: z.string(),

  /** Input data (JSON) */
  inputData: z.record(z.unknown()),

  /** Output data (JSON) */
  outputData: z.record(z.unknown()),

  /** Error data if failed */
  errorData: z.record(z.unknown()).optional(),

  /** Processing metrics */
  metrics: z.object({
    model: z.string().optional(),
    tokens: z.number().optional(),
    duration: z.number().optional(),
    cost: z.number().optional(),
    qualityScore: z.number().optional(),
    wasCached: z.boolean().optional(),
    temperature: z.number().optional(),
  }),

  /** Retry attempt number */
  retryAttempt: z.number().optional(),

  /** Timestamp */
  createdAt: z.string().datetime(),

  /** All attempts for this node */
  allAttempts: z
    .array(
      z.object({
        attemptNumber: z.number(),
        status: z.enum(['success', 'failed']),
        timestamp: z.string().datetime(),
        refinementMessage: z.string().optional(),
      })
    )
    .optional(),
});

export type TraceDetailsResponse = z.infer<typeof traceDetailsResponseSchema>;

// =============================================================================
// 6. Viewport Persistence (Client-Side)
// =============================================================================

/**
 * Session storage schema for viewport state
 */
export const viewportStateSchema = z.object({
  /** Zoom level */
  zoom: z.number().min(0.1).max(4),

  /** Pan X position */
  x: z.number(),

  /** Pan Y position */
  y: z.number(),

  /** Timestamp of last save */
  savedAt: z.string().datetime(),
});

export type ViewportState = z.infer<typeof viewportStateSchema>;

// =============================================================================
// 7. User Preferences (Client-Side)
// =============================================================================

/**
 * LocalStorage schema for user preferences
 */
export const userPreferencesSchema = z.object({
  /** Preferred view mode */
  viewMode: z.enum(['graph', 'list']),

  /** Collapsed module IDs */
  collapsedModules: z.array(z.string()),

  /** Whether to show minimap */
  showMinimap: z.boolean(),

  /** Refinement chat collapsed state */
  refinementChatCollapsed: z.boolean(),

  /** Locale preference */
  locale: z.enum(['ru', 'en']),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

// =============================================================================
// 8. WebSocket/Realtime Events
// =============================================================================

/**
 * Realtime event types received from Supabase
 */
export const realtimeEventSchema = z.discriminatedUnion('type', [
  // Trace inserted
  z.object({
    type: z.literal('trace_insert'),
    payload: z.object({
      id: z.string().uuid(),
      courseId: z.string().uuid(),
      stage: z.string(),
      phase: z.string(),
      status: z.string(),
    }),
  }),

  // Course status changed
  z.object({
    type: z.literal('course_update'),
    payload: z.object({
      courseId: z.string().uuid(),
      newStatus: z.string(),
      progress: z.number().optional(),
    }),
  }),

  // Connection status
  z.object({
    type: z.literal('connection'),
    payload: z.object({
      status: z.enum(['connected', 'disconnected', 'reconnecting']),
    }),
  }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
