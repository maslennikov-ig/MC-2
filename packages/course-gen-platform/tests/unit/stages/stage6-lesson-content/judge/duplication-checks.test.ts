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
    expect(result.introOverlapPairs).toHaveLength(0);
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
    expect(result.introOverlapPairs).toHaveLength(0);
    expect(result.overlapPairs[0].overlap).toBeGreaterThanOrEqual(0.32);
  });

  it('should detect high overlap between introduction and later sections', () => {
    const repeatedIntroCore =
      'A robust experimentation loop starts by defining a baseline, selecting the primary metric, and setting a strict stopping rule before collecting results. Teams then instrument every step, track confidence intervals, and document assumptions so outcomes remain interpretable under changing traffic patterns. Finally, they pre-register decision criteria and rollback plans to avoid biased conclusions after observing intermediate data.';

    const content = `## Introduction
${repeatedIntroCore}
This section frames why disciplined measurement protects product decisions.

## Experiment Design
${repeatedIntroCore}
Use guardrail metrics and preplanned checks to keep releases safe.

## Practical Checklist
Summarize owners, timelines, and release criteria before launching any experiment.`;

    const result = checkSectionDuplication(content);

    expect(result.passed).toBe(false);
    expect(result.overlapPairs).toHaveLength(0);
    expect(result.introOverlapPairs.length).toBeGreaterThan(0);
    expect(result.introOverlapPairs[0].overlap).toBeGreaterThanOrEqual(0.32);
  });

  it('should recognize localized introduction headers for intro overlap checks', () => {
    const repeatedIntroCore =
      'Ein robustes Experimentierverfahren beginnt mit einer klaren Basislinie, einer primären Metrik und einer festen Stoppregel vor dem Start. Teams instrumentieren danach jeden Schritt, beobachten Konfidenzintervalle und dokumentieren Annahmen, damit Ergebnisse unter wechselnder Last interpretierbar bleiben. Anschließend werden Entscheidungsregeln und Rollback-Pläne vorab festgelegt, um verzerrte Entscheidungen nach Zwischenergebnissen zu vermeiden.';

    const content = `## Einführung
${repeatedIntroCore}

## Experimentdesign
${repeatedIntroCore}

## Nächste Schritte
Fasse Verantwortlichkeiten und Testkriterien kompakt zusammen.`;

    const result = checkSectionDuplication(content);

    expect(result.passed).toBe(false);
    expect(result.overlapPairs).toHaveLength(0);
    expect(result.introOverlapPairs.length).toBeGreaterThan(0);
  });

  it('should treat preface before first section as synthetic intro for overlap detection', () => {
    const repeatedPreface =
      'A reliable delegation system starts with explicit ownership boundaries, measurable outcomes, and response windows agreed by every participant. Teams then map handoffs, identify escalation paths, and document assumptions so accountability remains stable under pressure. Finally, they align reporting cadence with decision checkpoints to avoid silent drift between intent and execution.';

    const content = `# Delegation Systems

${repeatedPreface}

## Responsibility Matrix
${repeatedPreface}

## Execution Cadence
Define check-in points and escalation timelines for cross-functional work.`;

    const result = checkSectionDuplication(content);

    expect(result.passed).toBe(false);
    expect(result.overlapPairs).toHaveLength(0);
    expect(result.introOverlapPairs.length).toBeGreaterThan(0);
    expect(result.introOverlapPairs[0].introTitle).toBe('Preface (before first section)');
  });

  it('should avoid intro overlap flags when introduction is too short', () => {
    const repeatedSnippet =
      'Track assumptions, metrics, and risk controls for every release decision.';

    const content = `## Introduction
${repeatedSnippet}

## Deployment Controls
${repeatedSnippet}
Add rollout gates, telemetry checks, and rollback criteria for production safety.`;

    const result = checkSectionDuplication(content);

    expect(result.introOverlapPairs).toHaveLength(0);
    expect(result.overlapPairs).toHaveLength(0);
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
    expect(result.introOverlapPairs).toHaveLength(0);
  });
});
