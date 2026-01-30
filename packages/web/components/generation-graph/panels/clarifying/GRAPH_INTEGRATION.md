# Graph Integration - Clarifying Node

## Visual Flow

```
┌─────────────┐
│   Stage 4   │
│  Analysis   │
│  & Structure│
└──────┬──────┘
       │ (analysis complete)
       ▼
┌─────────────────────┐
│ Clarifying Node     │
│ ┌─────────────────┐ │
│ │ Questions: 3/5  │ │
│ │ Critical: 2/2 ✓ │ │
│ │ ▓▓▓▓▓░░░░░ 60% │ │
│ └─────────────────┘ │
└──────┬──────────────┘
       │ (all critical answered)
       ▼
┌─────────────┐
│   Stage 5   │
│  Structure  │
│  Generation │
└─────────────┘
```

## Node Positioning

Suggested layout coordinates (relative to Stage 4):

```typescript
// In useGraphData.ts or graph construction logic:

const stage4Position = { x: 400, y: 400 }
const clarifyingPosition = { x: 400, y: 550 } // 150px below Stage 4
const stage5Position = { x: 400, y: 700 } // 150px below Clarifying
```

## Edge Configuration

### Stage 4 → Clarifying

```typescript
const stage4ToClarifying: AppEdge = {
  id: 'stage_4-clarifying',
  source: 'stage_4',
  target: 'clarifying',
  type: 'animated',
  animated: courseStatus === 'stage_4_clarifying',
  style: {
    stroke: '#a855f7', // Purple
    strokeWidth: 2,
  },
}
```

### Clarifying → Stage 5

```typescript
const clarifyingToStage5: AppEdge = {
  id: 'clarifying-stage_5',
  source: 'clarifying',
  target: 'stage_5',
  type: 'animated',
  animated: courseStatus === 'stage_5_active',
  style: {
    stroke: '#10b981', // Green when approved
    strokeWidth: 2,
  },
}
```

## Status Transitions

### FSM States

```typescript
// Course status flow
'stage_4_active'           // Stage 4 generating
  ↓
'stage_4_complete'          // Stage 4 done, analysis ready
  ↓
'stage_4_clarifying'        // Clarifying questions active (NEW)
  ↓
'stage_5_active'            // Stage 5 starts after approval
```

### Node Status Mapping

```typescript
function getClarifyingNodeStatus(
  courseStatus: string,
  questionsData: QuestionProgress
): 'pending' | 'active' | 'completed' {
  // Not yet reached
  if (!courseStatus.startsWith('stage_4')) {
    return 'pending'
  }

  // Active: Stage 4 complete, questions not all answered
  if (courseStatus === 'stage_4_clarifying') {
    return 'active'
  }

  // Completed: All critical questions answered
  if (questionsData.criticalAnswered === questionsData.criticalTotal) {
    return 'completed'
  }

  return 'active'
}
```

## Data Flow

### Question Data Fetch

```typescript
// On course load, fetch questions if status is stage_4_clarifying
useEffect(() => {
  if (courseStatus === 'stage_4_clarifying') {
    // Fetch questions via tRPC
    const questions = await trpc.clarifying.getQuestions.query({ courseId })

    // Update node data
    setClarifyingNodeData({
      status: 'active',
      questionsCount: questions.length,
      answeredCount: questions.filter((q) => q.isAnswered).length,
      criticalAnswered: questions.filter((q) => q.priority === 'critical' && q.isAnswered).length,
      criticalTotal: questions.filter((q) => q.priority === 'critical').length,
    })
  }
}, [courseStatus, courseId])
```

### Real-time Updates

```typescript
// Subscribe to answer events
useEffect(() => {
  const subscription = supabase
    .channel(`clarifying:${courseId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'clarifying_answers',
        filter: `question_id=in.(${questionIds.join(',')})`,
      },
      (payload) => {
        // Update node data on answer
        setAnsweredCount((prev) => prev + 1)
      }
    )
    .subscribe()

  return () => {
    subscription.unsubscribe()
  }
}, [courseId, questionIds])
```

## Integration Example

### Complete useGraphData Integration

```typescript
// In useGraphData.ts

