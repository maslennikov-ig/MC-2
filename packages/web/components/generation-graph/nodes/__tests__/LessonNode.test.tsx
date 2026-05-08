import React from 'react'
import type { ComponentProps } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LessonNode from '../LessonNode'

const generateLessonMock = vi.fn()
const toggleLessonMock = vi.fn()
const selectNodeMock = vi.fn()

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')
  return {
    ...actual,
    useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  }
})

vi.mock('../../hooks/useNodeStatus', () => ({
  useNodeStatus: () => undefined,
}))

vi.mock('../../hooks/useNodeSelection', () => ({
  useNodeSelection: () => ({ selectNode: selectNodeMock }),
}))

vi.mock('../../contexts/PartialGenerationContext', () => ({
  useOptionalPartialGenerationContext: () => ({
    generateLesson: generateLessonMock,
    isLessonGenerating: () => false,
    isSelectionMode: false,
    toggleLesson: toggleLessonMock,
    selectedLessons: new Set<string>(),
  }),
}))

function renderLessonNode() {
  const props = {
    id: 'lesson_8_5',
    selected: false,
    data: {
      lessonId: 'lesson_8_5',
      title: 'Интеграция и масштабирование',
      status: 'completed',
    },
  } as unknown as ComponentProps<typeof LessonNode>

  render(<LessonNode {...props} />)
}

describe('LessonNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateLessonMock.mockResolvedValue(undefined)
  })

  it('does not treat repeated regenerate button clicks as node double-clicks', () => {
    renderLessonNode()

    const regenerateButton = screen.getByTitle('Перегенерировать урок')
    fireEvent.click(regenerateButton)
    fireEvent.click(regenerateButton)

    expect(generateLessonMock).toHaveBeenCalledTimes(2)
    expect(generateLessonMock).toHaveBeenCalledWith('8.5')
    expect(selectNodeMock).not.toHaveBeenCalled()
  })
})
