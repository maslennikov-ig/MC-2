'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Key,
  Star,
  FileIcon,
  HelpCircle,
  Loader2,
  AlertTriangle,
  FileText,
  X,
  Rocket,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { updateDocumentPriority } from '@/app/actions/courses';
import { approveStage } from '@/app/actions/admin-generation';
import { toast } from 'sonner';

export type DocumentPriority = 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';

interface DocumentWithPriority {
  id: string;
  filename: string;
  originalName: string | null;
  priority: DocumentPriority;
  fileSize?: number;
  mimeType?: string;
}

interface PrioritizationPanelProps {
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  onApproved?: () => void;
  isDark?: boolean;
}

const PRIORITY_CONFIG: Record<DocumentPriority, { label: string; icon: typeof Key; color: string; bgColor: string }> = {
  CORE: { label: 'Ключевой', icon: Key, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  IMPORTANT: { label: 'Важный', icon: Star, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  SUPPLEMENTARY: { label: 'Дополнительный', icon: FileIcon, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800/50' },
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PrioritizationPanel({
  courseId,
  isOpen,
  onClose,
  onApproved,
  isDark = false,
}: PrioritizationPanelProps) {
  const [documents, setDocuments] = useState<DocumentWithPriority[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [isApproving, setIsApproving] = useState(false);

  // Fetch documents with priorities
  useEffect(() => {
    if (!isOpen || !courseId) return;

    const fetchDocuments = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();

        // Get files from file_catalog with their priorities
        const { data, error } = await supabase
          .from('file_catalog')
          .select('id, filename, original_name, file_size, mime_type, priority')
          .eq('course_id', courseId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[PrioritizationPanel] Failed to fetch documents:', error);
          toast.error('Не удалось загрузить документы');
          return;
        }

        const docs: DocumentWithPriority[] = (data || []).map((file) => ({
          id: file.id,
          filename: file.filename,
          originalName: file.original_name,
          priority: (file.priority as DocumentPriority) || 'SUPPLEMENTARY',
          fileSize: file.file_size || undefined,
          mimeType: file.mime_type || undefined,
        }));

        setDocuments(docs);
      } catch (err) {
        console.error('[PrioritizationPanel] Error:', err);
        toast.error('Произошла ошибка при загрузке документов');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [isOpen, courseId]);

  // Handle priority change
  const handlePriorityChange = useCallback(async (docId: string, newPriority: DocumentPriority) => {
    setUpdatingIds((prev) => new Set(prev).add(docId));

    try {
      // Format node ID as expected by the action
      const nodeId = `doc_${docId}`;
      const result = await updateDocumentPriority(courseId, nodeId, newPriority);

      if (result.success) {
        // Update local state
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
        toast.success(`Приоритет изменен на "${PRIORITY_CONFIG[newPriority].label}"`);
      } else {
        toast.error(result.error || 'Не удалось обновить приоритет');
      }
    } catch (error) {
      console.error('[PrioritizationPanel] Error updating priority:', error);
      toast.error('Произошла непредвиденная ошибка');
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }, [courseId]);

  // Handle approve
  const handleApprove = useCallback(async () => {
    setIsApproving(true);
    try {
      await approveStage(courseId, 3);
      toast.success('Приоритизация подтверждена. Переход к следующему этапу...');
      onApproved?.();
      onClose();
    } catch (error) {
      console.error('[PrioritizationPanel] Error approving:', error);
      toast.error('Не удалось подтвердить приоритизацию');
    } finally {
      setIsApproving(false);
    }
  }, [courseId, onApproved, onClose]);

  // Count by priority
  const counts = {
    CORE: documents.filter((d) => d.priority === 'CORE').length,
    IMPORTANT: documents.filter((d) => d.priority === 'IMPORTANT').length,
    SUPPLEMENTARY: documents.filter((d) => d.priority === 'SUPPLEMENTARY').length,
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-4xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`rounded-xl shadow-2xl overflow-hidden ${
                isDark
                  ? 'bg-slate-900 border border-slate-700'
                  : 'bg-white border border-slate-200'
              }`}
            >
              {/* Header */}
              <div
                className={`px-6 py-4 border-b flex items-center justify-between ${
                  isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      isDark ? 'bg-purple-500/20' : 'bg-purple-100'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h2
                      className={`text-lg font-semibold ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Приоритизация документов
                    </h2>
                    <p
                      className={`text-sm ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Проверьте и при необходимости измените приоритеты документов
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark
                      ? 'hover:bg-slate-700 text-slate-400'
                      : 'hover:bg-slate-100 text-slate-500'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Priority Summary */}
              <div
                className={`px-6 py-3 border-b flex items-center gap-4 ${
                  isDark ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-slate-400" />
                        <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          Распределение:
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1.5 text-xs">
                        <p><strong className="text-amber-600">Ключевой:</strong> Основной документ для курса (1 документ)</p>
                        <p><strong className="text-blue-600">Важный:</strong> Основные материалы (до 30%)</p>
                        <p><strong className="text-gray-500">Дополнительный:</strong> Вспомогательные материалы</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

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

              {/* Table */}
              <div className="max-h-[50vh] overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                      Документы не найдены
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className={isDark ? 'border-slate-700' : ''}>
                        <TableHead className={isDark ? 'text-slate-300' : ''}>
                          Документ
                        </TableHead>
                        <TableHead className={`text-center ${isDark ? 'text-slate-300' : ''}`}>
                          Размер
                        </TableHead>
                        <TableHead className={`text-right ${isDark ? 'text-slate-300' : ''}`}>
                          Приоритет
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => {
                        const isUpdating = updatingIds.has(doc.id);
                        const priorityConfig = PRIORITY_CONFIG[doc.priority];
                        const PriorityIcon = priorityConfig.icon;

                        return (
                          <TableRow
                            key={doc.id}
                            className={isDark ? 'border-slate-700 hover:bg-slate-800/50' : 'hover:bg-slate-50'}
                          >
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-2 rounded-lg ${
                                    isDark ? 'bg-slate-800' : 'bg-slate-100'
                                  }`}
                                >
                                  <FileText className="w-4 h-4 text-slate-500" />
                                </div>
                                <div>
                                  <p
                                    className={`font-medium truncate max-w-[300px] ${
                                      isDark ? 'text-white' : 'text-slate-900'
                                    }`}
                                    title={doc.originalName || doc.filename}
                                  >
                                    {doc.originalName || doc.filename}
                                  </p>
                                  <p
                                    className={`text-xs ${
                                      isDark ? 'text-slate-500' : 'text-slate-400'
                                    }`}
                                  >
                                    {doc.mimeType || 'Файл'}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell
                              className={`text-center ${
                                isDark ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              {formatFileSize(doc.fileSize)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Select
                                value={doc.priority}
                                onValueChange={(value) =>
                                  handlePriorityChange(doc.id, value as DocumentPriority)
                                }
                                disabled={isUpdating}
                              >
                                <SelectTrigger
                                  className={`w-[180px] ml-auto ${priorityConfig.bgColor}`}
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
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Footer */}
              <div
                className={`px-6 py-4 border-t flex items-center justify-end ${
                  isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
                }`}
              >
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
