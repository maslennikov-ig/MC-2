/**
 * Mermaid Pipeline Health Check
 * @module stages/stage6-lesson-content/utils/mermaid-health-check
 *
 * Provides health check functionality to verify the Mermaid fix pipeline
 * is working correctly. Useful for production monitoring and debugging.
 */

import { validateMermaidSyntax } from './mermaid-validator';
import { sanitizeMermaidBlocks } from './mermaid-sanitizer';
import { logger } from '@/shared/logger';

/**
 * Health check result
 */
export interface MermaidHealthCheckResult {
  healthy: boolean;
  checks: {
    name: string;
    passed: boolean;
    error?: string;
    durationMs: number;
  }[];
  totalDurationMs: number;
}

/**
 * Test cases for health check
 */
const TEST_CASES = [
  {
    name: 'valid_flowchart',
    diagram: 'graph TD\n  A-->B',
    shouldBeValid: true,
  },
  {
    name: 'valid_sequence',
    diagram: 'sequenceDiagram\n  A->>B: Hello',
    shouldBeValid: true,
  },
  {
    name: 'invalid_syntax',
    diagram: 'invalid mermaid code',
    shouldBeValid: false,
  },
  {
    name: 'sanitizer_escaped_quotes',
    diagram: '```mermaid\ngraph TD\n  A[\\"test\\"]\n```',
    shouldSanitize: true,
  },
];

/**
 * Run health check on Mermaid pipeline
 *
 * Tests:
 * 1. Valid diagrams are recognized as valid
 * 2. Invalid diagrams are recognized as invalid
 * 3. Sanitizer fixes known issues
 *
 * @returns Health check result with detailed status
 *
 * @example
 * ```typescript
 * const result = await healthCheckMermaidPipeline();
 * if (!result.healthy) {
 *   console.error('Pipeline unhealthy:', result.checks.filter(c => !c.passed));
 * }
 * ```
 */
export async function healthCheckMermaidPipeline(): Promise<MermaidHealthCheckResult> {
  const startTime = Date.now();
  const checks: MermaidHealthCheckResult['checks'] = [];

  logger.debug('Mermaid health check: Starting');

  for (const testCase of TEST_CASES) {
    const checkStart = Date.now();

    try {
      if ('shouldBeValid' in testCase) {
        const result = await validateMermaidSyntax(testCase.diagram);
        const passed = result.valid === testCase.shouldBeValid;

        checks.push({
          name: testCase.name,
          passed,
          error: passed
            ? undefined
            : `Expected valid=${testCase.shouldBeValid}, got ${result.valid}`,
          durationMs: Date.now() - checkStart,
        });
      }

      if ('shouldSanitize' in testCase) {
        const result = sanitizeMermaidBlocks(testCase.diagram);
        const passed = result.modified === testCase.shouldSanitize;

        checks.push({
          name: testCase.name,
          passed,
          error: passed
            ? undefined
            : `Expected modified=${testCase.shouldSanitize}, got ${result.modified}`,
          durationMs: Date.now() - checkStart,
        });
      }
    } catch (error) {
      checks.push({
        name: testCase.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - checkStart,
      });
    }
  }

  const healthy = checks.every(c => c.passed);
  const totalDurationMs = Date.now() - startTime;

  logger.info(
    {
      healthy,
      passedChecks: checks.filter(c => c.passed).length,
      totalChecks: checks.length,
      totalDurationMs,
    },
    'Mermaid health check: Complete'
  );

  return { healthy, checks, totalDurationMs };
}
