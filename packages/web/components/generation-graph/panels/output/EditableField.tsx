'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FieldConfig } from './types';
import { SaveStatus } from '../../hooks/useAutoSave';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { InlineRegenerateChat, type RegenerationResult } from './InlineRegenerateChat';
import { SemanticDiffViewer } from './SemanticDiff';
import { ImpactAnalysisModal, type CascadeAction } from './ImpactAnalysisModal';
import { getBlockDependenciesAction, updateFieldAction, cascadeUpdateAction } from '@/app/actions/admin-generation';
import { Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditHistoryStore } from '@/stores/useEditHistoryStore';

interface EditableFieldProps {
  config: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur?: () => void;
  status?: SaveStatus;
  disabled?: boolean;
  className?: string;
  regeneratable?: boolean; // Flag to enable AI regeneration
  courseId?: string; // Required if regeneratable or isLearningObjective
  stageId?: 'stage_4' | 'stage_5'; // Required if regeneratable
  locale?: 'ru' | 'en';
  isLearningObjective?: boolean; // Flag for LO fields that need cascade check
  onCascadeChange?: (value: unknown, action: CascadeAction) => Promise<void>;
}

/**
 * Helper function to determine change type based on concept changes
 */
function determineChangeType(result: RegenerationResult): 'simplified' | 'expanded' | 'restructured' | 'refined' {
  const added = result.concepts_added.length;
  const removed = result.concepts_removed.length;

  if (added > 0 && removed > 0) return 'restructured';
  if (added > 2) return 'expanded';
  if (removed > 2) return 'simplified';
  return 'refined';
}

