'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  getPopularRoleTitleSuggestions,
  getRoleTitleSuggestionGroups,
  searchRoleTitleSuggestions,
  type RoleMatchKind,
} from './role-title-suggestions'

export interface RoleTitleSuggestionInputCopy {
  roleSuggestionsLabel?: string
  roleSuggestionsHint?: string
  roleSuggestionsPopularLabel?: string
  roleSuggestionsNoResultsLabel?: string
  roleSuggestionsManualTemplate?: string
  roleSuggestionsMatchPopular?: string
  roleSuggestionsMatchLabel?: string
  roleSuggestionsMatchAlias?: string
  roleSuggestionsMatchAcronym?: string
  roleSuggestionsMatchKeyword?: string
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
  roleSuggestionsPopularLabel: 'Популярные роли',
  roleSuggestionsNoResultsLabel: 'Нет точного совпадения',
  roleSuggestionsManualTemplate: 'Использовать "{value}"',
  roleSuggestionsMatchPopular: 'Популярная роль',
  roleSuggestionsMatchLabel: 'Название роли',
  roleSuggestionsMatchAlias: 'Синоним',
  roleSuggestionsMatchAcronym: 'Сокращение',
  roleSuggestionsMatchKeyword: 'Связанный запрос',
}

const minimumSearchLength = 2

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
  const trimmedValue = value.trim()
  const hasSearchQuery = trimmedValue.length >= minimumSearchLength
  const suggestions = useMemo(
    () =>
      trimmedValue
        ? searchRoleTitleSuggestions(trimmedValue, locale)
        : getPopularRoleTitleSuggestions(locale),
    [locale, trimmedValue]
  )
  const suggestionGroups = useMemo(() => getRoleTitleSuggestionGroups(suggestions), [suggestions])
  const showPanel = focused && (suggestions.length > 0 || hasSearchQuery)
  const showNoResults = focused && hasSearchQuery && suggestions.length === 0
  const activeSuggestion =
    showPanel && suggestions.length > 0 ? suggestions[activeIndex] : undefined
  const headline = trimmedValue ? labels.roleSuggestionsLabel : labels.roleSuggestionsPopularLabel

  useEffect(() => {
    setActiveIndex(0)
  }, [locale, suggestions.length, trimmedValue])

  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(Math.max(suggestions.length - 1, 0))
    }
  }, [activeIndex, suggestions.length])

  const selectSuggestion = (nextValue: string) => {
    onValueChange(nextValue)
    setFocused(false)
  }

  const closeManualFallback = () => {
    setFocused(false)
  }

  return (
    <div className="relative space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
          <Search className="h-4 w-4" aria-hidden />
        </span>
        <Input
          id={id}
          aria-label={label}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={showPanel ? listId : undefined}
          aria-activedescendant={activeSuggestion ? `${listId}-${activeSuggestion.id}` : undefined}
          aria-expanded={showPanel}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              if (!suggestions.length) return
              event.preventDefault()
              setFocused(true)
              setActiveIndex((index) => (index + 1) % suggestions.length)
            }

            if (event.key === 'ArrowUp') {
              if (!suggestions.length) return
              event.preventDefault()
              setFocused(true)
              setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
            }

            if (event.key === 'Enter' && showPanel && activeSuggestion) {
              event.preventDefault()
              selectSuggestion(activeSuggestion.label)
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              setFocused(false)
            }
          }}
          placeholder={placeholder}
          className="h-12 bg-[#fffdf8] pl-10 text-[16px] leading-6 dark:bg-slate-950"
        />
      </div>

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          aria-label={headline}
          className="relative z-20 overflow-hidden rounded-md border border-[#d8c5aa] bg-[#fffdf8] shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <p className="text-xs font-medium tracking-normal text-slate-500 uppercase dark:text-slate-400">
              {headline}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {labels.roleSuggestionsHint}
            </p>
          </div>
          <div className="max-h-[min(32rem,60vh)] overflow-y-auto p-1">
            {suggestionGroups.map((group) => (
              <div key={`${group.department}-${group.suggestions[0]?.id}`} className="py-1">
                <div
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-normal text-slate-500 uppercase dark:text-slate-400"
                >
                  {group.departmentLabel}
                </div>
                {group.suggestions.map((suggestion) => {
                  const index = suggestions.findIndex((candidate) => candidate.id === suggestion.id)
                  const selected = suggestion.label === value
                  const active = index === activeIndex
                  const matchLabel = getMatchLabel(suggestion.matchKind, labels)
                  const showAlternateLabel =
                    suggestion.alternateLabel !== suggestion.label &&
                    shouldShowAlternateLabel(locale, trimmedValue)

                  return (
                    <div
                      key={suggestion.id}
                      id={`${listId}-${suggestion.id}`}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectSuggestion(suggestion.label)}
                      className={cn(
                        'flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                        selected
                          ? 'bg-purple-50 text-purple-950 dark:bg-purple-950/40 dark:text-purple-50'
                          : 'text-slate-900 hover:bg-[#f6efe4] dark:text-slate-100 dark:hover:bg-slate-900',
                        active && !selected ? 'bg-[#f6efe4] dark:bg-slate-900' : null
                      )}
                    >
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0 text-purple-600 dark:text-purple-300',
                          selected ? 'opacity-100' : 'opacity-0'
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-5 font-medium break-words">
                          {suggestion.label}
                        </span>
                        {showAlternateLabel ? (
                          <span className="mt-0.5 block text-xs leading-5 break-words text-slate-500 dark:text-slate-400">
                            {suggestion.alternateLabel}
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                          <span>{matchLabel}</span>
                          {suggestion.matchLabel ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="break-words">{suggestion.matchLabel}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
            {showNoResults ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={closeManualFallback}
                className="m-1 flex w-[calc(100%-0.5rem)] flex-col items-start rounded-md border border-dashed border-[#d8c5aa] px-3 py-3 text-left text-sm text-slate-700 transition-colors hover:border-purple-200 hover:bg-[#f6efe4] dark:border-slate-800 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                <span className="font-medium">{labels.roleSuggestionsNoResultsLabel}</span>
                <span className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {labels.roleSuggestionsManualTemplate.replace('{value}', trimmedValue)}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function getMatchLabel(matchKind: RoleMatchKind, labels: Required<RoleTitleSuggestionInputCopy>) {
  const matchLabels: Record<RoleMatchKind, string> = {
    popular: labels.roleSuggestionsMatchPopular,
    label: labels.roleSuggestionsMatchLabel,
    alias: labels.roleSuggestionsMatchAlias,
    acronym: labels.roleSuggestionsMatchAcronym,
    keyword: labels.roleSuggestionsMatchKeyword,
  }

  return matchLabels[matchKind]
}

function shouldShowAlternateLabel(locale: string, query: string) {
  if (!query.trim()) return false

  const usesLatin = /\p{Script=Latin}/u.test(query)
  const usesCyrillic = /\p{Script=Cyrillic}/u.test(query)

  return locale === 'en' ? usesCyrillic : usesLatin
}
