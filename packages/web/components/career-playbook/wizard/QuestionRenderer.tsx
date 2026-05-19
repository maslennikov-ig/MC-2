'use client'

import { useEffect, useState } from 'react'
import { Circle, ListChecks, MessageSquareText } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  CareerPlaybookFixedQuestion,
  CareerPlaybookFollowupQuestion,
  CareerPlaybookOption,
} from '@megacampus/shared-types'

export type CareerPlaybookWizardQuestion =
  | CareerPlaybookFixedQuestion
  | CareerPlaybookFollowupQuestion

export type CareerPlaybookWizardValue = string | string[]

export interface QuestionRendererCopy {
  openPlaceholder?: string
  chooseOneLabel?: string
  chooseManyLabel?: string
}

interface QuestionRendererProps {
  question: CareerPlaybookWizardQuestion
  value: CareerPlaybookWizardValue | undefined
  onValueChange: (value: CareerPlaybookWizardValue) => void
  copy?: QuestionRendererCopy
}

const defaultCopy: Required<QuestionRendererCopy> = {
  openPlaceholder: 'Введите ответ',
  chooseOneLabel: 'Выберите один вариант',
  chooseManyLabel: 'Можно выбрать несколько',
}

const typeIcon = {
  open: MessageSquareText,
  single_choice: Circle,
  multi_choice: ListChecks,
}

export function getQuestionKey(question: CareerPlaybookWizardQuestion) {
  return 'question_key' in question ? question.question_key : question.question_id
}

export function QuestionRenderer({ question, value, onValueChange, copy }: QuestionRendererProps) {
  const labels = { ...defaultCopy, ...copy }
  const questionKey = getQuestionKey(question)
  const TypeIcon = typeIcon[question.question_type]
  const helperText = 'question_key' in question ? question.helper_text : question.rationale
  const options = question.options ?? []
  const [localTextValue, setLocalTextValue] = useState(typeof value === 'string' ? value : '')
  const [localSingleValue, setLocalSingleValue] = useState(typeof value === 'string' ? value : '')
  const [localMultiValue, setLocalMultiValue] = useState<string[]>(Array.isArray(value) ? value : [])

  useEffect(() => {
    setLocalTextValue(typeof value === 'string' ? value : '')
    setLocalSingleValue(typeof value === 'string' ? value : '')
    setLocalMultiValue(Array.isArray(value) ? value : [])
  }, [questionKey, value])

  return (
    <fieldset className="min-h-[320px] space-y-5">
      <legend className="space-y-2">
        <span className="flex items-start gap-3 text-xl font-semibold leading-7 text-slate-950 dark:text-slate-50">
          <TypeIcon className="mt-1 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden />
          {question.question_text}
        </span>
        {helperText ? (
          <span className="block max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {helperText}
          </span>
        ) : null}
      </legend>

      {question.question_type === 'open' ? (
        <Textarea
          id={`career-playbook-${questionKey}`}
          aria-label={question.question_text}
          value={localTextValue}
          onChange={(event) => {
            setLocalTextValue(event.target.value)
            onValueChange(event.target.value)
          }}
          placeholder={labels.openPlaceholder}
          className="min-h-36 resize-y text-base"
        />
      ) : null}

      {question.question_type === 'single_choice' ? (
        <div className="space-y-3" aria-label={labels.chooseOneLabel}>
          <RadioGroup
            value={localSingleValue}
            onValueChange={(nextValue) => {
              setLocalSingleValue(nextValue)
              onValueChange(nextValue)
            }}
          >
            {options.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                questionKey={questionKey}
                selected={localSingleValue === option.value}
              >
                <RadioGroupItem
                  id={`${questionKey}-${option.value}`}
                  value={option.value}
                  className="mt-1"
                />
              </OptionRow>
            ))}
          </RadioGroup>
        </div>
      ) : null}

      {question.question_type === 'multi_choice' ? (
        <div className="grid gap-3" aria-label={labels.chooseManyLabel}>
          {options.map((option) => {
            const selectedValues = localMultiValue
            const selected = selectedValues.includes(option.value)

            return (
              <OptionRow key={option.value} option={option} questionKey={questionKey} selected={selected}>
                <Checkbox
                  id={`${questionKey}-${option.value}`}
                  checked={selected}
                  onCheckedChange={(checked) => {
                    const nextValues = checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((selectedValue) => selectedValue !== option.value)
                    setLocalMultiValue(nextValues)
                    onValueChange(nextValues)
                  }}
                  className="mt-1"
                />
              </OptionRow>
            )
          })}
        </div>
      ) : null}
    </fieldset>
  )
}

function OptionRow({
  children,
  option,
  questionKey,
  selected,
}: {
  children: React.ReactNode
  option: CareerPlaybookOption
  questionKey: string
  selected: boolean
}) {
  return (
    <div
      className={cn(
        'grid min-h-[56px] grid-cols-[auto_1fr] gap-3 rounded-md border p-3 transition-colors',
        selected
          ? 'border-teal-600 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
      )}
    >
      {children}
      <Label
        htmlFor={`${questionKey}-${option.value}`}
        className="cursor-pointer text-sm font-medium leading-6 text-slate-900 dark:text-slate-100"
      >
        {option.label}
        {option.helper ? (
          <span className="block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">
            {option.helper}
          </span>
        ) : null}
      </Label>
    </div>
  )
}
