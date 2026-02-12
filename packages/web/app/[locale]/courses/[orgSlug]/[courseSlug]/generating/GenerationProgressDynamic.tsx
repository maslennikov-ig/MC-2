'use client'

import dynamic from 'next/dynamic'
import { GraphSkeleton } from '@/components/generation-graph/GraphSkeleton'
import type { GenerationProgress, CourseStatus } from '@/types/course-generation'
import type { Stage1CourseData } from '@/components/generation-graph/GraphViewWrapper'

/**
 * Dynamic import wrapper for GenerationProgressContainerEnhanced.
 * MUST be inside a Client Component for ssr: false to work.
 *
 * This prevents the entire generation progress tree from being included
 * in the initial server bundle:
 * - framer-motion (~430KB unminified)
 * - canvas-confetti (~25KB)
 * - supabase client
 * - GraphViewWrapper (which itself lazy-loads React Flow)
 * - server action imports
 *
 * Estimated savings: ~300-500KB from First Load JS.
 */
const GenerationProgressContainerEnhanced = dynamic(
  () => import('./GenerationProgressContainerEnhanced'),
  {
    ssr: false,
    loading: () => (
      <div className="relative h-screen w-full">
        <GraphSkeleton />
      </div>
    ),
  }
)

interface GenerationProgressDynamicProps {
  courseId: string
  orgSlug: string
  courseSlug: string
  initialProgress: GenerationProgress
  initialStatus: CourseStatus
  courseTitle: string
  autoRedirect?: boolean
  redirectDelay?: number
  userRole?: string | null
  failedAtStage?: number | null
  generationCode?: string | null
  stage1CourseData?: Stage1CourseData
  generationMode?: 'automatic' | 'semi_automatic' | null
  generationPausedAt?: string | null
}

export default function GenerationProgressDynamic(props: GenerationProgressDynamicProps) {
  return <GenerationProgressContainerEnhanced {...props} />
}
