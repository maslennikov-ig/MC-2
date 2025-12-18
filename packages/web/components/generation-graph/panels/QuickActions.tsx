import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Wand2, ShieldCheck, Scale } from 'lucide-react';
import { useTranslation } from '@/lib/generation-graph/useTranslation';

interface QuickActionsProps {
  onSelect: (action: string) => void;
  disabled?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onSelect, disabled }) => {
  const { t } = useTranslation();

  const actions = [
    { label: t('refinementChat.quickActions.shorter'), icon: Scale, text: "Please make the content more concise and shorter." },
    { label: t('refinementChat.quickActions.moreExamples'), icon: Wand2, text: "Please add more practical examples to the content." },
    { label: t('refinementChat.quickActions.moreDetail'), icon: ShieldCheck, text: "Please provide more details and explanation." },
    { label: t('refinementChat.quickActions.simplify'), icon: Sparkles, text: "Please simplify the language and explanation." },
  ];

  return (
    <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700" data-testid="quick-actions">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          size="sm"
          className="rounded-full text-xs h-8 px-3 flex-shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800 hover:bg-gradient-to-r hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
          onClick={() => onSelect(action.text)}
          disabled={disabled}
          type="button"
        >
          <action.icon className="w-3.5 h-3.5 mr-1.5 text-blue-600 dark:text-blue-400" />
          <span className="font-medium">{action.label}</span>
        </Button>
      ))}
    </div>
  );
};
