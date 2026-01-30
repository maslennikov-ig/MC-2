/**
 * Example Integration: ClarifyingPanel in NodeDetailsDrawer
 *
 * This example shows how to integrate the ClarifyingPanel into the existing
 * NodeDetailsDrawer when a clarifying node is selected.
 */

// In NodeDetailsDrawer.tsx, add this import:
// import { ClarifyingPanel } from './clarifying'

// Then add a case for the clarifying node type:

/*
export function NodeDetailsDrawer() {
  const { selectedNodeId, deselectNode } = useNodeSelection()
  const { getNode } = useReactFlow()

  const node = selectedNodeId ? getNode(selectedNodeId) : null
  const isOpen = !!node

  // ... existing code ...

  const renderContent = () => {
    if (!node) return null

    switch (node.type) {
      case 'stage':
        return <StageDetails node={node} />

      case 'clarifying':
        return <ClarifyingPanel courseId={courseId} onComplete={deselectNode} />

      case 'document':
        return <DocumentDetails node={node} />

      case 'lesson':
        return <LessonDetails node={node} />

      default:
        return <div>Unsupported node type</div>
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && deselectNode()}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>{node?.data?.label || 'Node Details'}</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          {renderContent()}
        </div>
      </SheetContent>
    </Sheet>
  )
}
*/

/**
 * Example: Adding Clarifying Node to Graph
 *
 * In useGraphData.ts or similar graph construction logic:
 */

/*
// Add after Stage 4 node creation
const clarifyingNode: AppNode = {
  id: 'clarifying',
  type: 'clarifying',
  position: { x: 400, y: 500 }, // Position below Stage 4
  data: {
    status: courseStatus === 'stage_4_clarifying' ? 'active' :
            hasAllQuestionsAnswered ? 'completed' : 'pending',
    questionsCount: totalQuestions,
    answeredCount: answeredQuestions,
    criticalAnswered: criticalAnswered,
    criticalTotal: criticalTotal,
  },
}

// Add edge from Stage 4 to Clarifying
const stage4ToClarifying: AppEdge = {
  id: 'stage_4-clarifying',
  source: 'stage_4',
  target: 'clarifying',
  type: 'animated',
  animated: courseStatus === 'stage_4_clarifying',
}

// Add edge from Clarifying to Stage 5
const clarifyingToStage5: AppEdge = {
  id: 'clarifying-stage_5',
  source: 'clarifying',
  target: 'stage_5',
  type: 'animated',
  animated: courseStatus === 'stage_5_active',
}
*/

/**
 * Example: tRPC Router Integration (when backend is ready)
 *
 * Replace mock hooks in ClarifyingPanel.tsx with:
 */

/*
// In ClarifyingPanel.tsx:

import { trpc } from '@/lib/trpc/client'

function useGetQuestions(courseId: string) {
  return trpc.clarifying.getQuestions.useQuery({ courseId })
}

function useSubmitAnswer() {
  return trpc.clarifying.submitAnswer.useMutation()
}

function useSkipQuestion() {
  return trpc.clarifying.skipQuestion.useMutation()
}

function useApproveAndProceed() {
  return trpc.clarifying.approveAndProceed.useMutation()
}

// Expected tRPC router structure (backend):

const clarifyingRouter = router({
  getQuestions: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ input }) => {
      // Fetch questions from database
      return questions // Question[]
    }),

  submitAnswer: publicProcedure
    .input(z.object({
      courseId: z.string(),
      questionId: z.string(),
      answer: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Save answer to database
    }),

  skipQuestion: publicProcedure
    .input(z.object({
      courseId: z.string(),
      questionId: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Mark question as skipped
    }),

  approveAndProceed: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ input }) => {
      // Transition FSM to next stage
      // Update course status to 'stage_5_active'
    }),
})
*/

export {}
