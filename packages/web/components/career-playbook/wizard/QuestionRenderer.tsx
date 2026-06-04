'use client'

import { useEffect, useState } from 'react'
import { CircleDot, ListChecks, PenLine } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  CareerPlaybookFixedQuestion,
  CareerPlaybookFollowupQuestion,
  CareerPlaybookOption,
} from '@megacampus/shared-types'
import {
  RoleTitleSuggestionInput,
  type RoleTitleSuggestionInputCopy,
} from './RoleTitleSuggestionInput'

export type CareerPlaybookWizardQuestion =
  | CareerPlaybookFixedQuestion
  | CareerPlaybookFollowupQuestion

export type CareerPlaybookWizardValue = string | string[]

export interface QuestionRendererCopy extends RoleTitleSuggestionInputCopy {
  openPlaceholder?: string
  chooseOneLabel?: string
  chooseManyLabel?: string
  otherOptionLabel?: string
  otherOptionPlaceholder?: string
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
  otherOptionLabel: 'Другое',
  otherOptionPlaceholder: 'Введите свой вариант',
  roleSuggestionsLabel: 'Подходящие роли',
  roleSuggestionsHint: 'Можно выбрать подсказку или оставить свой вариант.',
  roleSuggestionsPopularLabel: 'Популярные роли',
  roleSuggestionsNoResultsLabel: 'Нет точного совпадения',
  roleSuggestionsManualTemplate: 'Использовать "{value}"',
  roleSuggestionsMatchPopular: 'Популярная роль',
  roleSuggestionsMatchLabel: 'Название роли',
  roleSuggestionsMatchAlias: 'Синоним',
  roleSuggestionsMatchAcronym: 'Сокращение',
  roleSuggestionsMatchKeyword: 'Связанный запрос',
}

const typeIcon = {
  open: PenLine,
  single_choice: CircleDot,
  multi_choice: ListChecks,
}

