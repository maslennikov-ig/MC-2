'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { searchRoleTitleSuggestions } from './role-title-suggestions'

export interface RoleTitleSuggestionInputCopy {
  roleSuggestionsLabel?: string
  roleSuggestionsHint?: string
}

interface RoleTitleSuggestionInputProps {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  locale: string
  copy?: RoleTitleSuggestionInputCopy
}

const defaultCopy: Required<RoleTitleSuggestionInputCopy> = {
  roleSuggestionsLabel: 'Подходящие роли',
  roleSuggestionsHint: 'Можно выбрать подсказку или оставить свой вариант.',
}

export function RoleTitleSuggestionInput({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  locale,
  copy,
}: RoleTitleSuggestionInputProps) {
  const labels = { ...defaultCopy, ...copy }
  const listId = useId()
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const suggestions = useMemo(() => searchRoleTitleSuggestions(value, locale), [locale, value])
  const showSuggestions = focused && suggestions.length > 0
  const activeSuggestion = showSuggestions ? suggestions[activeIndex] : undefined

  useEffect(() => {
    setActiveIndex(0)
  }, [suggestions])

  const selectSuggestion = (nextValue: string) => {
    onValueChange(nextValue)
    setFocused(false)
  }

  return (
    <div className="relative space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400"
          aria-hidden
        />
        <Input
          id={id}
          aria-label={label}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={activeSuggestion ? `${listId}-${activeSuggestion.id}` : undefined}
          aria-expanded={showSuggestions}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (!suggestions.length) return

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setFocused(true)
              setActiveIndex((index) => (index + 1) % suggestions.length)
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setFocused(true)
              setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
            }

            if (event.key === 'Enter' && showSuggestions) {
              event.preventDefault()
              selectSuggestion(suggestions[activeIndex]?.label ?? suggestions[0].label)
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              setFocused(false)
            }
          }}
          placeholder={placeholder}
          className="h-12 pl-9 text-base"
        />
      </div>

      {showSuggestions ? (
        <div
          id={listId}
          role="listbox"
          aria-label={labels.roleSuggestionsLabel}
          className="absolute right-0 left-0 z-20 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <p className="text-xs font-medium tracking-normal text-slate-500 uppercase dark:text-slate-400">
              {labels.roleSuggestionsLabel}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {labels.roleSuggestionsHint}
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {suggestions.map((suggestion, index) => {
              const selected = suggestion.label === value
              const active = index === activeIndex

              return (
                <button
                  key={suggestion.id}
                  id={`${listId}-${suggestion.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSuggestion(suggestion.label)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'bg-teal-50 text-teal-950 dark:bg-teal-950/40 dark:text-teal-50'
                      : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-900',
                    active && !selected ? 'bg-slate-100 dark:bg-slate-900' : null
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300',
                      selected ? 'opacity-100' : 'opacity-0'
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{suggestion.label}</span>
                    {suggestion.alternateLabel !== suggestion.label ? (
                      <span className="block truncate text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {suggestion.alternateLabel}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
