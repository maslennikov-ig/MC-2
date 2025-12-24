'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Key,
  Loader2,
  FileText,
  Rocket,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createClient } from '@/lib/supabase/client';
import { updateDocumentPriority } from '@/app/actions/courses';
import { approveStage } from '@/app/actions/admin-generation';
import { toast } from 'sonner';
import {
  type DocumentPriority,
  PRIORITY_CONFIG as SSOT_PRIORITY_CONFIG,
} from '@/lib/generation-graph/priority-config';
import {
  getDocumentDisplayName,
  truncateDisplayName,
} from '@/lib/generation-graph/document-display-name';

// Re-export type for external usage
export type { DocumentPriority };

interface DocumentWithPriority {
  id: string;
  filename: string;
  /** AI-generated title from Phase 6 summarization */
  generatedTitle: string | null;
  originalName: string | null;
  priority: DocumentPriority;
  fileSize?: number;
  mimeType?: string;
}

interface PrioritizationViewProps {
  courseId: string;
  editable?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  onApproved?: () => void;
}

/**
 * Local priority config adapted from SSOT for component-specific styling.
 * Labels come from Single Source of Truth (priority-config.ts).
 */
const PRIORITY_CONFIG = Object.fromEntries(
  (Object.entries(SSOT_PRIORITY_CONFIG) as [DocumentPriority, typeof SSOT_PRIORITY_CONFIG[DocumentPriority]][]).map(
    ([key, config]) => [
      key,
      {
        label: config.label.ru,
        icon: config.icon,
        color: config.style.text,
        bgColor: config.style.bg,
      },
    ]
  )
) as Record<DocumentPriority, { label: string; icon: typeof SSOT_PRIORITY_CONFIG.CORE.icon; color: string; bgColor: string }>;

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PrioritizationView({
  courseId,
  editable = false,
  readOnly = false,
  autoFocus = false,
  onApproved,
}: PrioritizationViewProps) {
  const [documents, setDocuments] = useState<DocumentWithPriority[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [isApproving, setIsApproving] = useState(false);

  // Confirmation dialog state for CORE replacement
  const [coreConfirmDialog, setCoreConfirmDialog] = useState<{
    isOpen: boolean;
    newDocId: string;
    newDocName: string;
    currentCoreDocName: string;
  } | null>(null);

  // Fetch documents with priorities
  useEffect(() => {
    if (!courseId) return;

    const fetchDocuments = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();

        const { data, error } = await supabase
          .from('file_catalog')
          .select('id, filename, generated_title, original_name, file_size, mime_type, priority')
          .eq('course_id', courseId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[PrioritizationView] Failed to fetch documents:', error);
          toast.error('Не удалось загрузить документы');
          return;
        }

        const docs: DocumentWithPriority[] = (data || []).map((file) => ({
          id: file.id,
          filename: file.filename,
          generatedTitle: (file as { generated_title?: string | null }).generated_title ?? null,
          originalName: file.original_name,
          priority: (file.priority as DocumentPriority) || 'SUPPLEMENTARY',
          fileSize: file.file_size || undefined,
          mimeType: file.mime_type || undefined,
        }));

        setDocuments(docs);
      } catch (err) {
        console.error('[PrioritizationView] Error:', err);
        toast.error('Произошла ошибка при загрузке документов');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [courseId]);

  // Execute the actual priority change (after confirmation if needed)
  const executePriorityChange = useCallback(async (docId: string, newPriority: DocumentPriority) => {
    setUpdatingIds((prev) => new Set(prev).add(docId));

    try {
      const nodeId = `doc_${docId}`;
      const currentCoreDoc = documents.find(d => d.priority === 'CORE' && d.id !== docId);
      const result = await updateDocumentPriority(courseId, nodeId, newPriority);

      if (result.success) {
        setDocuments((prev) =>
          prev.map((doc) => {
            // Update the selected document
            if (doc.id === docId) {
              return { ...doc, priority: newPriority };
            }
            // CONSTRAINT: Only 1 CORE allowed - demote other CORE to IMPORTANT
            if (newPriority === 'CORE' && doc.priority === 'CORE') {
              return { ...doc, priority: 'IMPORTANT' };
            }
            return doc;
          })
        );

        // Show informative toast
        if (newPriority === 'CORE' && currentCoreDoc) {
          const newDoc = documents.find(d => d.id === docId);
          const newDocName = newDoc
            ? getDocumentDisplayName({
                generated_title: newDoc.generatedTitle,
                original_name: newDoc.originalName,
                filename: newDoc.filename,
              })
            : 'Документ';
          const coreDocName = getDocumentDisplayName({
            generated_title: currentCoreDoc.generatedTitle,
            original_name: currentCoreDoc.originalName,
            filename: currentCoreDoc.filename,
          });
          toast.success(
            `"${truncateDisplayName(newDocName, 30)}" теперь ключевой. "${truncateDisplayName(coreDocName, 30)}" изменен на "Важный".`,
            { duration: 5000 }
          );
        } else {
          toast.success(`Приоритет изменен на "${PRIORITY_CONFIG[newPriority].label}"`);
        }
      } else {
        toast.error(result.error || 'Не удалось обновить приоритет');
      }
    } catch (error) {
      console.error('[PrioritizationView] Error updating priority:', error);
      toast.error('Произошла непредвиденная ошибка');
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }, [courseId, documents]);

  // Handle priority change - show confirmation for CORE replacement
  const handlePriorityChange = useCallback((docId: string, newPriority: DocumentPriority) => {
    // Check if trying to set CORE and there's already a CORE document
    if (newPriority === 'CORE') {
      const currentCoreDoc = documents.find(d => d.priority === 'CORE' && d.id !== docId);
      const newDoc = documents.find(d => d.id === docId);

      if (currentCoreDoc && newDoc) {
        // Use getDocumentDisplayName for meaningful names
        const newDocDisplayName = getDocumentDisplayName({
          generated_title: newDoc.generatedTitle,
          original_name: newDoc.originalName,
          filename: newDoc.filename,
        });
        const currentCoreDisplayName = getDocumentDisplayName({
          generated_title: currentCoreDoc.generatedTitle,
          original_name: currentCoreDoc.originalName,
          filename: currentCoreDoc.filename,
        });
        // Show confirmation dialog
        setCoreConfirmDialog({
          isOpen: true,
          newDocId: docId,
          newDocName: newDocDisplayName,
          currentCoreDocName: currentCoreDisplayName,
        });
        return;
      }
    }

    // No confirmation needed - execute directly
    executePriorityChange(docId, newPriority);
  }, [documents, executePriorityChange]);

  // Handle confirmation dialog actions
  const handleCoreConfirm = useCallback(() => {
    if (coreConfirmDialog) {
      executePriorityChange(coreConfirmDialog.newDocId, 'CORE');
      setCoreConfirmDialog(null);
    }
  }, [coreConfirmDialog, executePriorityChange]);

  const handleCoreCancel = useCallback(() => {
    setCoreConfirmDialog(null);
  }, []);

  // Handle approve
  const handleApprove = useCallback(async () => {
    setIsApproving(true);
    try {
      await approveStage(courseId, 3);
      toast.success('Приоритизация подтверждена. Переход к следующему этапу...');
      onApproved?.();
    } catch (error) {
      console.error('[PrioritizationView] Error approving:', error);
      toast.error('Не удалось подтвердить приоритизацию');
    } finally {
      setIsApproving(false);
    }
  }, [courseId, onApproved]);

  // Count by priority
  const counts = {
    CORE: documents.filter((d) => d.priority === 'CORE').length,
    IMPORTANT: documents.filter((d) => d.priority === 'IMPORTANT').length,
    SUPPLEMENTARY: documents.filter((d) => d.priority === 'SUPPLEMENTARY').length,
  };

  const canEdit = editable && !readOnly;

  if (isLoading) {
    return <PrioritizationViewSkeleton />;
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <FileText className="w-8 h-8 mb-2" />
        <p className="text-sm font-medium">Документы не найдены</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Priority Summary */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/50">
        <span className="text-sm text-muted-foreground mr-2">Распределение:</span>
        {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
          <Badge
            key={key}
            variant="outline"
            className={`${config.bgColor} ${config.color} border-0`}
          >
            <config.icon className="w-3 h-3 mr-1" />
            {config.label}: {counts[key as DocumentPriority]}
          </Badge>
        ))}
      </div>

      {/* Documents Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Документ</TableHead>
              <TableHead className="text-center w-24">Размер</TableHead>
              <TableHead className="text-right w-48">Приоритет</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc, index) => {
              const isUpdating = updatingIds.has(doc.id);
              const priorityConfig = PRIORITY_CONFIG[doc.priority];
              const PriorityIcon = priorityConfig.icon;
              const isCore = doc.priority === 'CORE';

              return (
                <TableRow
                  key={doc.id}
                  className={isCore ? 'bg-amber-50/50 dark:bg-amber-950/20 border-l-2 border-l-amber-500' : ''}
                >
                  <TableCell>
                    {(() => {
                      const displayName = getDocumentDisplayName({
                        generated_title: doc.generatedTitle,
                        original_name: doc.originalName,
                        filename: doc.filename,
                      });
                      const originalFilename = doc.originalName || doc.filename;
                      const showOriginal = doc.generatedTitle && doc.generatedTitle !== originalFilename;
                      return (
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isCore ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-muted'}`}>
                            {isCore ? (
                              <Key className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <FileText className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <p
                              className="font-medium truncate max-w-[300px]"
                              title={displayName}
                            >
                              {truncateDisplayName(displayName, 50)}
                            </p>
                            {showOriginal && (
                              <p
                                className="text-xs text-muted-foreground/70 truncate max-w-[280px]"
                                title={originalFilename}
                              >
                                ({truncateDisplayName(originalFilename, 40)})
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {doc.mimeType || 'Файл'}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {formatFileSize(doc.fileSize)}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit ? (
                      <Select
                        value={doc.priority}
                        onValueChange={(value) =>
                          handlePriorityChange(doc.id, value as DocumentPriority)
                        }
                        disabled={isUpdating}
                      >
                        <SelectTrigger
                          className={`w-[180px] ml-auto ${priorityConfig.bgColor}`}
                          autoFocus={autoFocus && index === 0}
                        >
                          {isUpdating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <SelectValue>
                              <div className="flex items-center gap-2">
                                <PriorityIcon className={`w-4 h-4 ${priorityConfig.color}`} />
                                <span>{priorityConfig.label}</span>
                              </div>
                            </SelectValue>
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <config.icon className={`w-4 h-4 ${config.color}`} />
                                <span>{config.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`${priorityConfig.bgColor} ${priorityConfig.color} border-0`}
                      >
                        <PriorityIcon className="w-3 h-3 mr-1" />
                        {priorityConfig.label}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Approve Button - only show when editable and not readOnly */}
      {canEdit && (
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleApprove}
            disabled={isApproving || isLoading}
            className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/25"
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4 mr-2" />
            )}
            Подтвердить и продолжить
          </Button>
        </div>
      )}

      {/* Read-only completion indicator */}
      {readOnly && (
        <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="text-sm">Приоритизация завершена</span>
        </div>
      )}

      {/* CORE replacement confirmation dialog */}
      <AlertDialog open={coreConfirmDialog?.isOpen ?? false} onOpenChange={(open) => !open && handleCoreCancel()}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <span>Заменить ключевой документ?</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              Может быть только один ключевой документ. Предыдущий будет изменен на «Важный».
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Document comparison - custom content outside description */}
          <div className="space-y-3 text-sm overflow-hidden">
            <div className="p-3 rounded-lg bg-muted/50 overflow-hidden">
              <span className="text-muted-foreground text-xs">Сейчас ключевой:</span>
              <p
                className="font-medium text-foreground mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
                title={coreConfirmDialog?.currentCoreDocName}
              >
                {coreConfirmDialog?.currentCoreDocName}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 overflow-hidden">
              <span className="text-amber-600 dark:text-amber-400 text-xs">Новый ключевой:</span>
              <p
                className="font-medium text-amber-700 dark:text-amber-300 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
                title={coreConfirmDialog?.newDocName}
              >
                {coreConfirmDialog?.newDocName}
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCoreConfirm}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Key className="w-4 h-4 mr-2" />
              Заменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function PrioritizationViewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-lg bg-muted/50">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-28" />
      </div>
      <div className="border rounded-lg">
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div>
                  <Skeleton className="h-4 w-48 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-9 w-[180px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
