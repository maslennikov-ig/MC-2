'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface FreeFormInputCopy {
  trigger?: string
  title?: string
  label?: string
  placeholder?: string
  submit?: string
}

interface FreeFormInputProps {
  onSubmit: (text: string) => void
  copy?: FreeFormInputCopy
  className?: string
}

const defaultCopy: Required<FreeFormInputCopy> = {
  trigger: 'Я расскажу свободно',
  title: 'Расскажите свободно',
  label: 'Свободный ответ',
  placeholder:
    'Добавьте контекст, который не попал в вопросы: ограничения, ожидания, риски, особенности команды.',
  submit: 'Сохранить текст',
}

export function FreeFormInput({ onSubmit, copy, className }: FreeFormInputProps) {
  const labels = { ...defaultCopy, ...copy }
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const trimmedText = text.trim()

  return (
    <div className={cn('sticky bottom-4 z-10 flex justify-end', className)}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="shadow-sm">
            <FileText className="mr-2 h-4 w-4" aria-hidden />
            {labels.trigger}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label={labels.label}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={labels.placeholder}
            className="min-h-64 resize-y text-base"
          />
          <DialogFooter>
            <Button
              type="button"
              disabled={!trimmedText}
              onClick={() => {
                if (!trimmedText) return

                onSubmit(trimmedText)
                setText('')
                setOpen(false)
              }}
            >
              {labels.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
