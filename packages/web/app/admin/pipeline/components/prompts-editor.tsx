/**
 * PromptsEditor Component (T043)
 *
 * Displays prompt templates grouped by pipeline stage with edit and history actions.
 *
 * Features:
 * - Accordion grouped by stage (stage_3, stage_4, stage_5, stage_6)
 * - Display prompt metadata (name, key, version, variables)
 * - Edit button to open PromptEditorDialog
 * - History button to open PromptHistoryDialog
 * - Loading states and error handling
 *
 * @module app/admin/pipeline/components/prompts-editor
 */

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Edit, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PromptEditorDialog } from './prompt-editor-dialog';
import { PromptHistoryDialog } from './prompt-history-dialog';
import { listPromptTemplates } from '@/app/actions/pipeline-admin';

interface PromptVariable {
  name: string;
  description: string;
  required: boolean;
  example?: string;
}

interface PromptTemplate {
  id: string;
  stage: string;
  promptKey: string;
  promptName: string;
  promptDescription: string | null;
  promptTemplate: string;
  variables: PromptVariable[];
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  createdByEmail: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  stage_3: 'Stage 3: Document Classification',
  stage_4: 'Stage 4: Content Analysis',
  stage_5: 'Stage 5: Course Structure',
  stage_6: 'Stage 6: Lesson Generation',
};

/**
 * Main prompts editor component with stage-grouped accordion
 */
export function PromptsEditor() {
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate[]>>({
    stage_3: [],
    stage_4: [],
    stage_5: [],
    stage_6: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);

  /**
   * Load all prompt templates from backend
   */
  const loadPrompts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await listPromptTemplates();
      setPrompts(result.result?.data || { stage_3: [], stage_4: [], stage_5: [], stage_6: [] });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load prompts';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  /**
   * Open editor dialog for specific prompt
   */
  const handleEdit = (prompt: PromptTemplate) => {
    setSelectedPrompt(prompt);
    setEditorOpen(true);
  };

  /**
   * Open history dialog for specific prompt
   */
  const handleHistory = (prompt: PromptTemplate) => {
    setSelectedPrompt(prompt);
    setHistoryOpen(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={loadPrompts}
          className="mt-3"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Prompt Templates</h2>
        <p className="text-sm text-muted-foreground">
          Edit and manage prompt templates for each pipeline stage
        </p>
      </div>

      <Accordion type="multiple" defaultValue={['stage_3', 'stage_4', 'stage_5', 'stage_6']}>
        {Object.entries(STAGE_LABELS).map(([stage, label]) => (
          <AccordionItem key={stage} value={stage}>
            <AccordionTrigger className="text-lg font-medium">
              {label}
              <Badge variant="secondary" className="ml-2">
                {prompts[stage]?.length || 0} prompts
              </Badge>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 pt-2">
                {prompts[stage]?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No prompts in this stage</p>
                ) : (
                  prompts[stage]?.map((prompt) => (
                    <Card key={prompt.id} className="hover:border-primary transition-colors">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{prompt.promptName}</CardTitle>
                            <CardDescription className="text-xs">
                              {prompt.promptKey} • v{prompt.version}
                            </CardDescription>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(prompt)}
                              title="Edit prompt"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleHistory(prompt)}
                              title="View history"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {prompt.promptDescription && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {prompt.promptDescription}
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          {prompt.variables?.length > 0 ? (
                            prompt.variables.map((v) => (
                              <Badge key={v.name} variant="outline" className="text-xs">
                                {`{{${v.name}}}`}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No variables</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Dialogs */}
      <PromptEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        prompt={selectedPrompt}
        onSaved={loadPrompts}
      />
      <PromptHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        stage={selectedPrompt?.stage || ''}
        promptKey={selectedPrompt?.promptKey || ''}
        onReverted={loadPrompts}
      />
    </div>
  );
}
