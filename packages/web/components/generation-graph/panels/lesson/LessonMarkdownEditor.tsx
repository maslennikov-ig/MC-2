'use client'

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Save, X, Loader2 } from 'lucide-react'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import type { ParsedLessonContent } from '@/lib/markdown-content-parser'
import { parseMarkdownToContent } from '@/lib/markdown-content-parser'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

const AUTOSAVE_INTERVAL_MS = 30_000
const DRAFT_KEY_PREFIX = 'lesson-editor-draft-'

interface LessonMarkdownEditorProps {
  initialContent: string
  onSave: (content: ParsedLessonContent) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
  /** Unique key for localStorage draft (e.g. lessonId). If omitted, autosave is disabled. */
  draftKey?: string
}

export function LessonMarkdownEditor({
  initialContent,
  onSave,
  onCancel,
  isSaving = false,
  draftKey,
}: LessonMarkdownEditorProps) {
  // Restore draft from localStorage on mount
  const storageKey = draftKey ? `${DRAFT_KEY_PREFIX}${draftKey}` : null

  const [editedMarkdown, setEditedMarkdown] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      const draft = localStorage.getItem(storageKey)
      if (draft && draft !== initialContent) {
        return draft
      }
    }
    return initialContent
  })

  const { resolvedTheme, mounted } = useThemeSync()

  // Dark mode: use system preference as fallback before mount to avoid flash
  const colorMode = useMemo(() => {
    if (mounted) return resolvedTheme === 'dark' ? 'dark' : 'light'
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
  }, [mounted, resolvedTheme])

  const hasChanges = editedMarkdown !== initialContent
  const editedRef = useRef(editedMarkdown)
  editedRef.current = editedMarkdown

  // Autosave draft to localStorage every 30s
  useEffect(() => {
    if (!storageKey) return

    const interval = setInterval(() => {
      if (editedRef.current !== initialContent) {
        localStorage.setItem(storageKey, editedRef.current)
      }
    }, AUTOSAVE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [storageKey, initialContent])

  // Clear draft on unmount if no changes (saved or cancelled)
  const clearDraft = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey)
    }
  }, [storageKey])

  const handleSave = useCallback(async () => {
    const parsed = parseMarkdownToContent(editedMarkdown)
    await onSave(parsed)
    clearDraft()
  }, [editedMarkdown, onSave, clearDraft])

  const handleCancel = useCallback(() => {
    if (hasChanges) {
      const confirmed = window.confirm('Есть несохранённые изменения. Отменить редактирование?')
      if (!confirmed) return
    }
    clearDraft()
    onCancel()
  }, [hasChanges, onCancel, clearDraft])

  // Ctrl+S / Cmd+S keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges && !isSaving) {
          void handleSave()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasChanges, isSaving, handleSave])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <span className="text-muted-foreground text-sm">
          {hasChanges ? 'Есть несохранённые изменения' : 'Режим редактирования'}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
            <X className="mr-1 h-4 w-4" />
            Отмена
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden" data-color-mode={colorMode}>
        <MDEditor
          value={editedMarkdown}
          onChange={(val) => setEditedMarkdown(val || '')}
          height="100%"
          preview="live"
          visibleDragbar={false}
        />
      </div>
    </div>
  )
}
