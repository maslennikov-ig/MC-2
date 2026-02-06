'use client'

import React, { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Save, X, Loader2 } from 'lucide-react'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import type { ParsedLessonContent } from '@/lib/markdown-content-parser'
import { parseMarkdownToContent } from '@/lib/markdown-content-parser'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

interface LessonMarkdownEditorProps {
  initialContent: string
  onSave: (content: ParsedLessonContent) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
}

export function LessonMarkdownEditor({
  initialContent,
  onSave,
  onCancel,
  isSaving = false,
}: LessonMarkdownEditorProps) {
  const [editedMarkdown, setEditedMarkdown] = useState(initialContent)
  const { resolvedTheme, mounted } = useThemeSync()
  const colorMode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light'

  const hasChanges = editedMarkdown !== initialContent

  const handleSave = useCallback(async () => {
    const parsed = parseMarkdownToContent(editedMarkdown)
    await onSave(parsed)
  }, [editedMarkdown, onSave])

  const handleCancel = useCallback(() => {
    if (hasChanges) {
      const confirmed = window.confirm('Есть несохранённые изменения. Отменить редактирование?')
      if (!confirmed) return
    }
    onCancel()
  }, [hasChanges, onCancel])

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
