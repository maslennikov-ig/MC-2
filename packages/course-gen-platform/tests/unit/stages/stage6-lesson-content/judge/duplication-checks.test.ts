/**
 * Unit tests for section duplication checks
 * @module tests/unit/stages/stage6-lesson-content/judge/duplication-checks
 */

import { describe, it, expect } from 'vitest';
import { checkSectionDuplication } from '@/stages/stage6-lesson-content/judge/filters/duplication-checks';

describe('checkSectionDuplication', () => {
  it('should pass when section titles and bodies are distinct', () => {
    const content = `## Introduction
This lesson introduces the core ideas behind feature engineering for tabular datasets.
We focus on practical transformations and clear evaluation strategy.

## Feature Scaling
Feature scaling normalizes numeric ranges so gradient-based optimizers converge faster.
Common approaches include standardization and min-max normalization.

## Model Evaluation
Model evaluation compares candidate models with stable validation splits and clear metrics.
Error analysis helps prioritize the next improvement step.`;

    const result = checkSectionDuplication(content);

    expect(result.passed).toBe(true);
    expect(result.duplicatePairs).toHaveLength(0);
    expect(result.overlapPairs).toHaveLength(0);
  });

  it('should detect near-duplicate section titles', () => {
    const content = `## Data Pipeline Setup
Outline the data pipeline architecture and ingestion plan.

## Data Pipeline Set-Up
Describe orchestration details, queueing strategy, and checkpointing for reliability.`;

    const result = checkSectionDuplication(content);

    expect(result.passed).toBe(false);
    expect(result.duplicatePairs.length).toBeGreaterThan(0);
    expect(result.failure?.filter).toBe('sectionDuplication');
  });

  it('should detect high body overlap across different section titles', () => {
    const repeatedCore =
      'Data validation starts with schema checks, null audits, range controls, and duplicate detection before any feature work begins. Then we profile distributions, check drift against baseline snapshots, and log anomalies for triage. We also document assumptions, ownership boundaries, and remediation playbooks so the team can recover quickly when data quality drops.';

    const content = `## Validation Workflow
${repeatedCore}
Add contract tests that block releases when critical quality rules regress.

## Operational Safeguards
${repeatedCore}
Run incident drills quarterly and track MTTR trends to verify reliability gains.`;

    const result = checkSectionDuplication(content);

    expect(result.passed).toBe(false);
    expect(result.duplicatePairs).toHaveLength(0);
    expect(result.overlapPairs.length).toBeGreaterThan(0);
    expect(result.overlapPairs[0].overlap).toBeGreaterThanOrEqual(0.32);
  });

  it('should ignore overlap checks for exercise and digest sections', () => {
    const repeatedTemplate =
      '**Task:** Implement a small script and explain your design choices. **Hint:** Start from the provided scaffold and iterate in small steps.';

    const content = `## Exercises
${repeatedTemplate}

## Lesson Digest
${repeatedTemplate}`;

    const result = checkSectionDuplication(content);

    expect(result.overlapPairs).toHaveLength(0);
  });
});
