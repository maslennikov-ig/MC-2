/**
 * Auto-classification rules for error logs
 * @module shared/logger/auto-classification
 *
 * These patterns are auto-muted because they represent expected system behavior,
 * not actual bugs. Add new patterns here when you identify recurring non-issues.
 *
 * IMPORTANT: Also update .claude/skills/process-logs/SKILL.md when adding rules!
 *
 * ## Performance Considerations
 *
 * Current implementation uses O(n) linear scan through all rules.
 * With 6 rules, this is negligible (<1ms per call).
 *
 * ### If rules grow to 50+, consider these optimizations:
 *
 * 1. **Pre-filtering by keyword** - Check for common substrings first:
 *    ```typescript
 *    if (msg.includes('Redis')) return checkShutdownRules(msg);
 *    if (msg.includes('health')) return checkProbeRules(msg);
 *    ```
 *
 * 2. **Compiled regex union** - Combine patterns into single regex:
 *    ```typescript
 *    const COMBINED = /(Redis connection (ended|closed))|(graceful.*shutdown)/i;
 *    ```
 *
 * 3. **LRU cache** - Memoize results for repeated errors:
 *    ```typescript
 *    const cache = new Map<string, AutoMuteResult>();
 *    ```
 *
 * 4. **Trie-based matching** - For prefix-heavy patterns
 *
 * Current rule count: 40 (no optimization needed)
 * Review threshold: 30+ rules
 */

export interface AutoMuteRule {
  /** Regex pattern to match against error_message */
  pattern: RegExp;
  /** Short category identifier for grouping */
  reason: string;
  /** Human-readable description for notes field */
  description: string;
}

/**
 * Auto-mute rules for expected errors
 *
 * Categories:
 * - graceful_shutdown: Normal app lifecycle events
 * - monitoring_probe: Health checks from external tools
 * - external_service: Third-party service issues (not our bug)
 * - cascading_repair: Repair layers working as expected (Layer 1/2/3)
 * - job_lifecycle: BullMQ job management events
 */
