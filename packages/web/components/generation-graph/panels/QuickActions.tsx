import React from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Wand2, ShieldCheck, Scale, LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type ChatIntent = 'refine' | 'regenerate'

interface QuickAction {
  label: string
  icon: LucideIcon
  text: string
  intent: ChatIntent
}

interface QuickActionsProps {
  onSelect: (text: string, intent: ChatIntent) => void
  disabled?: boolean
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onSelect, disabled }) => {
  const t = useTranslations('generation')

  const actions: QuickAction[] = [
    {
      label: t('refinementChat.quickActions.shorter'),
      icon: Scale,
      text: 'Please make the content more concise and shorter.',
      intent: 'refine',
    },
    {
      label: t('refinementChat.quickActions.moreExamples'),
      icon: Wand2,
      text: 'Please add more practical examples to the content.',
      intent: 'refine',
    },
    {
      label: t('refinementChat.quickActions.moreDetail'),
      icon: ShieldCheck,
      text: 'Please provide more details and explanation.',
      intent: 'refine',
    },
    {
      label: t('refinementChat.quickActions.simplify'),
      icon: Sparkles,
      text: 'Please simplify the language and explanation.',
      intent: 'refine',
    },
  ]

  return (
    <div
      className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 flex gap-2 overflow-x-auto pb-1"
      data-testid="quick-actions"
    >
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          size="compact"
          className="flex-shrink-0 rounded-full border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm transition-all duration-200 hover:border-blue-300 hover:bg-gradient-to-r hover:from-blue-100 hover:to-indigo-100 hover:shadow-md dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20 dark:hover:border-blue-700 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30"
          onClick={() => onSelect(action.text, action.intent)}
          disabled={disabled}
          type="button"
        >
          <action.icon size={14} className="mr-1 text-blue-600 dark:text-blue-400" />
          <span className="font-medium">{action.label}</span>
        </Button>
      ))}
    </div>
  )
}
