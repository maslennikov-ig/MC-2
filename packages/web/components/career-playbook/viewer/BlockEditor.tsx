'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type {
  CareerPlaybookBlockId,
  CareerPlaybookViewerBlock,
} from '@/stores/use-career-playbook-store'

export interface BlockEditorCopy {
  title?: string
  description?: string
  blockMarkdown?: string
  saveChanges?: string
  regenerationInstruction?: string
  regenerationPlaceholder?: string
  regenerateBlock?: string
}

interface BlockEditorProps {
  open: boolean
  block?: CareerPlaybookViewerBlock
  isUpdating?: boolean
  copy?: BlockEditorCopy
  onOpenChange: (open: boolean) => void
  onSave: (blockId: CareerPlaybookBlockId, content: string) => Promise<void> | void
  onRegenerate: (blockId: CareerPlaybookBlockId, instruction: string) => Promise<void> | void
}

const defaultCopy: Required<BlockEditorCopy> = {
  title: 'Edit block',
  description: 'Edit the markdown directly, or ask the backend regenerator for a focused rewrite.',
  blockMarkdown: 'Block markdown',
  saveChanges: 'Save changes',
  regenerationInstruction: 'Regeneration instruction',
  regenerationPlaceholder: 'Make this block more specific to enterprise sales.',
  regenerateBlock: 'Regenerate block',
}

export function BlockEditor({
  open,
  block,
  isUpdating = false,
  copy,
  onOpenChange,
  onSave,
  onRegenerate,
}: BlockEditorProps) {
  const labels = { ...defaultCopy, ...copy }
  const [content, setContent] = useState(block?.state.content ?? '')
  const [instruction, setInstruction] = useState('')

  useEffect(() => {
    setContent(block?.state.content ?? '')
    setInstruction('')
  }, [block?.blockId, block?.state.content])

  const canSubmitContent = Boolean(block) && content.trim().length > 0 && !isUpdating
  const canRegenerate = Boolean(block) && instruction.trim().length > 0 && !isUpdating

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-5 bg-[#fffdf8] sm:max-w-3xl dark:bg-slate-950"
      >
        <SheetHeader>
          <SheetTitle>{block?.title ?? labels.title}</SheetTitle>
          <SheetDescription>{labels.description}</SheetDescription>
        </SheetHeader>

        <div className="grid flex-1 gap-5 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="career-playbook-block-markdown">{labels.blockMarkdown}</Label>
            <Textarea
              id="career-playbook-block-markdown"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-72 resize-y font-mono text-sm leading-6"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!canSubmitContent}
                onClick={() => {
                  if (block) void onSave(block.blockId, content.trim())
                }}
              >
                {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {labels.saveChanges}
              </Button>
            </div>
          </div>

          <div className="grid gap-2 border-t border-[#d8c5aa] pt-5 dark:border-slate-800">
            <Label htmlFor="career-playbook-regeneration-instruction">
              {labels.regenerationInstruction}
            </Label>
            <Textarea
              id="career-playbook-regeneration-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder={labels.regenerationPlaceholder}
              className="min-h-28"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!canRegenerate}
                onClick={() => {
                  if (block) void onRegenerate(block.blockId, instruction.trim())
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                {labels.regenerateBlock}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