export const AUTO_MUTE_RULES: AutoMuteRule[] = [
  // === Graceful Shutdown Events ===
  {
    pattern: /Redis connection (ended|closed)/i,
    reason: 'graceful_shutdown',
    description: 'Redis disconnects during app restart - normal behavior',
  },
  {
    pattern: /graceful.*shutdown/i,
    reason: 'graceful_shutdown',
    description: 'Server shutdown events - expected during deploys',
  },
  {
    pattern: /Shutdown already in progress/i,
    reason: 'graceful_shutdown',
    description: 'Duplicate shutdown signal received - expected during process termination',
  },

  // === Monitoring & Health Probes ===
  {
    pattern: /\/api\/trpc\/health.*404/i,
    reason: 'monitoring_probe',
    description: 'Health endpoint probes from monitoring tools (Uptime Kuma, k8s)',
  },
  {
    pattern: /\/health.*404/i,
    reason: 'monitoring_probe',
    description: 'Generic health check probes - monitoring infrastructure',
  },
  {
    pattern: /No procedure found on path "health"/i,
    reason: 'monitoring_probe',
    description: 'tRPC health endpoint probe - monitoring infrastructure',
  },

  // === External Service Issues ===
  {
    pattern: /Cloudflare.*5\d{2}/i,
    reason: 'external_service',
    description: 'Cloudflare edge errors - not our bug',
  },
  {
    pattern: /ECONNRESET.*external/i,
    reason: 'external_service',
    description: 'External API connection resets - transient network issues',
  },

  // === Cascading Repair System ===
  {
    pattern: /Layer failed, trying next/i,
    reason: 'cascading_repair',
    description: 'Repair layer failed, system trying next layer - expected cascading behavior',
  },
  {
    pattern: /Critique-revise attempt failed/i,
    reason: 'cascading_repair',
    description: 'Layer 2 retry attempt failed - expected when LLM output needs repair',
  },
  {
    pattern: /Zod.*validation failed.*Layer/i,
    reason: 'cascading_repair',
    description: 'Layer 1 validation failed, escalating to Layer 2/3 - expected repair flow',
  },

  // === Deploy & Startup Events ===
  {
    pattern: /Queue error.*getaddrinfo.*redis/i,
    reason: 'graceful_shutdown',
    description: 'Redis DNS resolution during container startup - expected during deploys',
  },
  {
    pattern: /Health check failed.*Connection.*closed/i,
    reason: 'graceful_shutdown',
    description: 'Health check failed due to Redis connection closed - expected during deploys',
  },
  {
    pattern: /QueueEvents error.*non-fatal/i,
    reason: 'graceful_shutdown',
    description: 'BullMQ QueueEvents error during startup - explicitly non-fatal',
  },
  {
    pattern: /GET \/health 503/i,
    reason: 'monitoring_probe',
    description: 'Health endpoint returning 503 during startup - expected during deploys',
  },

  // === Redis Reconnection Events ===
  {
    pattern: /Redis reconnecting in \d+ms/i,
    reason: 'graceful_shutdown',
    description: 'Redis auto-reconnect during restart - expected behavior',
  },

  // === UI Race Conditions ===
  {
    pattern: /Invalid status for approval.*Expected.*got/i,
    reason: 'ui_race_condition',
    description: 'User clicked approve but course already progressed - stale UI state',
  },

  // === Job Lifecycle Events ===
  {
    pattern: /Job stalled/i,
    reason: 'job_lifecycle',
    description:
      'BullMQ job exceeded lock duration and was restarted - expected for long LLM operations',
  },
  {
    pattern: /Failed to acquire generation lock/i,
    reason: 'job_lifecycle',
    description: 'Lock contention during concurrent processing - expected behavior',
  },
  {
    pattern: /already being processed.*Lock held by/i,
    reason: 'job_lifecycle',
    description: 'Course locked by another worker - prevents duplicate processing',
  },
  {
    pattern: /Worker fallback initialization failed.*continuing/i,
    reason: 'job_lifecycle',
    description: 'Worker fallback init failed but processing continues - non-critical warning',
  },

  // === Layer/Schema Fallbacks ===
  {
    pattern: /Layer \d+ \(partial-regen\) requires schema.*will be skipped/i,
    reason: 'cascading_repair',
    description: 'Layer 3 partial regeneration skipped - schema not available, expected fallback',
  },
  {
    pattern: /Using fallback.*for include_visuals/i,
    reason: 'cascading_repair',
    description:
      'Visual generation disabled due to config - expected when courseStyle lacks visuals',
  },
  {
    pattern: /Visual style validation failed.*using fallback/i,
    reason: 'cascading_repair',
    description: 'Visual style config invalid - falling back to no visuals, expected behavior',
  },
  {
    pattern: /Patcher.*REJECTED.*prompt template markers/i,
    reason: 'cascading_repair',
    description: 'LLM hallucinated prompt template - patcher correctly rejected, will retry',
  },
  {
    pattern: /Patcher failed.*edit attempt counted toward section lock/i,
    reason: 'cascading_repair',
    description: 'Patcher edit failed - counted toward lock limit, will retry or escalate',
  },
  {
    pattern: /Patcher.*REJECTED.*truncated/i,
    reason: 'graceful_fallback',
    description: 'Patcher detected truncated content, returns original safely - correct behavior',
  },
  {
    pattern: /No RAG chunks found for section/i,
    reason: 'expected_behavior',
    description: 'Course without documents - content generated without reference materials',
  },
  {
    pattern: /Mermaid.*fallback.*used|Mermaid.*fix failed.*using fallback/i,
    reason: 'graceful_fallback',
    description: 'Mermaid diagram generation failed - graceful fallback to text description',
  },
  {
    pattern: /Invalid job name \(undefined\)/i,
    reason: 'job_lifecycle',
    description: 'Corrupted or legacy job without proper type - safe to ignore',
  },
  {
    pattern: /job\.name is undefined.*corrupted/i,
    reason: 'job_lifecycle',
    description: 'Job created without proper name - legacy or corrupted job',
  },
  {
    pattern: /Unexpected exit code: 10/i,
    reason: 'job_lifecycle',
    description: 'Worker TTL timeout (10 min) - job exceeded max time, will be retried',
  },

  // === Expected HTTP Responses ===
  {
    pattern: /\/trpc\/.*401/i,
    reason: 'expected_behavior',
    description: 'Unauthenticated tRPC request - 401 is correct response',
  },
  {
    pattern: /Job \d+ not found/i,
    reason: 'expected_behavior',
    description: 'Frontend polls job status after job record cleanup - expected race condition',
  },

  // === Cache & Config Warnings ===
  {
    pattern: /Cache directory does not exist/i,
    reason: 'expected_behavior',
    description: 'Cache directory missing on fresh environment - will be created when needed',
  },
  {
    pattern: /ModelConfigBunker.*sync.*fail/i,
    reason: 'external_service',
    description: 'ModelConfigBunker network issue - has retry with exponential backoff',
  },
  {
    pattern: /Failed to log generation trace/i,
    reason: 'expected_behavior',
    description: 'Trace insert failed during connection pool pressure - non-blocking telemetry',
  },

  // === Preprocessing Fallbacks ===
  {
    pattern: /Preprocessing failed.*using raw output/i,
    reason: 'graceful_fallback',
    description: 'Preprocessing failed, using raw LLM output - graceful degradation',
  },

  // === Stage 5 Model Fallbacks ===
  {
    pattern: /Stage 5.*Primary model attempt failed/i,
    reason: 'cascading_repair',
    description: 'Stage 5 primary model unavailable, will retry with fallback - expected behavior',
  },
];

export interface AutoMuteResult {
  /** Whether the error should be auto-muted */
  mute: boolean;
  /** Category reason (if muted) */
  reason?: string;
  /** Human-readable description (if muted) */
  description?: string;
}

/**
 * Check if an error message matches any auto-mute rules
 *
 * @param errorMessage - The error message to check
 * @returns AutoMuteResult indicating if error should be auto-muted
 *
 * @example
 * ```typescript
 * const result = shouldAutoMute('Redis connection ended, no more reconnections');
 * // { mute: true, reason: 'graceful_shutdown', description: 'Redis disconnects...' }
 *
 * const result2 = shouldAutoMute('Database constraint violation');
 * // { mute: false }
 * ```
 */
export function shouldAutoMute(errorMessage: string): AutoMuteResult {
  // Guard against null/undefined/non-string input
  if (!errorMessage || typeof errorMessage !== 'string') {
    return { mute: false };
  }

  for (const rule of AUTO_MUTE_RULES) {
    if (rule.pattern.test(errorMessage)) {
      return {
        mute: true,
        reason: rule.reason,
        description: rule.description,
      };
    }
  }
  return { mute: false };
}
