'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, X, Wand2, ArrowsUpFromLine, BookOpen, Briefcase, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { regenerateBlockAction } from '@/app/actions/admin-generation';

interface InlineRegenerateChatProps {
  courseId: string;
  stageId: 'stage_4' | 'stage_5';
  blockPath: string; // e.g., "topic_analysis.key_concepts"
  currentValue: unknown;
  locale?: 'ru' | 'en';
  onSuccess?: (result: RegenerationResult) => void;
  onCancel?: () => void;
}

export interface RegenerationResult {
  regenerated_content: unknown;
  pedagogical_change_log: string;
  alignment_score: number;
  bloom_level_preserved: boolean;
  concepts_added: string[];
  concepts_removed: string[];
}

interface QuickAction {
  label: string;
  instruction: string;
  icon: React.ComponentType<{ className?: string }>;
}

const quickActions: Record<'ru' | 'en', QuickAction[]> = {
  ru: [
    { label: 'Упростить', instruction: 'Сделай проще, понятнее для начинающих', icon: Minimize2 },
    { label: 'Расширить', instruction: 'Добавь больше деталей и примеров', icon: ArrowsUpFromLine },
    { label: 'Сократить', instruction: 'Сократи без потери смысла', icon: Minimize2 },
    { label: 'Добавить примеры', instruction: 'Добавь практические примеры использования', icon: BookOpen },
    { label: 'Добавить профессионализм', instruction: 'Сделай более формальным и профессиональным', icon: Briefcase },
  ],
  en: [
    { label: 'Simplify', instruction: 'Make simpler, clearer for beginners', icon: Minimize2 },
    { label: 'Expand', instruction: 'Add more details and examples', icon: ArrowsUpFromLine },
    { label: 'Shorten', instruction: 'Shorten without losing meaning', icon: Minimize2 },
    { label: 'Add examples', instruction: 'Add practical usage examples', icon: BookOpen },
    { label: 'More professional', instruction: 'Make more formal and professional', icon: Briefcase },
  ],
};

const translations = {
  ru: {
    regenerateTitle: 'Перегенерировать с AI',
    instructionPlaceholder: 'Опишите, как изменить контент...',
    generating: 'Генерация...',
    cancel: 'Отмена',
    submit: 'Применить',
    quickActionsLabel: 'Быстрые действия:',
    minLength: 'Минимум 5 символов',
    success: 'Контент перегенерирован',
    error: 'Ошибка при генерации',
  },
  en: {
    regenerateTitle: 'Regenerate with AI',
    instructionPlaceholder: 'Describe how to change content...',
    generating: 'Generating...',
    cancel: 'Cancel',
    submit: 'Apply',
    quickActionsLabel: 'Quick actions:',
    minLength: 'Minimum 5 characters',
    success: 'Content regenerated',
    error: 'Failed to regenerate',
  }
};

/**
 * InlineRegenerateChat Component
 *
 * Allows users to regenerate a specific field using AI with smart context routing.
 * Displays inline below the field being regenerated.
 *
 * Initially shows a small "Regenerate with AI" button
 * When clicked, expands to show:
 * - Instruction textarea (3 lines, max 500 chars)
 * - Quick Action buttons: "Simplify", "Expand", "Change tone", "Shorten" (preset instructions)
 * - Submit button with Sparkles icon
 * - Cancel button
 *
 * On success, doesn't close the form yet - passes result to parent via onSuccess callback
 * Parent will show SemanticDiff component for review
 */
export const InlineRegenerateChat = ({
  courseId,
  stageId,
  blockPath,
  currentValue: _currentValue,
  locale = 'ru',
  onSuccess,
  onCancel,
}: InlineRegenerateChatProps) => {
  const t = translations[locale];
  const actions = quickActions[locale];
  const [isExpanded, setIsExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleOpen = () => {
    setIsExpanded(true);
    setInstruction('');
  };

  const handleClose = () => {
    setIsExpanded(false);
    setInstruction('');
    onCancel?.();
  };

  const handleQuickAction = (actionInstruction: string) => {
    setInstruction(actionInstruction);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (instruction.trim().length < 5) {
      toast.error(t.minLength);
      return;
    }

    setIsGenerating(true);

    try {
      const result = await regenerateBlockAction(
        courseId,
        stageId,
        blockPath,
        instruction.trim()
      );

      if (result.success) {
        toast.success(t.success);

        // Call onSuccess with the regeneration result
        // Parent will show SemanticDiff component for review
        if (onSuccess && result.data) {
          onSuccess(result.data as RegenerationResult);
        }

        // Don't close the form yet - let parent handle after review
      }
    } catch (error) {
      console.error('Failed to regenerate block:', error);
      toast.error(error instanceof Error ? error.message : t.error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Collapsed state: just a button
  if (!isExpanded) {
    return (
      <div className="px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpen}
          className="w-full border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          data-testid="regenerate-button"
        >
          <Wand2 className="w-4 h-4 mr-2" />
          {t.regenerateTitle}
        </Button>
      </div>
    );
  }

  // Expanded state: form with textarea, quick actions, and buttons
  return (
    <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Text Input Area */}
        <div className="relative">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t.instructionPlaceholder}
            className="min-h-[80px] resize-none pr-8"
            disabled={isGenerating}
            maxLength={500}
            rows={3}
            autoFocus
            data-testid="regenerate-input"
            aria-label={locale === 'ru' ? 'Инструкция по перегенерации' : 'Regeneration instruction'}
            aria-describedby="regenerate-help"
            aria-busy={isGenerating}
          />

          {/* Character counter */}
          <div className="absolute bottom-2 right-2 text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
            {instruction.length}/500
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <div id="regenerate-help" className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            {t.quickActionsLabel}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Button
                  key={index}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAction(action.instruction)}
                  disabled={isGenerating}
                  className="text-xs"
                  data-testid={`quick-action-${index}`}
                >
                  <Icon className="w-3 h-3 mr-1" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={instruction.trim().length < 5 || isGenerating}
            className={cn(
              "flex items-center gap-2",
              isGenerating && "cursor-not-allowed"
            )}
            data-testid="regenerate-submit"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.generating}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{t.submit}</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isGenerating}
            data-testid="regenerate-cancel"
          >
            <X className="w-4 h-4 mr-1" />
            {t.cancel}
          </Button>
        </div>
      </form>
    </div>
  );
};
