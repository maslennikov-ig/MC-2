/* eslint-disable */
/**
 * Test to ensure AUTO_MUTE_RULES stay in sync with documentation
 *
 * This test validates that:
 * 1. All rule categories are documented in process-logs skill
 * 2. Rule count is tracked (alerts when rules significantly change)
 *
 * @module tests/unit/auto-classification-docs-sync.test
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AUTO_MUTE_RULES } from '@/shared/logger/auto-classification';

describe('AUTO_MUTE_RULES documentation sync', () => {
  // Resolve from monorepo root (packages/course-gen-platform/src/shared/logger/__tests__ → mc2/)
  const SKILL_FILE_PATH = path.resolve(
    __dirname,
    '../../../../../../.claude/skills/process-logs/SKILL.md'
  );

  it('should have all rule categories documented in process-logs skill', () => {
    // Get unique categories from code
    const codeCategories = [...new Set(AUTO_MUTE_RULES.map(r => r.reason))];

    // Read skill file
    const skillContent = fs.readFileSync(SKILL_FILE_PATH, 'utf-8');

    // Check each category is mentioned
    for (const category of codeCategories) {
      expect(
        skillContent.includes(category),
        `Category "${category}" not found in process-logs/SKILL.md. ` +
          `Please update the skill documentation when adding new auto-mute rules.`
      ).toBe(true);
    }
  });

  it('should track rule count changes', () => {
    // Minimum expected count - rules only grow over time
    const MIN_RULE_COUNT = 20;

    expect(
      AUTO_MUTE_RULES.length,
      `Rule count is ${AUTO_MUTE_RULES.length}, expected at least ${MIN_RULE_COUNT}.`
    ).toBeGreaterThanOrEqual(MIN_RULE_COUNT);
  });

  it('should have valid rule structure', () => {
    for (const rule of AUTO_MUTE_RULES) {
      // Pattern must be a regex
      expect(rule.pattern).toBeInstanceOf(RegExp);

      // Reason must be non-empty string
      expect(typeof rule.reason).toBe('string');
      expect(rule.reason.length).toBeGreaterThan(0);

      // Description must be non-empty string
      expect(typeof rule.description).toBe('string');
      expect(rule.description.length).toBeGreaterThan(0);

      // Reason should be one of known categories
      const KNOWN_CATEGORIES = [
        'graceful_shutdown',
        'monitoring_probe',
        'external_service',
        'cascading_repair',
        'job_lifecycle',
        'expected_behavior',
        'graceful_fallback',
        'ui_race_condition',
      ];
      expect(KNOWN_CATEGORIES).toContain(rule.reason);
    }
  });

  it('should have skill file accessible', () => {
    expect(
      fs.existsSync(SKILL_FILE_PATH),
      `Skill file not found at ${SKILL_FILE_PATH}. ` +
        `Ensure .claude/skills/process-logs/SKILL.md exists.`
    ).toBe(true);
  });
});
