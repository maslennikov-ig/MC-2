/**
 * Auto-classification rules for error logs
 * @module shared/logger/auto-classification
 *
 * These patterns are auto-muted because they represent expected system behavior,
 * not actual bugs. Add new patterns here when you identify recurring non-issues.
 *
 * IMPORTANT: Also update .claude/skills/process-logs/SKILL.md when adding rules!
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
