export const LESSON_INSPECTOR_PANEL_IDS = {
  left: 'lesson-inspector-pipeline',
  right: 'lesson-inspector-content',
} as const

export const LESSON_INSPECTOR_DEFAULT_LAYOUT = {
  [LESSON_INSPECTOR_PANEL_IDS.left]: 30,
  [LESSON_INSPECTOR_PANEL_IDS.right]: 70,
} as const

const MIN_USABLE_PIXELS = 1

export interface LessonInspectorLayoutMeasurements {
  containerWidth: number
  containerHeight: number
  leftPanelWidth: number
  leftPanelHeight: number
  rightPanelWidth: number
  rightPanelHeight: number
}

export interface LessonInspectorLayoutAssessment {
  isReady: boolean
  isValid: boolean
  reason: 'missing-elements' | 'container-not-ready' | 'panel-not-ready' | 'valid'
  measurements: LessonInspectorLayoutMeasurements
}

function readRect(element: HTMLDivElement | null) {
  if (!element) {
    return { width: 0, height: 0 }
  }

  const { width, height } = element.getBoundingClientRect()

  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  }
}

function hasUsableSize(width: number, height: number) {
  return width > MIN_USABLE_PIXELS && height > MIN_USABLE_PIXELS
}

export function assessLessonInspectorLayout({
  container,
  leftPanel,
  rightPanel,
}: {
  container: HTMLDivElement | null
  leftPanel: HTMLDivElement | null
  rightPanel: HTMLDivElement | null
}): LessonInspectorLayoutAssessment {
  if (!container || !leftPanel || !rightPanel) {
    return {
      isReady: false,
      isValid: false,
      reason: 'missing-elements',
      measurements: {
        containerWidth: 0,
        containerHeight: 0,
        leftPanelWidth: 0,
        leftPanelHeight: 0,
        rightPanelWidth: 0,
        rightPanelHeight: 0,
      },
    }
  }

  const containerRect = readRect(container)
  const leftPanelRect = readRect(leftPanel)
  const rightPanelRect = readRect(rightPanel)

  const measurements = {
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
    leftPanelWidth: leftPanelRect.width,
    leftPanelHeight: leftPanelRect.height,
    rightPanelWidth: rightPanelRect.width,
    rightPanelHeight: rightPanelRect.height,
  }

  if (!hasUsableSize(containerRect.width, containerRect.height)) {
    return {
      isReady: false,
      isValid: false,
      reason: 'container-not-ready',
      measurements,
    }
  }

  const panelsAreUsable =
    hasUsableSize(leftPanelRect.width, leftPanelRect.height) &&
    hasUsableSize(rightPanelRect.width, rightPanelRect.height)

  if (!panelsAreUsable) {
    return {
      isReady: true,
      isValid: false,
      reason: 'panel-not-ready',
      measurements,
    }
  }

  return {
    isReady: true,
    isValid: true,
    reason: 'valid',
    measurements,
  }
}
