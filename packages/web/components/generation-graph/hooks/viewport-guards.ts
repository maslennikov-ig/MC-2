export const WORKFLOW_INITIAL_FIT_OPTIONS = {
  padding: 0.2,
  minZoom: 0.2,
  maxZoom: 0.9,
  duration: 400,
} as const

export function shouldPreserveWorkflowViewport({
  traceCount,
  isInteracting,
  isInitialFitReady,
}: {
  traceCount: number
  isInteracting: boolean
  isInitialFitReady: boolean
}): boolean {
  return traceCount > 0 && !isInteracting && isInitialFitReady
}
