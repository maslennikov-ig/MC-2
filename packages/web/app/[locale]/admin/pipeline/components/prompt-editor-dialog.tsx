/**
 * PromptEditorDialog Component (T044)
 *
 * Theme-aware prompt template editor with CodeMirror.
 *
 * Features:
 * - Theme-aware editor (Tokyo Night in dark, default light in light mode)
 * - Clickable variable chips that insert at cursor position
 * - Clean visual hierarchy with clear sections
 * - Real-time XML validation
 * - Preview with variable substitution
 *
 * @module app/admin/pipeline/components/prompt-editor-dialog
 */

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { xml } from '@codemirror/lang-xml';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  Code2,
  Info,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { updatePromptTemplate } from '@/app/actions/pipeline-admin';

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
}

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: PromptTemplate | null;
  onSaved?: () => void;
}

const formSchema = z.object({
  promptName: z.string().min(1, 'Name is required'),
  promptDescription: z.string().nullable(),
  promptTemplate: z.string().min(1, 'Template is required'),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Stage color mapping for visual distinction
 */
const stageColors: Record<string, string> = {
  stage_3: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  stage_4: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  stage_5: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  stage_6: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

/**
 * Theme-aware prompt editor dialog
 */
export function PromptEditorDialog({
  open,
  onOpenChange,
  prompt,
  onSaved,
}: PromptEditorDialogProps) {
  const { resolvedTheme } = useTheme();
  const [templateContent, setTemplateContent] = useState('');
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('editor');
  const [previewData, setPreviewData] = useState<Record<string, string>>({});
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  // Reset form when prompt changes
  useEffect(() => {
    if (prompt && open) {
      reset({
        promptName: prompt.promptName,
        promptDescription: prompt.promptDescription || '',
        promptTemplate: prompt.promptTemplate,
      });
      setTemplateContent(prompt.promptTemplate);
      setXmlError(null);
      setActiveTab('editor');

      // Initialize preview data with examples
      const initialData: Record<string, string> = {};
      prompt.variables?.forEach((v) => {
        initialData[v.name] = v.example || `[${v.name}]`;
      });
      setPreviewData(initialData);
    }
  }, [prompt, open, reset]);

  // Validate XML structure
  const validateXml = useCallback((content: string) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<root>${content}</root>`, 'text/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        setXmlError(parseError.textContent || 'Invalid XML structure');
      } else {
        setXmlError(null);
      }
    } catch {
      setXmlError('Failed to parse XML');
    }
  }, []);

  // Handle template content changes
  const handleTemplateChange = useCallback(
    (value: string) => {
      setTemplateContent(value);
      setValue('promptTemplate', value, { shouldDirty: true });
      validateXml(value);
    },
    [setValue, validateXml]
  );

  // Insert variable at cursor position
  const insertVariable = useCallback((variableName: string) => {
    const view = editorRef.current?.view;
    if (!view) return;

    const variableText = `{{${variableName}}}`;
    const { from, to } = view.state.selection.main;

    view.dispatch({
      changes: { from, to, insert: variableText },
      selection: { anchor: from + variableText.length },
    });

    view.focus();
  }, []);

  // Copy variable to clipboard
  const copyVariable = useCallback((variableName: string) => {
    navigator.clipboard.writeText(`{{${variableName}}}`);
    toast.success(`Copied {{${variableName}}} to clipboard`);
  }, []);

  // Generate preview with variable substitution
  const preview = useMemo(() => {
    let result = templateContent;
    Object.entries(previewData).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return result;
  }, [templateContent, previewData]);

  // Submit form
  const onSubmit = async (data: FormValues) => {
    if (!prompt) return;

    try {
      await updatePromptTemplate({
        id: prompt.id,
        promptName: data.promptName !== prompt.promptName ? data.promptName : undefined,
        promptDescription:
          data.promptDescription !== prompt.promptDescription
            ? data.promptDescription
            : undefined,
        promptTemplate:
          data.promptTemplate !== prompt.promptTemplate ? data.promptTemplate : undefined,
      });

      toast.success('Prompt template updated successfully');
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('CONFLICT') ||
          (typeof error === 'object' && error !== null && 'code' in error && error.code === 'CONFLICT'))
      ) {
        toast.error(
          'Configuration was modified by another user. Please refresh to get the latest version.',
          { duration: 5000 }
        );
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Failed to update prompt');
    }
  };

  if (!prompt) return null;

  const stageColor = stageColors[prompt.stage] || 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800">
        <DialogHeader className="pb-4 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                Edit Prompt Template
              </DialogTitle>
              <DialogDescription asChild>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="outline" className={cn('font-mono text-xs', stageColor)}>
                    {prompt.stage.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <span className="text-gray-500 dark:text-zinc-500">{prompt.promptKey}</span>
                  <Badge variant="secondary" className="bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 text-xs">
                    v{prompt.version}
                  </Badge>
                </div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0 gap-4">
          {/* Name and Description row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="promptName" className="text-gray-600 dark:text-zinc-400 text-sm">
                Name
              </Label>
              <Input
                id="promptName"
                {...register('promptName')}
                className="bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 focus:border-purple-500 dark:focus:border-cyan-500"
              />
              {errors.promptName && (
                <p className="text-sm text-red-400">{errors.promptName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="promptDescription" className="text-gray-600 dark:text-zinc-400 text-sm">
                Description
              </Label>
              <Input
                id="promptDescription"
                {...register('promptDescription')}
                className="bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 focus:border-purple-500 dark:focus:border-cyan-500"
                placeholder="Brief description of this prompt..."
              />
            </div>
          </div>

          {/* Variables section */}
          {prompt.variables && prompt.variables.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500 dark:text-cyan-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Available Variables
                </span>
                <span className="text-xs text-gray-500 dark:text-zinc-500">
                  (click to insert at cursor)
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <TooltipProvider delayDuration={200}>
                  {prompt.variables.map((variable) => (
                    <Tooltip key={variable.name}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => insertVariable(variable.name)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            copyVariable(variable.name);
                          }}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono',
                            'bg-gray-100 dark:bg-zinc-800/80 border border-gray-300 dark:border-zinc-700 text-purple-500 dark:text-cyan-400',
                            'hover:bg-gray-200 dark:hover:bg-zinc-700 hover:border-purple-500/50 dark:hover:border-cyan-500/50 transition-colors',
                            'focus:outline-none focus:ring-2 focus:ring-purple-500/30 dark:focus:ring-cyan-500/30',
                            variable.required && 'border-amber-500/30'
                          )}
                        >
                          <span className="text-gray-500 dark:text-zinc-500">{'{{'}</span>
                          {variable.name}
                          <span className="text-gray-500 dark:text-zinc-500">{'}}'}</span>
                          {variable.required && (
                            <span className="text-amber-400 text-[10px]">*</span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 max-w-xs"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{variable.description}</p>
                          {variable.example && (
                            <p className="text-xs text-gray-600 dark:text-zinc-400">
                              Example: <code className="text-purple-500 dark:text-cyan-400">{variable.example}</code>
                            </p>
                          )}
                          {variable.required && (
                            <p className="text-xs text-amber-400">Required variable</p>
                          )}
                          <p className="text-[10px] text-gray-500 dark:text-zinc-500 mt-2">
                            Right-click to copy
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
            </div>
          )}

          {/* Editor tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex items-center justify-between">
              <TabsList className="bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                <TabsTrigger
                  value="editor"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-purple-500 dark:data-[state=active]:text-cyan-400"
                >
                  <Code2 className="h-4 w-4 mr-2" />
                  Editor
                </TabsTrigger>
                <TabsTrigger
                  value="preview"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-purple-500 dark:data-[state=active]:text-cyan-400"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </TabsTrigger>
              </TabsList>

              {/* Validation status */}
              <div className="flex items-center gap-2">
                {xmlError ? (
                  <div className="flex items-center gap-1.5 text-red-400 text-xs">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Invalid XML</span>
                  </div>
                ) : templateContent ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Valid XML</span>
                  </div>
                ) : null}
              </div>
            </div>

            <TabsContent value="editor" className="flex-1 min-h-0 mt-3">
              <div className="h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-[#1a1b26]">
                <CodeMirror
                  ref={editorRef}
                  value={templateContent}
                  height="400px"
                  theme={resolvedTheme === 'dark' ? tokyoNight : undefined}
                  extensions={[xml()]}
                  onChange={handleTemplateChange}
                  className="text-sm"
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    highlightActiveLine: true,
                    foldGutter: true,
                    autocompletion: true,
                    bracketMatching: true,
                  }}
                />
              </div>
              {xmlError && (
                <div className="mt-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{xmlError}</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="preview" className="flex-1 min-h-0 mt-3 space-y-3">
              {/* Preview variable inputs */}
              {prompt.variables && prompt.variables.length > 0 && (
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-400">
                    <Info className="h-3.5 w-3.5" />
                    <span>Enter test values to preview variable substitution</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {prompt.variables.slice(0, 6).map((variable) => (
                      <div key={variable.name} className="space-y-1">
                        <Label className="text-xs font-mono text-gray-500 dark:text-zinc-500">
                          {variable.name}
                        </Label>
                        <Input
                          value={previewData[variable.name] || ''}
                          onChange={(e) =>
                            setPreviewData((prev) => ({
                              ...prev,
                              [variable.name]: e.target.value,
                            }))
                          }
                          placeholder={variable.example || variable.name}
                          className="h-8 text-xs bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-zinc-100"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview output */}
              <ScrollArea className="h-[320px] rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-[#1a1b26]">
                <pre className="p-4 text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {preview}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-zinc-500">
              {isDirty ? (
                <span className="text-amber-400">Unsaved changes</span>
              ) : (
                <span>No changes</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !!xmlError || !isDirty}
                className="bg-purple-600 hover:bg-purple-500 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
