'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';
import { SaveStatus } from '../../hooks/useAutoSave';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { ImpactAnalysisModal, type CascadeAction } from './ImpactAnalysisModal';
import { getBlockDependenciesAction, updateFieldAction, cascadeUpdateAction } from '@/app/actions/admin-generation';
import { cn } from '@/lib/utils';
import { useEditHistoryStore } from '@/stores/useEditHistoryStore';

interface EditableChipsProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  onBlur?: () => void;
  status?: SaveStatus;
  error?: string | null;
  placeholder?: string;
  maxItems?: number;
  disabled?: boolean;
  className?: string;
  isLearningObjective?: boolean; // Flag for LO fields that need cascade check
  courseId?: string; // Required if isLearningObjective
  stageId?: 'stage_4' | 'stage_5'; // Required if isLearningObjective
  fieldPath?: string; // Required if isLearningObjective
  locale?: 'ru' | 'en';
  onCascadeChange?: (value: unknown, action: CascadeAction) => Promise<void>;
}

export const EditableChips: React.FC<EditableChipsProps> = ({
  label,
  items,
  onChange,
  onBlur,
  status = 'idle',
  error,
  placeholder = 'Добавить...',
  maxItems,
  disabled = false,
  className,
  isLearningObjective = false,
  courseId,
  stageId,
  fieldPath,
  locale = 'ru',
  onCascadeChange,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [focusedChipIndex, setFocusedChipIndex] = useState<number>(-1);
  const chipRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Edit history store
  const pushEdit = useEditHistoryStore((state) => state.pushEdit);

  // Track previous value for edit history
  const previousValueRef = React.useRef<string[]>(items);

  // Impact Analysis Modal state
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [pendingValue, setPendingValue] = useState<string[] | null>(null);
  const [affectedCount, setAffectedCount] = useState(0);

  const handleItemsChange = async (newItems: string[]) => {
    // Track edit in history (only if courseId and stageId are available)
    if (courseId && stageId && fieldPath) {
      pushEdit({
        courseId,
        stageId,
        fieldPath,
        previousValue: previousValueRef.current,
        newValue: newItems,
      });

      // Update previous value ref for next edit
      previousValueRef.current = newItems;
    }

    if (isLearningObjective && courseId && fieldPath) {
      // Store pending value and fetch affected count
      setPendingValue(newItems);

      try {
        const result = await getBlockDependenciesAction(courseId, fieldPath);
        setAffectedCount(result.downstream?.length || 0);
        setShowImpactModal(true);
      } catch (error) {
        console.error('Failed to get dependencies:', error);
        // Fallback: apply change without cascade check
        onChange(newItems);
      }
    } else {
      onChange(newItems);
    }
  };

  const handleRemove = (index: number) => {
    if (disabled) return;
    const newItems = items.filter((_, i) => i !== index);
    handleItemsChange(newItems);
  };

  const handleAdd = () => {
    const trimmedValue = inputValue.trim();

    if (!trimmedValue) {
      setInputValue('');
      return;
    }

    // Check for duplicates
    if (items.includes(trimmedValue)) {
      setInputValue('');
      return;
    }

    // Check max items limit
    if (maxItems && items.length >= maxItems) {
      setInputValue('');
      return;
    }

    const newItems = [...items, trimmedValue];
    handleItemsChange(newItems);
    setInputValue('');
  };

  const handleCascadeConfirm = async (action: CascadeAction) => {
    setShowImpactModal(false);

    if (pendingValue === null) return;

    try {
      if (onCascadeChange) {
        // Use custom cascade handler if provided
        await onCascadeChange(pendingValue, action);
      } else if (courseId && fieldPath) {
        // Default cascade handler: update field then handle cascade
        await updateFieldAction(courseId, stageId || 'stage_4', fieldPath, pendingValue);

        if (action !== 'mark_stale') {
          await cascadeUpdateAction(courseId, fieldPath, action);
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Backspace' && inputValue === '' && items.length > 0) {
      // Remove last item when backspace on empty input
      handleRemove(items.length - 1);
    } else if (e.key === 'Escape') {
      setInputValue('');
      setShowInput(false);
    }
  };

  const handleInputBlur = () => {
    handleAdd();
    setShowInput(false);
    onBlur?.();
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only handle keys when container is focused (not input)
    if (document.activeElement === inputRef.current) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        // Focus the input for adding chips
        setShowInput(true);
        setTimeout(() => inputRef.current?.focus(), 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (focusedChipIndex < items.length - 1) {
          const newIndex = focusedChipIndex + 1;
          setFocusedChipIndex(newIndex);
          chipRefs.current[newIndex]?.focus();
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (focusedChipIndex > 0) {
          const newIndex = focusedChipIndex - 1;
          setFocusedChipIndex(newIndex);
          chipRefs.current[newIndex]?.focus();
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (focusedChipIndex >= 0) {
          handleRemove(focusedChipIndex);
          // Focus the previous chip or container
          const newIndex = Math.max(0, focusedChipIndex - 1);
          setFocusedChipIndex(newIndex);
          setTimeout(() => {
            if (items.length > 1) {
              chipRefs.current[newIndex]?.focus();
            } else {
              containerRef.current?.focus();
            }
          }, 0);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setFocusedChipIndex(-1);
        containerRef.current?.focus();
        break;
    }
  };

  // Sync previous value ref when items change from external source
  React.useEffect(() => {
    previousValueRef.current = items;
  }, [items]);

  const canAddMore = !maxItems || items.length < maxItems;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
        <div aria-live="polite" aria-atomic="true">
          <SaveStatusIndicator status={status} error={error} />
        </div>
      </div>

      <div
        ref={containerRef}
        role="listbox"
        aria-label={label}
        aria-multiselectable="false"
        className="flex flex-wrap gap-1.5 items-center"
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
      >
        {items.map((item, index) => (
          <div
            key={index}
            ref={(el) => {
              chipRefs.current[index] = el;
            }}
            role="option"
            aria-selected={focusedChipIndex === index}
            aria-label={`${item} - ${locale === 'ru' ? 'нажмите Delete для удаления' : 'press delete to remove'}`}
            tabIndex={-1}
            onFocus={() => setFocusedChipIndex(index)}
          >
            <Badge
              variant="outline"
              className="pl-2.5 pr-1 py-1 text-xs flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className="ml-1 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`${locale === 'ru' ? 'Удалить' : 'Remove'} ${item}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          </div>
        ))}

        {/* Add new item input */}
        {(showInput || items.length === 0) && canAddMore && !disabled ? (
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleInputBlur}
            placeholder={placeholder}
            autoFocus
            className="h-7 w-32 text-xs"
            aria-label={`${locale === 'ru' ? 'Добавить' : 'Add'} ${label}`}
            aria-busy={status === 'saving'}
          />
        ) : canAddMore && !disabled ? (
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md border border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
            aria-label={`${locale === 'ru' ? 'Добавить элемент' : 'Add item'}`}
          >
            <Plus className="h-3 w-3" />
            <span>{placeholder}</span>
          </button>
        ) : null}

        {maxItems && items.length >= maxItems && (
          <span className="text-xs text-slate-400 dark:text-slate-500 italic" aria-live="polite">
            (макс. {maxItems})
          </span>
        )}
      </div>

      {/* ImpactAnalysisModal - shown when learning objective is changed */}
      {showImpactModal && fieldPath && (
        <ImpactAnalysisModal
          isOpen={showImpactModal}
          onClose={() => {
            setShowImpactModal(false);
            setPendingValue(null);
          }}
          onConfirm={handleCascadeConfirm}
          affectedCount={affectedCount}
          fieldLabel={label}
          fieldPath={fieldPath}
          locale={locale}
        />
      )}
    </div>
  );
};
