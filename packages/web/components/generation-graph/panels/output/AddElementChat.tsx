'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { addElementAction } from '@/app/actions/admin-generation';
import type { Lesson, Section } from '@megacampus/shared-types';

interface AddElementChatProps {
  courseId: string;
  elementType: 'lesson' | 'section';
  parentPath: string; // e.g., "sections[0].lessons" or "sections"
  position: 'start' | 'end' | number;
  locale?: 'ru' | 'en';
  onSuccess?: (newElement: Lesson | Section) => void; // For optimistic updates
  onCancel?: () => void;
}

const translations = {
  ru: {
    addLesson: '+ Урок',
    addSection: '+ Модуль',
    lessonPlaceholder: 'Опишите урок, который хотите добавить...',
    sectionPlaceholder: 'Опишите модуль, которую хотите добавить...',
    submit: 'Добавить',
    cancel: 'Отмена',
    successLesson: 'Урок добавлен',
    successSection: 'Модуль добавлен',
    error: 'Ошибка добавления',
    minLength: 'Минимум 10 символов',
    generating: 'Создаю...',
    generate: 'Создать',
  },
  en: {
    addLesson: '+ Lesson',
    addSection: '+ Module',
    lessonPlaceholder: 'Describe the lesson you want to add...',
    sectionPlaceholder: 'Describe the module you want to add...',
    submit: 'Add',
    cancel: 'Cancel',
    successLesson: 'Lesson added',
    successSection: 'Module added',
    error: 'Error adding',
    minLength: 'Minimum 10 characters',
    generating: 'Creating...',
    generate: 'Create',
  },
};
/**
 * AddElementChat Component
 *
 * Compact inline form that enables users to add new lessons or sections
 * to the course structure using AI generation.
 *
 * Initially shows just a button (e.g., "+ Урок" or "+ Секция")
 * When clicked, expands to show:
 * - Text input area (3 lines, max 1000 chars)
 * - Submit button with Sparkles icon (AI generation indicator)
 * - Cancel button
 *
 * Loading state: Show Loader2 spinner, disable inputs
 * Success: Show toast, close and call onSuccess
 * Error: Show error toast, keep form open
 */
export const AddElementChat = ({
  courseId,
  elementType,
  parentPath,
  position,
  locale = 'ru',
  onSuccess,
  onCancel,
}: AddElementChatProps) => {
  const t = translations[locale];
  const [isExpanded, setIsExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const buttonLabel = elementType === 'lesson' ? t.addLesson : t.addSection;
  const placeholder = elementType === 'lesson' ? t.lessonPlaceholder : t.sectionPlaceholder;
  const successMessage = elementType === 'lesson' ? t.successLesson : t.successSection;

  const handleOpen = () => {
    setIsExpanded(true);
    setInstruction('');
  };

  const handleClose = () => {
    setIsExpanded(false);
    setInstruction('');
    onCancel?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (instruction.trim().length < 10) {
      toast.error(t.minLength);
      return;
    }

    setIsGenerating(true);

    try {
      const result = await addElementAction(
        courseId,
        elementType,
        parentPath,
        position,
        instruction.trim()
      );

      if (result.success) {
        toast.success(successMessage);

        // Call onSuccess with the generated element
        if (onSuccess && result.generatedElement) {
          onSuccess(result.generatedElement as Lesson | Section);
        }

        // Close the form
        handleClose();
      }
    } catch (error) {
      console.error('Failed to add element:', error);
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
          data-testid={`add-${elementType}-button`}
        >
          {buttonLabel}
        </Button>
      </div>
    );
  }

  // Expanded state: form with textarea and buttons
  return (
    <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Text Input Area */}
        <div className="relative">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={placeholder}
            className="min-h-[80px] resize-none pr-8"
            disabled={isGenerating}
            maxLength={1000}
            rows={3}
            autoFocus
            data-testid={`add-${elementType}-input`}
          />

          {/* Character counter */}
          <div className="absolute bottom-2 right-2 text-xs text-slate-400 dark:text-slate-500">
            {instruction.length}/1000
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={instruction.trim().length < 10 || isGenerating}
            className={cn(
              "flex items-center gap-2",
              isGenerating && "cursor-not-allowed"
            )}
            data-testid={`add-${elementType}-submit`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.generating}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{t.generate}</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isGenerating}
            data-testid={`add-${elementType}-cancel`}
          >
            <X className="w-4 h-4 mr-1" />
            {t.cancel}
          </Button>
        </div>
      </form>
    </div>
  );
};
