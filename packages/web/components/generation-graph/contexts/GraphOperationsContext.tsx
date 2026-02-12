'use client'

import React, { createContext, useContext, ReactNode } from 'react'

interface GraphOperationsContextValue {
  /**
   * Remove a lesson node from the graph.
   * Called after successful lesson deletion to update UI immediately.
   * @param lessonId - Lesson ID in format "lesson_1_2" or "1.2"
   */
  removeLesson: (lessonId: string) => void
}

const GraphOperationsContext = createContext<GraphOperationsContextValue | null>(null)

/**
 * Hook to access graph operations like removeLesson.
 * Must be used within GraphOperationsProvider.
 */
export function useGraphOperations() {
  const context = useContext(GraphOperationsContext)
  if (!context) {
    throw new Error('useGraphOperations must be used within a GraphOperationsProvider')
  }
  return context
}

interface GraphOperationsProviderProps {
  removeLesson: (lessonId: string) => void
  children: ReactNode
}

export function GraphOperationsProvider({ removeLesson, children }: GraphOperationsProviderProps) {
  return (
    <GraphOperationsContext.Provider value={{ removeLesson }}>
      {children}
    </GraphOperationsContext.Provider>
  )
}
