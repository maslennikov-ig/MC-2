export function getAwaitingStagePreviewNodeId(awaitingStage: number | null): string | null {
  if (!awaitingStage || awaitingStage < 1) return null
  return `stage_${awaitingStage}`
}
