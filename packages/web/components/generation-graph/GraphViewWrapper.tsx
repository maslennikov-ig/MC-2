'use client';

import dynamic from 'next/dynamic';
import { GraphSkeleton } from './GraphSkeleton';

// Dynamic import MUST be inside a Client Component for ssr: false to work
// This prevents React Flow from being included in server bundle
const GraphViewDynamic = dynamic(
  () => import('./GraphView').then((mod) => ({ default: mod.GraphView })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />,
  }
);

/**
 * Pre-loaded Stage 1 course data from database.
 * Used to display course info BEFORE generation starts (no traces yet).
 * Uses generic Record types for compatibility with GraphView/useGraphData.
 * The Stage 1 panel components will validate and cast to specific types.
 */
export interface Stage1CourseData {
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
}

// Re-export props type from GraphView for type safety
export interface GraphViewWrapperProps {
  courseId: string;
  courseTitle?: string;
  /**
   * Whether the course has documents.
   * When false, Stage 2 (Document Processing) and Stage 3 (Classification)
   * are marked as 'skipped' in the graph visualization.
   * @default true
   */
  hasDocuments?: boolean;
  /** Stage number where generation failed (from courses.failed_at_stage) */
  failedAtStage?: number | null;
  /**
   * Actual progress percentage from the database (0-100).
   * When provided, this is used instead of calculating from status.
   * Ensures consistency with CelestialHeader progress display.
   */
  progressPercentage?: number;
  /** Human-readable generation code (e.g., "ABC-1234") for debugging */
  generationCode?: string | null;
  /**
   * Pre-loaded Stage 1 course data.
   * When provided, Stage 1 node displays this data immediately
   * instead of waiting for traces from generation.
   */
  stage1CourseData?: Stage1CourseData;
}

/**
 * Wrapper component that handles SSR-safe loading of React Flow.
 *
 * USE THIS instead of GraphView directly when importing from Server Components
 * or any component that might be rendered on the server.
 *
 * @example
 * // In a page or server component:
 * import { GraphViewWrapper } from '@/components/generation-graph';
 *
 * export default function Page() {
 *   return <GraphViewWrapper courseId="123" courseTitle="My Course" />;
 * }
 */
export function GraphViewWrapper({ courseId, courseTitle, hasDocuments, failedAtStage, progressPercentage, generationCode, stage1CourseData }: GraphViewWrapperProps) {
  return <GraphViewDynamic courseId={courseId} courseTitle={courseTitle} hasDocuments={hasDocuments} failedAtStage={failedAtStage} progressPercentage={progressPercentage} generationCode={generationCode} stage1CourseData={stage1CourseData} />;
}

// Default export for dynamic import compatibility
export default GraphViewWrapper;
