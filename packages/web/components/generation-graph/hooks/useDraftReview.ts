'use client';

import { useState, useCallback } from 'react';

/**
 * Draft review mode
 */
export type DraftReviewMode = 'view' | 'edit';

/**
 * Draft review state and actions
 */
export interface DraftReviewState {
  /** Current review mode */
  mode: DraftReviewMode;
  /** Whether in edit mode */
  isEditing: boolean;
  /** Whether draft has unsaved edits */
  hasEdits: boolean;
  /** Current edited content (null if not editing) */
  editedContent: unknown | null;
  /** Enter edit mode */
  startEditing: () => void;
  /** Exit edit mode without saving */
  cancelEditing: () => void;
  /** Update edited content */
  updateContent: (content: unknown) => void;
  /** Reset to original content */
  resetContent: () => void;
}

/**
 * Hook for managing two-stage draft review flow
 *
 * Provides state management for viewing and editing draft content
 * before approving for final generation.
 *
 * @param originalContent - Original draft content from the server
 * @returns Draft review state with edit actions
 *
 * @example
 * ```tsx
 * const {
 *   mode,
 *   isEditing,
 *   hasEdits,
 *   editedContent,
 *   startEditing,
 *   cancelEditing,
 *   updateContent,
 * } = useDraftReview(enrichment.draft_content);
 *
 * const handleApprove = async () => {
 *   const content = hasEdits ? editedContent : originalContent;
 *   await approveDraft({ enrichmentId, content });
 * };
 * ```
 */
export function useDraftReview(originalContent: unknown | null): DraftReviewState {
  const [mode, setMode] = useState<DraftReviewMode>('view');
  const [editedContent, setEditedContent] = useState<unknown | null>(null);

  const isEditing = mode === 'edit';
  const hasEdits = editedContent !== null;

  const startEditing = useCallback(() => {
    // Initialize edited content with original when entering edit mode
    setEditedContent(originalContent);
    setMode('edit');
  }, [originalContent]);

  const cancelEditing = useCallback(() => {
    setMode('view');
    setEditedContent(null);
  }, []);

  const updateContent = useCallback((content: unknown) => {
    setEditedContent(content);
  }, []);

  const resetContent = useCallback(() => {
    setEditedContent(originalContent);
  }, [originalContent]);

  // Callbacks are already memoized with useCallback - no need for outer useMemo
  return {
    mode,
    isEditing,
    hasEdits,
    editedContent,
    startEditing,
    cancelEditing,
    updateContent,
    resetContent,
  };
}

/**
 * Hook for tracking draft approval in progress
 */
export function useDraftApprovalStatus() {
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const startApproval = useCallback(() => {
    setIsApproving(true);
    setApprovalError(null);
  }, []);

  const completeApproval = useCallback(() => {
    setIsApproving(false);
  }, []);

  const failApproval = useCallback((error: string) => {
    setIsApproving(false);
    setApprovalError(error);
  }, []);

  const clearError = useCallback(() => {
    setApprovalError(null);
  }, []);

  // Callbacks are already memoized with useCallback - no need for outer useMemo
  return {
    isApproving,
    approvalError,
    startApproval,
    completeApproval,
    failApproval,
    clearError,
  };
}

/**
 * Combined draft review with approval status
 */
export function useDraftReviewWithApproval(originalContent: unknown | null) {
  const review = useDraftReview(originalContent);
  const approval = useDraftApprovalStatus();

  // Helper needs useCallback to be stable
  const getContentToSubmit = useCallback(
    () => (review.hasEdits ? review.editedContent : originalContent),
    [review.hasEdits, review.editedContent, originalContent]
  );

  return {
    ...review,
    ...approval,
    getContentToSubmit,
  };
}