const customOptionValue = '__career_playbook_other__'

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
  const [localCustomSingleValue, setLocalCustomSingleValue] = useState('')
  const [localMultiValue, setLocalMultiValue] = useState<string[]>(
    Array.isArray(value) ? value : []
  )
  const [localCustomMultiValue, setLocalCustomMultiValue] = useState('')
  const [localMultiOtherSelected, setLocalMultiOtherSelected] = useState(false)
  const [activeCustomSingleQuestionKey, setActiveCustomSingleQuestionKey] = useState<string | null>(
    null
  )
  const [activeCustomMultiQuestionKey, setActiveCustomMultiQuestionKey] = useState<string | null>(
    null
  )
  const isRoleTitleQuestion =
    question.question_type === 'open' &&
    'question_key' in question &&
    question.question_key === 'position'
  const customChoiceEnabled = shouldOfferCustomChoice(question)
  const selectSingleValue = (nextValue: string) => {
    if (nextValue === customOptionValue) {
      setActiveCustomSingleQuestionKey(questionKey)
      setLocalSingleValue(customOptionValue)
      if (localSingleValue !== customOptionValue) {
        setLocalCustomSingleValue('')
        onValueChange('')
      }
      return
    }

    setActiveCustomSingleQuestionKey(null)
    setLocalSingleValue(nextValue)
    setLocalCustomSingleValue('')
    onValueChange(nextValue)
  }

  useEffect(() => {
    const knownChoiceValues = new Set(
      getKnownChoiceOptions(question.options ?? []).map((option) => option.value)
    )
    const nextStringValue = typeof value === 'string' ? value : ''
    const nextMultiValue = Array.isArray(value) ? value : []
    const singleCustomValue =
      nextStringValue && !knownChoiceValues.has(nextStringValue) ? nextStringValue : ''
    const multiCustomValue =
      nextMultiValue.find((selectedValue) => !knownChoiceValues.has(selectedValue)) ?? ''
    const preserveEmptySingleCustom =
      customChoiceEnabled &&
      question.question_type === 'single_choice' &&
      activeCustomSingleQuestionKey === questionKey &&
      !nextStringValue
    const preserveEmptyMultiCustom =
      customChoiceEnabled &&
      question.question_type === 'multi_choice' &&
      activeCustomMultiQuestionKey === questionKey &&
      !multiCustomValue

    setLocalTextValue(typeof value === 'string' ? value : '')
    setLocalSingleValue(
      singleCustomValue || preserveEmptySingleCustom ? customOptionValue : nextStringValue
    )
    setLocalCustomSingleValue(
      singleCustomValue || preserveEmptySingleCustom ? singleCustomValue : ''
    )
    setLocalMultiValue(nextMultiValue)
    setLocalCustomMultiValue(multiCustomValue || preserveEmptyMultiCustom ? multiCustomValue : '')
    setLocalMultiOtherSelected(Boolean(multiCustomValue) || preserveEmptyMultiCustom)

    if (singleCustomValue || preserveEmptySingleCustom) {
      setActiveCustomSingleQuestionKey(questionKey)
    } else if (activeCustomSingleQuestionKey === questionKey) {
      setActiveCustomSingleQuestionKey(null)
    }

    if (multiCustomValue || preserveEmptyMultiCustom) {
      setActiveCustomMultiQuestionKey(questionKey)
    } else if (activeCustomMultiQuestionKey === questionKey) {
      setActiveCustomMultiQuestionKey(null)
    }
  }, [
    activeCustomMultiQuestionKey,
    activeCustomSingleQuestionKey,
    customChoiceEnabled,
    question.options,
    question.question_type,
    questionKey,
    value,
  ])

  return (
    <fieldset className="min-h-[280px] space-y-5">
      <legend className="space-y-2">
        <span className="flex items-start gap-3 text-[22px] leading-8 font-semibold text-slate-950 dark:text-slate-50">
          <TypeIcon
            className="mt-1.5 h-5 w-5 shrink-0 text-purple-600 dark:text-purple-300"
            aria-hidden
          />
          {question.question_text}
        </span>
        {helperText ? (
          <span className="block max-w-3xl text-[15px] leading-6 text-slate-600 dark:text-slate-300">
            {helperText}
          </span>
        ) : null}
      </legend>

      {isRoleTitleQuestion ? (
        <RoleTitleSuggestionInput
          id={`career-playbook-${questionKey}`}
          label={question.question_text}
          value={localTextValue}
          onValueChange={(nextValue) => {
            setLocalTextValue(nextValue)
            onValueChange(nextValue)
          }}
          placeholder={labels.openPlaceholder}
          locale={'language' in question ? question.language : 'ru'}
          copy={labels}
        />
      ) : null}

      {question.question_type === 'open' && !isRoleTitleQuestion ? (
        <Textarea
          id={`career-playbook-${questionKey}`}
          aria-label={question.question_text}
          value={localTextValue}
          onChange={(event) => {
            setLocalTextValue(event.target.value)
            onValueChange(event.target.value)
          }}
          placeholder={labels.openPlaceholder}
          className="min-h-36 resize-y text-[16px] leading-6"
        />
      ) : null}

      {question.question_type === 'single_choice' ? (
        <div className="space-y-3" aria-label={labels.chooseOneLabel}>
          <RadioGroup
            value={localSingleValue}
            onValueChange={selectSingleValue}
          >
            {getChoiceOptionsWithCustom(options, labels.otherOptionLabel, customChoiceEnabled).map(
              (option) => {
                const selected = localSingleValue === option.value

                return (
                  <OptionRow
                    key={option.value}
                    option={option}
                    questionKey={questionKey}
                    selected={selected}
                    onSelect={() => selectSingleValue(option.value)}
                    afterLabel={
                      option.value === customOptionValue && selected ? (
                        <Input
                          aria-label={labels.otherOptionPlaceholder}
                          value={localCustomSingleValue}
                          onChange={(event) => {
                            setLocalCustomSingleValue(event.target.value)
                            onValueChange(event.target.value)
                          }}
                          placeholder={labels.otherOptionPlaceholder}
                          className="caret-auto mt-2 h-11 text-[15px] select-text"
                        />
                      ) : null
                    }
                  >
                    <RadioGroupItem
                      id={`${questionKey}-${option.value}`}
                      value={option.value}
                      className="mt-1"
                    />
                  </OptionRow>
                )
              }
            )}
          </RadioGroup>
        </div>
      ) : null}

      {question.question_type === 'multi_choice' ? (
        <div className="grid gap-3" aria-label={labels.chooseManyLabel}>
          {getChoiceOptionsWithCustom(options, labels.otherOptionLabel, customChoiceEnabled).map(
            (option) => {
              const knownSelectedValues = getKnownSelectedValues(localMultiValue, options)
              const selected =
                option.value === customOptionValue
                  ? localMultiOtherSelected
                  : knownSelectedValues.includes(option.value)
              const applyCheckedChange = (checked: boolean) => {
                if (option.value === customOptionValue) {
                  const nextOtherSelected = checked
                  const nextValues = nextOtherSelected
                    ? mergeKnownAndCustomValues(knownSelectedValues, localCustomMultiValue)
                    : knownSelectedValues
                  setActiveCustomMultiQuestionKey(nextOtherSelected ? questionKey : null)
                  setLocalMultiOtherSelected(nextOtherSelected)
                  setLocalMultiValue(nextValues)
                  onValueChange(nextValues)
                  return
                }

                const nextKnownValues = checked
                  ? [...knownSelectedValues, option.value]
                  : knownSelectedValues.filter((selectedValue) => selectedValue !== option.value)
                const nextValues = localMultiOtherSelected
                  ? mergeKnownAndCustomValues(nextKnownValues, localCustomMultiValue)
                  : nextKnownValues
                setLocalMultiValue(nextValues)
                onValueChange(nextValues)
              }

              return (
                <OptionRow
                  key={option.value}
                  option={option}
                  questionKey={questionKey}
                  selected={selected}
                  onSelect={() => applyCheckedChange(!selected)}
                  afterLabel={
                    option.value === customOptionValue && selected ? (
                      <Input
                        aria-label={labels.otherOptionPlaceholder}
                        value={localCustomMultiValue}
                        onChange={(event) => {
                          const nextCustomValue = event.target.value
                          const nextValues = mergeKnownAndCustomValues(
                            knownSelectedValues,
                            nextCustomValue
                          )
                          setLocalCustomMultiValue(nextCustomValue)
                          setLocalMultiValue(nextValues)
                          onValueChange(nextValues)
                        }}
                        placeholder={labels.otherOptionPlaceholder}
                        className="caret-auto mt-2 h-11 text-[15px] select-text"
                      />
                    ) : null
                  }
                >
                  <Checkbox
                    id={`${questionKey}-${option.value}`}
                    checked={selected}
                    onCheckedChange={(checked) => applyCheckedChange(Boolean(checked))}
                    className="mt-1"
                  />
                </OptionRow>
              )
            }
          )}
        </div>
      ) : null}
    </fieldset>
  )
}

