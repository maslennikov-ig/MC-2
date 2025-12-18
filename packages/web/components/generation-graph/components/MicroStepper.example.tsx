/**
 * Example usage of MicroStepper component
 * This file demonstrates how to use the MicroStepper in different scenarios
 */

import { MicroStepper } from './MicroStepper';
import { MicroStepperState } from '@megacampus/shared-types';

// Example 1: All pending (lesson not started)
const pendingState: MicroStepperState = {
  nodes: [
    { node: 'planner', status: 'pending' },
    { node: 'expander', status: 'pending' },
    { node: 'assembler', status: 'pending' },
    { node: 'smoother', status: 'pending' },
    { node: 'judge', status: 'pending' },
  ],
};

// Example 2: Active processing (expander is running)
const activeState: MicroStepperState = {
  nodes: [
    { node: 'planner', status: 'completed' },
    { node: 'expander', status: 'active' },
    { node: 'assembler', status: 'pending' },
    { node: 'smoother', status: 'pending' },
    { node: 'judge', status: 'pending' },
  ],
};

// Example 3: In refinement loop (judge requesting improvements)
const loopState: MicroStepperState = {
  nodes: [
    { node: 'planner', status: 'completed' },
    { node: 'expander', status: 'completed' },
    { node: 'assembler', status: 'completed' },
    { node: 'smoother', status: 'completed' },
    { node: 'judge', status: 'loop' },
  ],
};

// Example 4: Error state (assembler failed)
const errorState: MicroStepperState = {
  nodes: [
    { node: 'planner', status: 'completed' },
    { node: 'expander', status: 'completed' },
    { node: 'assembler', status: 'error' },
    { node: 'smoother', status: 'pending' },
    { node: 'judge', status: 'pending' },
  ],
};

// Example 5: Completed successfully
const completedState: MicroStepperState = {
  nodes: [
    { node: 'planner', status: 'completed' },
    { node: 'expander', status: 'completed' },
    { node: 'assembler', status: 'completed' },
    { node: 'smoother', status: 'completed' },
    { node: 'judge', status: 'completed' },
  ],
};

/**
 * Example component showing different MicroStepper states
 */
export function MicroStepperExamples() {
  return (
    <div className="space-y-8 p-8">
      <h2 className="text-2xl font-bold">MicroStepper Examples</h2>

      {/* Small size examples (for table cells) */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Small Size (for tables)</h3>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Pending:</span>
          <MicroStepper state={pendingState} size="sm" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Active:</span>
          <MicroStepper state={activeState} size="sm" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Refinement Loop:</span>
          <MicroStepper state={loopState} size="sm" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Error:</span>
          <MicroStepper state={errorState} size="sm" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Completed:</span>
          <MicroStepper state={completedState} size="sm" />
        </div>
      </section>

      {/* Medium size examples */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Medium Size (for larger displays)</h3>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Pending:</span>
          <MicroStepper state={pendingState} size="md" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Active:</span>
          <MicroStepper state={activeState} size="md" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Refinement Loop:</span>
          <MicroStepper state={loopState} size="md" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Error:</span>
          <MicroStepper state={errorState} size="md" />
        </div>

        <div className="flex items-center gap-4">
          <span className="w-32 text-sm text-slate-600 dark:text-slate-400">Completed:</span>
          <MicroStepper state={completedState} size="md" />
        </div>
      </section>

      {/* In table context */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">In Table Context</h3>
        <table className="w-full border-collapse border border-slate-200 dark:border-slate-700">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              <th className="border border-slate-200 dark:border-slate-700 px-4 py-2 text-left">Lesson</th>
              <th className="border border-slate-200 dark:border-slate-700 px-4 py-2 text-left">Status</th>
              <th className="border border-slate-200 dark:border-slate-700 px-4 py-2 text-left">Pipeline</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">Урок 1</td>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">Завершено</td>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">
                <MicroStepper state={completedState} size="sm" />
              </td>
            </tr>
            <tr>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">Урок 2</td>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">Выполняется</td>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">
                <MicroStepper state={activeState} size="sm" />
              </td>
            </tr>
            <tr>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">Урок 3</td>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">Ошибка</td>
              <td className="border border-slate-200 dark:border-slate-700 px-4 py-2">
                <MicroStepper state={errorState} size="sm" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
