'use client'

import { createContext, useContext, ReactNode } from 'react'
import type { ParsedLessonContent } from '@/lib/markdown-content-parser'

interface LessonEditContextType {
  isEditing: boolean
  isSaving: boolean
  onSaveEdit: (content: ParsedLessonContent) => Promise<void>
  onCancelEdit: () => void
}

const LessonEditContext = createContext<LessonEditContextType | null>(null)

interface LessonEditProviderProps {
  children: ReactNode
  isEditing: boolean
  isSaving: boolean
  onSaveEdit: (content: ParsedLessonContent) => Promise<void>
  onCancelEdit: () => void
}

export function LessonEditProvider({
  children,
  isEditing,
  isSaving,
  onSaveEdit,
  onCancelEdit,
}: LessonEditProviderProps) {
  return (
    <LessonEditContext.Provider value={{ isEditing, isSaving, onSaveEdit, onCancelEdit }}>
      {children}
    </LessonEditContext.Provider>
  )
}

export function useLessonEdit(): LessonEditContextType | null {
  return useContext(LessonEditContext)
}