function getKnownChoiceOptions(options: CareerPlaybookOption[]) {
  return options.filter((option) => option.value !== 'other')
}

function getChoiceOptionsWithCustom(
  options: CareerPlaybookOption[],
  otherOptionLabel: string,
  enabled = true
): CareerPlaybookOption[] {
  if (!enabled) {
    return getKnownChoiceOptions(options)
  }

  const normalizedOptions = options.map((option) =>
    option.value === 'other'
      ? { ...option, value: customOptionValue, label: option.label || otherOptionLabel }
      : option
  )

  if (normalizedOptions.some((option) => option.value === customOptionValue)) {
    return normalizedOptions
  }

  return [...normalizedOptions, { value: customOptionValue, label: otherOptionLabel }]
}

function shouldOfferCustomChoice(question: CareerPlaybookWizardQuestion) {
  if ('question_key' in question && question.question_key === 'content_language') {
    return false
  }

  return true
}

function getKnownSelectedValues(values: string[], options: CareerPlaybookOption[]) {
  const knownValues = new Set(getKnownChoiceOptions(options).map((option) => option.value))
  return values.filter((value) => knownValues.has(value))
}

function mergeKnownAndCustomValues(knownValues: string[], customValue: string) {
  if (!customValue.trim()) return knownValues

  return [...knownValues, customValue]
}

function OptionRow({
  children,
  afterLabel,
  option,
  questionKey,
  onSelect,
  selected,
}: {
  children: React.ReactNode
  afterLabel?: React.ReactNode
  option: CareerPlaybookOption
  questionKey: string
  onSelect?: () => void
  selected: boolean
}) {
  const inputId = `${questionKey}-${option.value}`

  return (
    <Label
      htmlFor={inputId}
      onClick={(event) => {
        if (!onSelect || isInteractiveOptionTarget(event.target)) return

        event.preventDefault()
        onSelect()
      }}
      className={cn(
        'grid min-h-[58px] cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-md border p-3 text-sm leading-none font-medium caret-transparent transition-colors select-none',
        selected
          ? 'border-purple-300 bg-purple-50/80 dark:border-purple-500/60 dark:bg-purple-950/30'
          : 'border-[#d8c5aa] bg-[#fffbf4] hover:border-purple-200 hover:bg-purple-50/40 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
      )}
    >
      {children}
      <div className="min-w-0">
        <span className="text-[15px] leading-6 font-medium text-slate-900 dark:text-slate-100">
          {option.label}
          {option.helper ? (
            <span className="block text-[13px] leading-5 font-normal text-slate-500 dark:text-slate-400">
              {option.helper}
            </span>
          ) : null}
        </span>
        {afterLabel}
      </div>
    </Label>
  )
}

function isInteractiveOptionTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('button,input,textarea,select,a'))
}
