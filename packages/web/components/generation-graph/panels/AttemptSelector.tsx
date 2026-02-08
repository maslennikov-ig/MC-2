import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TraceAttempt } from '@megacampus/shared-types'

interface AttemptSelectorProps {
  attempts: TraceAttempt[]
  selectedAttempt: number
  onSelectAttempt: (attempt: number) => void
}

export const AttemptSelector = ({
  attempts,
  selectedAttempt,
  onSelectAttempt,
}: AttemptSelectorProps) => {
  if (!attempts || attempts.length <= 1) return null

  return (
    <div className="mb-4 flex items-center gap-2 px-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Attempt:</span>
      <Select
        value={String(selectedAttempt)}
        onValueChange={(val) => onSelectAttempt(parseInt(val, 10))}
      >
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="Select attempt" />
        </SelectTrigger>
        <SelectContent>
          {attempts.map((attempt, idx) => (
            <SelectItem
              key={`attempt-${idx}-${attempt.attemptNumber}`}
              value={String(attempt.attemptNumber)}
              className="text-xs"
            >
              Attempt {attempt.attemptNumber} - {new Date(attempt.timestamp).toLocaleTimeString()} (
              {attempt.status})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