export function useGraphData({ courseId, courseStatus, ... }) {
  // ... existing code ...

  // Fetch clarifying progress
  const clarifyingProgress = trpc.clarifying.getProgress.useQuery(
    { courseId },
    { enabled: courseStatus.startsWith('stage_4') }
  )

  // Build nodes
  const nodes: AppNode[] = [
    // ... existing stage nodes ...

    // Clarifying node
    {
      id: 'clarifying',
      type: 'clarifying',
      position: nodePositionsRef.current.get('clarifying') || { x: 400, y: 550 },
      data: {
        status: getClarifyingNodeStatus(courseStatus, clarifyingProgress.data || {}),
        questionsCount: clarifyingProgress.data?.total || 0,
        answeredCount: clarifyingProgress.data?.answered || 0,
        criticalAnswered: clarifyingProgress.data?.criticalAnswered || 0,
        criticalTotal: clarifyingProgress.data?.criticalTotal || 0,
      },
    },

    // ... rest of nodes ...
  ]

  // Build edges
  const edges: AppEdge[] = [
    // ... existing edges ...

    // Stage 4 → Clarifying
    {
      id: 'stage_4-clarifying',
      source: 'stage_4',
      target: 'clarifying',
      type: 'animated',
      animated: courseStatus === 'stage_4_clarifying',
    },

    // Clarifying → Stage 5
    {
      id: 'clarifying-stage_5',
      source: 'clarifying',
      target: 'stage_5',
      type: 'animated',
      animated: courseStatus === 'stage_5_active',
    },

    // ... rest of edges ...
  ]

  return { nodes, edges }
}
```

### NodeDetailsDrawer Integration

```typescript
// In NodeDetailsDrawer.tsx

import { ClarifyingPanel } from './clarifying'

export function NodeDetailsDrawer() {
  const { selectedNodeId, deselectNode } = useNodeSelection()
  const { getNode } = useReactFlow()
  const { courseInfo } = useStaticGraphContext()

  const node = selectedNodeId ? getNode(selectedNodeId) : null
  const isOpen = !!node

  const renderContent = () => {
    if (!node) return null

    switch (node.type) {
      case 'stage':
        return <StageDetails node={node} />

      case 'clarifying':
        return (
          <ClarifyingPanel
            courseId={courseInfo.id}
            onComplete={() => {
              // Close drawer after approval
              deselectNode()
              // Optionally show success toast
              toast.success('Генерация продолжается!')
            }}
          />
        )

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
          <SheetTitle>
            {node?.type === 'clarifying' ? 'Уточняющие вопросы' : node?.data?.label || 'Node Details'}
          </SheetTitle>
          <SheetDescription>
            {node?.type === 'clarifying' && 'Ответьте на вопросы для улучшения генерации курса'}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 overflow-y-auto max-h-[calc(100vh-120px)]">
          {renderContent()}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

## Conditional Rendering

Show clarifying node only when relevant:

```typescript
// Option 1: Always show (recommended for consistency)
const showClarifyingNode = true

// Option 2: Only show when stage 4 complete or later
const showClarifyingNode =
  courseStatus !== 'draft' &&
  !courseStatus.startsWith('stage_1') &&
  !courseStatus.startsWith('stage_2') &&
  !courseStatus.startsWith('stage_3')

// Option 3: Only show when questions exist
const showClarifyingNode = clarifyingProgress.data && clarifyingProgress.data.total > 0
```

## Auto-Open Behavior

Auto-select clarifying node when status changes:

```typescript
// In GraphView.tsx or similar

useEffect(() => {
  // Auto-open when entering clarifying stage
  if (courseStatus === 'stage_4_clarifying' && !hasBeenAutoOpened('clarifying')) {
    selectNode('clarifying')
    markAsAutoOpened('clarifying')
  }
}, [courseStatus, selectNode, hasBeenAutoOpened, markAsAutoOpened])
```

## MissionControlBanner Integration

Update banner to handle clarifying stage:

```typescript
// In MissionControlBanner.tsx

const getBannerContent = (courseStatus: string) => {
  switch (courseStatus) {
    case 'stage_4_clarifying':
      return {
        title: 'Ответьте на уточняющие вопросы',
        description: 'Несколько вопросов помогут улучшить структуру курса',
        action: 'Перейти к вопросам',
        onAction: () => selectNode('clarifying'),
      }
    // ... other cases
  }
}
```

## Layout Algorithm Considerations

ELK layout configuration for clarifying node:

```typescript
// In useGraphLayout.ts

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '150', // Space between clarifying and other nodes
  'elk.layered.spacing.nodeNodeBetweenLayers': '150',
  // ... other options
}
```

## Testing Integration

```typescript
// Test that clarifying node appears correctly
describe('ClarifyingNode Integration', () => {
  it('should render clarifying node when status is stage_4_clarifying', () => {
    const { getByTestId } = render(
      <GraphView
        courseId="test-course"
        courseStatus="stage_4_clarifying"
      />
    )
    expect(getByTestId('node-clarifying')).toBeInTheDocument()
  })

  it('should show active state with pulse animation', () => {
    const { getByTestId } = render(
      <GraphView
        courseId="test-course"
        courseStatus="stage_4_clarifying"
      />
    )
    const node = getByTestId('node-clarifying')
    expect(node).toHaveClass('animate-pulse')
  })

  it('should open panel on double-click', () => {
    const { getByTestId } = render(
      <GraphView courseId="test-course" />
    )
    const node = getByTestId('node-clarifying')
    fireEvent.doubleClick(node)
    expect(screen.getByText('Уточняющие вопросы')).toBeInTheDocument()
  })
})
```

---

**Ready for integration**: All patterns follow existing graph architecture.
