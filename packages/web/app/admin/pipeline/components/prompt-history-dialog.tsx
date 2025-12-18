/**
 * PromptHistoryDialog Component (T045)
 *
 * Shows version history for a prompt template with text diff comparison and revert functionality.
 *
 * Features:
 * - List all versions for selected prompt
 * - Select two versions to compare with TextDiffViewer
 * - Revert to specific version with confirmation
 * - Display author and timestamp for each version
 *
 * @module app/admin/pipeline/components/prompt-history-dialog
 */

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, History, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getPromptHistory, revertPromptToVersion } from '@/app/actions/pipeline-admin';
import { TextDiffViewer } from './text-diff-viewer';
import type { PromptHistoryItem } from '@megacampus/shared-types';

interface PromptHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: string;
  promptKey: string;
  onReverted?: () => void;
}

/**
 * Display prompt template version history with diff and revert capabilities
 */
export function PromptHistoryDialog({
  open,
  onOpenChange,
  stage,
  promptKey,
  onReverted,
}: PromptHistoryDialogProps) {
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Diff comparison state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedV1, setSelectedV1] = useState<string>('');
  const [selectedV2, setSelectedV2] = useState<string>('');

  // Revert confirmation state
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertTargetVersion, setRevertTargetVersion] = useState<number | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // Load history when dialog opens
  useEffect(() => {
    if (!open) return;

    async function loadHistory() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getPromptHistory({
          stage,
          promptKey,
        });
        setHistory(result.result?.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, [open, stage, promptKey]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCompareMode(false);
      setSelectedV1('');
      setSelectedV2('');
    }
  }, [open]);

  // Handle revert action
  const handleRevert = async (version: number) => {
    setRevertTargetVersion(version);
    setRevertDialogOpen(true);
  };

  const confirmRevert = async () => {
    if (!revertTargetVersion) return;

    try {
      setIsReverting(true);
      await revertPromptToVersion({
        stage,
        promptKey,
        targetVersion: revertTargetVersion,
      });

      toast.success(`Reverted to version ${revertTargetVersion}`);
      onReverted?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revert');
    } finally {
      setIsReverting(false);
      setRevertDialogOpen(false);
      setRevertTargetVersion(null);
    }
  };

  // Get prompt templates for comparison
  const prompt1 = history.find((h) => h.id === selectedV1);
  const prompt2 = history.find((h) => h.id === selectedV2);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Prompt History: {stage} - {promptKey}
            </DialogTitle>
            <DialogDescription>
              View all prompt template versions and compare changes between versions
            </DialogDescription>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!isLoading && !error && history.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No version history available</p>
            </div>
          )}

          {!isLoading && !error && history.length > 0 && (
            <div className="space-y-4">
              {/* Compare mode toggle */}
              <div className="flex items-center justify-between">
                <Button
                  variant={compareMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setSelectedV1('');
                    setSelectedV2('');
                  }}
                >
                  {compareMode ? 'Exit Compare Mode' : 'Compare Versions'}
                </Button>

                {compareMode && (
                  <div className="text-sm text-muted-foreground">
                    Select two versions to compare
                  </div>
                )}
              </div>

              {/* Compare mode: Show diff */}
              {compareMode && selectedV1 && selectedV2 && prompt1 && prompt2 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      <Badge variant="outline">V{prompt1.version}</Badge> → <Badge variant="outline">V{prompt2.version}</Badge>
                    </span>
                  </div>
                  <TextDiffViewer
                    oldValue={prompt1.promptTemplate}
                    newValue={prompt2.promptTemplate}
                    oldTitle={`Version ${prompt1.version}`}
                    newTitle={`Version ${prompt2.version}`}
                  />
                </div>
              )}

              <Separator />

              {/* Version list */}
              <ScrollArea className="h-[400px] pr-4">
                {compareMode ? (
                  // Compare mode: Radio group for selecting two versions
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Version 1</Label>
                        <RadioGroup value={selectedV1} onValueChange={setSelectedV1}>
                          {history.map((item) => (
                            <div
                              key={`v1-${item.id}`}
                              className="flex items-center space-x-2 rounded-md border p-3 hover:bg-muted/50"
                            >
                              <RadioGroupItem value={item.id} id={`v1-${item.id}`} />
                              <Label
                                htmlFor={`v1-${item.id}`}
                                className="flex-1 cursor-pointer space-y-1"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">V{item.version}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(item.createdAt)}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.promptName}
                                </div>
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Version 2</Label>
                        <RadioGroup value={selectedV2} onValueChange={setSelectedV2}>
                          {history.map((item) => (
                            <div
                              key={`v2-${item.id}`}
                              className="flex items-center space-x-2 rounded-md border p-3 hover:bg-muted/50"
                            >
                              <RadioGroupItem value={item.id} id={`v2-${item.id}`} />
                              <Label
                                htmlFor={`v2-${item.id}`}
                                className="flex-1 cursor-pointer space-y-1"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">V{item.version}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(item.createdAt)}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.promptName}
                                </div>
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Normal mode: List with revert buttons
                  <div className="space-y-3">
                    {history.map((item, index) => (
                      <div
                        key={item.id}
                        className="rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={index === 0 ? 'default' : 'outline'}>
                                Version {item.version}
                              </Badge>
                              {index === 0 && <Badge variant="secondary">Current</Badge>}
                            </div>

                            <div className="space-y-1 text-sm">
                              <div>
                                <span className="text-muted-foreground">Name:</span>{' '}
                                <span className="font-medium">{item.promptName}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Variables:</span>{' '}
                                <span className="font-mono text-xs">
                                  {item.variables.length > 0 ? item.variables.join(', ') : 'None'}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {item.promptTemplate.substring(0, 150)}
                                {item.promptTemplate.length > 150 && '...'}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{formatDate(item.createdAt)}</span>
                              {item.createdByEmail && <span>By: {item.createdByEmail}</span>}
                            </div>
                          </div>

                          {index !== 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRevert(item.version)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Revert
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revert confirmation dialog */}
      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Revert</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revert to version {revertTargetVersion}? This will create a
              new active version with the template from version {revertTargetVersion}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReverting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevert} disabled={isReverting}>
              {isReverting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