export const EditableField: React.FC<EditableFieldProps> = ({
  config,
  value,
  onChange,
  onBlur,
  status = 'idle',
  disabled = false,
  className,
  regeneratable = false,
  courseId,
  stageId,
  locale = 'ru',
  isLearningObjective = false,
  onCascadeChange,
}) => {
  const { label, type, placeholder, helpText, min, max, options } = config;
  const [localValue, setLocalValue] = useState<string>(
    value !== null && value !== undefined ? String(value) : ''
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Edit history store
  const pushEdit = useEditHistoryStore((state) => state.pushEdit);

  // Track previous value for edit history
  const previousValueRef = useRef<unknown>(value);

  // Regeneration state
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
  const [regenerationResult, setRegenerationResult] = useState<RegenerationResult | null>(null);

  // Impact Analysis Modal state
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [pendingValue, setPendingValue] = useState<unknown>(null);
  const [affectedCount, setAffectedCount] = useState(0);

  // Sync local value when external value changes
  useEffect(() => {
    const newValue = value !== null && value !== undefined ? String(value) : '';
    setLocalValue(newValue);
    // Update previous value ref when external value changes
    previousValueRef.current = value;
  }, [value]);

  // Auto-resize textarea
  useEffect(() => {
    if (type === 'textarea' && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [localValue, type]);

  const handleChange = async (newValue: unknown) => {
    // Track edit in history (only if courseId and stageId are available)
    if (courseId && stageId && config.path) {
      pushEdit({
        courseId,
        stageId,
        fieldPath: config.path,
        previousValue: previousValueRef.current,
        newValue,
      });

      // Update previous value ref for next edit
      previousValueRef.current = newValue;
    }

    if (isLearningObjective && courseId && config.path) {
      // Store pending value and fetch affected count
      setPendingValue(newValue);

      try {
        const result = await getBlockDependenciesAction(courseId, config.path);
        setAffectedCount(result.downstream?.length || 0);
        setShowImpactModal(true);
      } catch (error) {
        console.error('Failed to get dependencies:', error);
        // Fallback: apply change without cascade check
        onChange(newValue);
      }
    } else {
      onChange(newValue);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    handleChange(newValue);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    const numValue = parseFloat(newValue);
    if (!isNaN(numValue)) {
      handleChange(numValue);
    }
  };

  const handleToggleChange = (checked: boolean) => {
    handleChange(checked);
  };

  const handleSelectChange = (newValue: string) => {
    setLocalValue(newValue);
    handleChange(newValue);
  };

  const handleBlur = () => {
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        if (!e.shiftKey && type === 'text') {
          e.preventDefault();
          // Focus the input for editing
          inputRef.current?.focus();
        }
        // For textarea, allow Enter to create new lines (don't preventDefault)
        break;
      case 'Escape':
        e.preventDefault();
        // Cancel editing and return focus to container
        if (inputRef.current === document.activeElement || textareaRef.current === document.activeElement) {
          handleBlur();
          containerRef.current?.focus();
        }
        break;
      // Tab navigation is handled naturally by browser
    }
  };

  const handleCascadeConfirm = async (action: CascadeAction) => {
    setShowImpactModal(false);

    if (pendingValue === null) return;

    try {
      if (onCascadeChange) {
        // Use custom cascade handler if provided
        await onCascadeChange(pendingValue, action);
      } else if (courseId && config.path) {
        // Default cascade handler: update field then handle cascade
        await updateFieldAction(courseId, stageId || 'stage_4', config.path, pendingValue);

        if (action !== 'mark_stale') {
          await cascadeUpdateAction(courseId, config.path, action);
        }
      }

      // Apply the change to local state
      onChange(pendingValue);
    } catch (error) {
      console.error('Failed to apply cascade change:', error);
    } finally {
      setPendingValue(null);
    }
  };

  const fieldId = `field-${config.path.replace(/\./g, '-')}`;
  const hasError = status === 'error';

  return (
    <div
      ref={containerRef}
      className={cn('space-y-2', className)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Label with AI button and SaveStatusIndicator */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label
            htmlFor={fieldId}
            className={cn(
              'text-sm font-medium',
              hasError && 'text-red-600',
              disabled && 'opacity-50'
            )}
          >
            {label}
          </Label>

          {regeneratable && !isRegenerateOpen && !regenerationResult && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setIsRegenerateOpen(true)}
                    disabled={disabled}
                    aria-label={locale === 'ru' ? 'Перегенерировать с AI' : 'Regenerate with AI'}
                  >
                    <Wand2 className="h-3.5 w-3.5 text-slate-500 hover:text-indigo-600" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{locale === 'ru' ? 'Перегенерировать с AI' : 'Regenerate with AI'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div aria-live="polite" aria-atomic="true">
          <SaveStatusIndicator status={status} />
        </div>
      </div>

      {/* Field Input */}
      {type === 'text' && (
        <Input
          ref={inputRef}
          id={fieldId}
          type="text"
          value={localValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          error={hasError}
          className="w-full"
          aria-label={label}
          aria-describedby={helpText ? `${fieldId}-help` : undefined}
          aria-invalid={hasError}
          aria-errormessage={hasError ? `${fieldId}-error` : undefined}
          aria-busy={status === 'saving'}
        />
      )}

      {type === 'textarea' && (
        <div className="relative">
          <Textarea
            ref={textareaRef}
            id={fieldId}
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'w-full resize-none overflow-hidden',
              hasError && 'border-red-500 focus-visible:ring-red-500'
            )}
            rows={3}
            aria-label={label}
            aria-describedby={helpText ? `${fieldId}-help` : undefined}
            aria-invalid={hasError}
            aria-errormessage={hasError ? `${fieldId}-error` : undefined}
            aria-busy={status === 'saving'}
          />
          {localValue && (
            <div className="absolute bottom-2 right-2 text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
              {localValue.length} символов
            </div>
          )}
        </div>
      )}

      {type === 'number' && (
        <Input
          id={fieldId}
          type="number"
          value={localValue}
          onChange={handleNumberChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          error={hasError}
          min={min}
          max={max}
          className="w-full"
          aria-label={label}
          aria-describedby={helpText ? `${fieldId}-help` : undefined}
          aria-invalid={hasError}
          aria-errormessage={hasError ? `${fieldId}-error` : undefined}
          aria-busy={status === 'saving'}
        />
      )}

      {type === 'toggle' && (
        <div className="flex items-center space-x-2">
          <Switch
            id={fieldId}
            checked={Boolean(value)}
            onCheckedChange={handleToggleChange}
            disabled={disabled}
            aria-label={label}
            aria-describedby={helpText ? `${fieldId}-help` : undefined}
          />
          <span className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
            {Boolean(value) ? 'Включено' : 'Выключено'}
          </span>
        </div>
      )}

      {type === 'select' && options && (
        <Select
          value={localValue}
          onValueChange={handleSelectChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={fieldId}
            className={cn(
              'w-full',
              hasError && 'border-red-500 focus:ring-red-500'
            )}
            aria-label={label}
            aria-describedby={helpText ? `${fieldId}-help` : undefined}
            aria-invalid={hasError}
            aria-errormessage={hasError ? `${fieldId}-error` : undefined}
          >
            <SelectValue placeholder={placeholder || 'Выберите значение'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Help Text */}
      {helpText && !hasError && (
        <p id={`${fieldId}-help`} className="text-xs text-slate-500 dark:text-slate-400">{helpText}</p>
      )}

      {/* Error Message */}
      {hasError && (
        <p id={`${fieldId}-error`} className="text-xs text-red-600" role="alert">
          Не удалось сохранить изменения
        </p>
      )}

      {/* InlineRegenerateChat - shown when regenerate button is clicked */}
      {isRegenerateOpen && regeneratable && courseId && stageId && (
        <InlineRegenerateChat
          courseId={courseId}
          stageId={stageId}
          blockPath={config.path}
          currentValue={value}
          locale={locale}
          onSuccess={(result) => setRegenerationResult(result)}
          onCancel={() => setIsRegenerateOpen(false)}
        />
      )}

      {/* SemanticDiffViewer - shown when regeneration result is available */}
      {regenerationResult && (
        <SemanticDiffViewer
          originalValue={value}
          regeneratedValue={regenerationResult.regenerated_content}
          diff={{
            changeType: determineChangeType(regenerationResult),
            conceptsAdded: regenerationResult.concepts_added,
            conceptsRemoved: regenerationResult.concepts_removed,
            alignmentScore: regenerationResult.alignment_score as 1 | 2 | 3 | 4 | 5,
            bloomLevelPreserved: regenerationResult.bloom_level_preserved,
            changeDescription: regenerationResult.pedagogical_change_log,
          }}
          locale={locale}
          onAccept={() => {
            onChange(regenerationResult.regenerated_content);
            setRegenerationResult(null);
            setIsRegenerateOpen(false);
          }}
          onEdit={() => {
            // Apply the change and close diff viewer, allow manual editing
            onChange(regenerationResult.regenerated_content);
            setRegenerationResult(null);
            setIsRegenerateOpen(false);
          }}
          onCancel={() => {
            setRegenerationResult(null);
            // Keep regenerate chat open for retry
          }}
        />
      )}

      {/* ImpactAnalysisModal - shown when learning objective is changed */}
      {showImpactModal && (
        <ImpactAnalysisModal
          isOpen={showImpactModal}
          onClose={() => {
            setShowImpactModal(false);
            setPendingValue(null);
          }}
          onConfirm={handleCascadeConfirm}
          affectedCount={affectedCount}
          fieldLabel={config.label}
          fieldPath={config.path}
          locale={locale}
        />
      )}
    </div>
  );
};
