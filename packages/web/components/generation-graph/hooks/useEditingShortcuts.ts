'use client';

import { useEffect } from 'react';

export interface UseEditingShortcutsOptions {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCancel?: () => void;
  enabled?: boolean;
}

/**
 * Hook for keyboard shortcuts during editing operations.
 *
 * Supports:
 * - Ctrl+S / Cmd+S: Force save
 * - Ctrl+Z / Cmd+Z: Undo (if handler provided)
 * - Ctrl+Shift+Z / Cmd+Shift+Z: Redo (if handler provided)
 * - Escape: Cancel current edit (when focused on input/textarea)
 *
 * @param options - Configuration including enabled state and event handlers
 *
 * @example
 * ```tsx
 * useEditingShortcuts({
 *   onSave: handleForceSave,
 *   onUndo: handleUndo,
 *   onRedo: handleRedo,
 *   onCancel: handleCancelEdit,
 *   enabled: editMode,
 * });
 * ```
 */
export function useEditingShortcuts(options: UseEditingShortcutsOptions) {
  const { onSave, onUndo, onRedo, onCancel, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifierKey = e.ctrlKey || e.metaKey;

      // Ctrl+S or Cmd+S: Force save
      if (isModifierKey && e.key === 's') {
        e.preventDefault();
        onSave?.();
        return;
      }

      // Ctrl+Z or Cmd+Z: Undo
      if (isModifierKey && e.key === 'z' && !e.shiftKey) {
        // Only prevent default if handler exists
        if (onUndo) {
          e.preventDefault();
          onUndo();
        }
        return;
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z: Redo
      if (isModifierKey && e.key === 'z' && e.shiftKey) {
        // Only prevent default if handler exists
        if (onRedo) {
          e.preventDefault();
          onRedo();
        }
        return;
      }

      // Escape: Cancel current edit
      if (e.key === 'Escape') {
        // Only trigger if we're in an editing context (input/textarea focused)
        const activeElement = document.activeElement;
        const isEditing =
          activeElement?.tagName === 'INPUT' ||
          activeElement?.tagName === 'TEXTAREA' ||
          activeElement?.hasAttribute('contenteditable');

        if (isEditing && onCancel) {
          e.preventDefault();
          onCancel();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onSave, onUndo, onRedo, onCancel]);
}

/**
 * Get the platform-specific modifier key display string.
 *
 * @returns '⌘' on macOS, 'Ctrl' on other platforms
 */
export function getModifierKeyDisplay(): string {
  if (typeof window === 'undefined') return 'Ctrl';
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  return isMac ? '⌘' : 'Ctrl';
}
