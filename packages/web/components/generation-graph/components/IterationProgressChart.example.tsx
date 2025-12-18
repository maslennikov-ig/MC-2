/**
 * Example usage of IterationProgressChart
 *
 * This file demonstrates how to use the IterationProgressChart component
 * in different scenarios.
 */

import { IterationProgressChart } from './IterationProgressChart';
import type { RefinementIterationDisplay } from '@megacampus/shared-types';

// Example 1: Single completed iteration with improvement
const exampleIterations1: RefinementIterationDisplay[] = [
  {
    iterationNumber: 1,
    status: 'completed',
    tasks: [],
    startScore: 0.72,
    endScore: 0.85,
    improvement: 0.13,
    sectionsLocked: [],
    tokensUsed: 15000,
    durationMs: 45000,
    startedAt: new Date(),
    completedAt: new Date(),
  },
];

function Example1() {
  return (
    <IterationProgressChart
      iterations={exampleIterations1}
      currentIteration={1}
      initialScore={0.72}
      targetScore={0.85}
      className="mb-4"
    />
  );
}

// Example 2: Two iterations - first improved, second in progress
const exampleIterations2: RefinementIterationDisplay[] = [
  {
    iterationNumber: 1,
    status: 'completed',
    tasks: [],
    startScore: 0.68,
    endScore: 0.78,
    improvement: 0.10,
    sectionsLocked: ['intro'],
    tokensUsed: 12000,
    durationMs: 38000,
    startedAt: new Date(Date.now() - 60000),
    completedAt: new Date(Date.now() - 20000),
  },
  {
    iterationNumber: 2,
    status: 'active',
    tasks: [],
    startScore: 0.78,
    endScore: null,
    improvement: null,
    sectionsLocked: [],
    tokensUsed: 8000,
    durationMs: null,
    startedAt: new Date(),
    completedAt: null,
  },
];

function Example2() {
  return (
    <IterationProgressChart
      iterations={exampleIterations2}
      currentIteration={2}
      initialScore={0.68}
      targetScore={0.85}
    />
  );
}

// Example 3: Three iterations with regression in second
const exampleIterations3: RefinementIterationDisplay[] = [
  {
    iterationNumber: 1,
    status: 'completed',
    tasks: [],
    startScore: 0.65,
    endScore: 0.75,
    improvement: 0.10,
    sectionsLocked: ['intro'],
    tokensUsed: 10000,
    durationMs: 35000,
    startedAt: new Date(Date.now() - 120000),
    completedAt: new Date(Date.now() - 90000),
  },
  {
    iterationNumber: 2,
    status: 'completed',
    tasks: [],
    startScore: 0.75,
    endScore: 0.72,
    improvement: -0.03,
    sectionsLocked: [],
    tokensUsed: 9000,
    durationMs: 30000,
    startedAt: new Date(Date.now() - 90000),
    completedAt: new Date(Date.now() - 60000),
  },
  {
    iterationNumber: 3,
    status: 'completed',
    tasks: [],
    startScore: 0.72,
    endScore: 0.88,
    improvement: 0.16,
    sectionsLocked: ['intro', 'main-concept'],
    tokensUsed: 11000,
    durationMs: 40000,
    startedAt: new Date(Date.now() - 60000),
    completedAt: new Date(),
  },
];

function Example3() {
  return (
    <IterationProgressChart
      iterations={exampleIterations3}
      currentIteration={3}
      initialScore={0.65}
      targetScore={0.85}
    />
  );
}

// Example 4: Pending iteration (not started yet)
const exampleIterations4: RefinementIterationDisplay[] = [
  {
    iterationNumber: 1,
    status: 'pending',
    tasks: [],
    startScore: 0.70,
    endScore: null,
    improvement: null,
    sectionsLocked: [],
    tokensUsed: 0,
    durationMs: null,
    startedAt: new Date(),
    completedAt: null,
  },
];

function Example4() {
  return (
    <IterationProgressChart
      iterations={exampleIterations4}
      currentIteration={0}
      initialScore={0.70}
      targetScore={0.85}
    />
  );
}

export { Example1, Example2, Example3, Example4 };
