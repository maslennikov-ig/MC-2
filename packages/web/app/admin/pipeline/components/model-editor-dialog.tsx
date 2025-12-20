/**
 * ModelEditorDialog Component (T034)
 *
 * Dialog for editing model configuration settings.
 *
 * Features:
 * - ModelSelector for primary and fallback models
 * - Temperature slider (0-2, step 0.1)
 * - Max tokens input
 * - Optional course selector for overrides
 * - Form validation with react-hook-form + zod
 * - Toast notifications for success/error
 *
 * @module app/admin/pipeline/components/model-editor-dialog
 */

'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { ModelSelector } from './model-selector';
import { updateModelConfig } from '@/app/actions/pipeline-admin';
import type { ModelConfigWithVersion } from '@megacampus/shared-types';

// Form validation schema
const formSchema = z.object({
  modelId: z.string().min(1, 'Model is required'),
  fallbackModelId: z.string().nullable(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(128000),
  courseId: z.string().uuid().nullable(),
  // Per-stage settings
  qualityThreshold: z.number().min(0).max(1).nullable(),
  maxRetries: z.number().int().min(0).max(10).nullable(),
  timeoutMs: z.number().int().min(1000).nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface ModelEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ModelConfigWithVersion | null;
  onSaved?: () => void;
}

/**
 * Edit model configuration dialog
 */
export function ModelEditorDialog({
  open,
  onOpenChange,
  config,
  onSaved,
}: ModelEditorDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      modelId: '',
      fallbackModelId: null,
      temperature: 0.7,
      maxTokens: 4096,
      courseId: null,
      qualityThreshold: null,
      maxRetries: null,
      timeoutMs: null,
    },
  });

  // Watch form values for controlled components
  const modelId = watch('modelId');
  const fallbackModelId = watch('fallbackModelId');
  const temperature = watch('temperature');
  const qualityThreshold = watch('qualityThreshold');
  const maxRetries = watch('maxRetries');
  const timeoutMs = watch('timeoutMs');

  // State for checkbox toggles
  const [useCustomQuality, setUseCustomQuality] = useState(false);
  const [useTimeout, setUseTimeout] = useState(false);

  // Reset form when config changes
  useEffect(() => {
    if (config && open) {
      reset({
        modelId: config.modelId,
        fallbackModelId: config.fallbackModelId || null,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        courseId: config.courseId || null,
        qualityThreshold: config.qualityThreshold || null,
        maxRetries: config.maxRetries ?? null,
        timeoutMs: config.timeoutMs || null,
      });
      // Update checkbox states
      setUseCustomQuality(config.qualityThreshold !== null);
      setUseTimeout(config.timeoutMs !== null);
    }
  }, [config, open, reset]);

  // Handle form submission
  const onSubmit = async (data: FormValues) => {
    if (!config) return;

    try {
      await updateModelConfig({
        id: config.id,
        modelId: data.modelId !== config.modelId ? data.modelId : undefined,
        fallbackModelId:
          data.fallbackModelId !== config.fallbackModelId ? data.fallbackModelId : undefined,
        temperature: data.temperature !== config.temperature ? data.temperature : undefined,
        maxTokens: data.maxTokens !== config.maxTokens ? data.maxTokens : undefined,
        courseId: data.courseId !== config.courseId ? data.courseId : undefined,
        qualityThreshold: data.qualityThreshold !== config.qualityThreshold ? data.qualityThreshold : undefined,
        maxRetries: data.maxRetries !== config.maxRetries ? data.maxRetries : undefined,
        timeoutMs: data.timeoutMs !== config.timeoutMs ? data.timeoutMs : undefined,
      });

      toast.success('Configuration updated successfully');
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      // Check for CONFLICT error (optimistic locking failure)
      if (
        error instanceof Error &&
        error.message.includes('CONFLICT') ||
        (typeof error === 'object' && error !== null && 'code' in error && error.code === 'CONFLICT')
      ) {
        toast.error(
          'Configuration was modified by another user. Please close and reopen to get the latest version.',
          { duration: 5000 }
        );
        return;
      }

      // Handle other errors
      toast.error(error instanceof Error ? error.message : 'Failed to update configuration');
    }
  };

  if (!config) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950 border-gray-200 dark:border-slate-700 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100 text-xl font-semibold">Edit Model Configuration</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-300">
            Update model settings for{' '}
            <span className="inline-flex items-center rounded-md border border-purple-500/30 dark:border-cyan-500/30 bg-gray-100 dark:bg-slate-900 px-2 py-0.5 text-xs font-semibold text-purple-500 dark:text-cyan-400">
              {config.phaseName}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Phase name (read-only display) */}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-900 p-3">
            <div className="text-sm text-gray-900 dark:text-gray-100">
              <span className="font-medium">Phase:</span> {config.phaseName}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Version {config.version} • Last updated: {new Date(config.updatedAt).toLocaleString()}
            </div>
          </div>

          {/* Primary model selector */}
          <div>
            <ModelSelector
              value={modelId}
              onValueChange={(value) => setValue('modelId', value, { shouldValidate: true })}
              label="Primary Model"
              placeholder="Select primary model..."
            />
            {errors.modelId && (
              <p className="text-sm text-red-400 mt-1">{errors.modelId.message}</p>
            )}
          </div>

          {/* Fallback model selector */}
          <div>
            <ModelSelector
              value={fallbackModelId || ''}
              onValueChange={(value) =>
                setValue('fallbackModelId', value || null, { shouldValidate: true })
              }
              label="Fallback Model (Optional)"
              placeholder="Select fallback model..."
            />
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Used if primary model fails or produces low-quality output
            </p>
          </div>

          {/* Temperature slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Temperature</Label>
              <span className="text-sm text-purple-500 dark:text-cyan-400 font-semibold bg-gray-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-purple-500/30 dark:border-cyan-500/30">{temperature.toFixed(1)}</span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={(values) =>
                setValue('temperature', values[0], { shouldValidate: true })
              }
              min={0}
              max={2}
              step={0.1}
              className="w-full [&_[role=slider]]:bg-purple-500 dark:[&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-purple-500 dark:[&_[role=slider]]:border-cyan-400"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500">
              <span>0 (Deterministic)</span>
              <span>1 (Balanced)</span>
              <span>2 (Creative)</span>
            </div>
            {errors.temperature && (
              <p className="text-sm text-red-400">{errors.temperature.message}</p>
            )}
          </div>

          {/* Max tokens input */}
          <div className="space-y-2">
            <Label htmlFor="maxTokens" className="text-gray-900 dark:text-gray-100 font-medium">Maximum Output Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              {...register('maxTokens', { valueAsNumber: true })}
              min={1}
              max={128000}
              placeholder="e.g., 4096"
              className="bg-gray-100 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Limits the length of model-generated responses (1-128,000)
            </p>
            {errors.maxTokens && (
              <p className="text-sm text-red-400">{errors.maxTokens.message}</p>
            )}
          </div>

          {/* Phase Settings Section */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Phase Settings</h3>

            {/* Quality Threshold */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useCustomQuality"
                  checked={useCustomQuality}
                  onCheckedChange={(checked) => {
                    setUseCustomQuality(!!checked);
                    if (!checked) {
                      setValue('qualityThreshold', null, { shouldValidate: true });
                    } else {
                      setValue('qualityThreshold', 0.75, { shouldValidate: true });
                    }
                  }}
                  className="border-gray-300 dark:border-slate-600 data-[state=checked]:bg-purple-500 dark:data-[state=checked]:bg-cyan-500 data-[state=checked]:border-purple-500 dark:data-[state=checked]:border-cyan-500"
                />
                <Label htmlFor="useCustomQuality" className="text-gray-900 dark:text-gray-100 font-medium cursor-pointer">
                  Use custom quality threshold
                </Label>
              </div>
              {useCustomQuality && qualityThreshold !== null && (
                <div className="space-y-2 pl-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Quality Threshold</span>
                    <span className="text-sm text-purple-500 dark:text-cyan-400 font-semibold bg-gray-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-purple-500/30 dark:border-cyan-500/30">
                      {(qualityThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    value={[qualityThreshold * 100]}
                    onValueChange={(values) =>
                      setValue('qualityThreshold', values[0] / 100, { shouldValidate: true })
                    }
                    min={0}
                    max={100}
                    step={5}
                    className="w-full [&_[role=slider]]:bg-purple-500 dark:[&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-purple-500 dark:[&_[role=slider]]:border-cyan-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Minimum quality score (0-100%). If unchecked, uses default (75%)
                  </p>
                </div>
              )}
              {!useCustomQuality && (
                <p className="text-xs text-gray-500 dark:text-gray-500 pl-6">Default: 75%</p>
              )}
            </div>

            {/* Max Retries */}
            <div className="space-y-2">
              <Label htmlFor="maxRetries" className="text-gray-900 dark:text-gray-100 font-medium">
                Max Retries
              </Label>
              <Input
                id="maxRetries"
                type="number"
                value={maxRetries ?? 3}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  setValue('maxRetries', value, { shouldValidate: true });
                }}
                min={0}
                max={10}
                placeholder="3"
                className="bg-gray-100 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Number of retry attempts on failure (0-10, default: 3)
              </p>
              {errors.maxRetries && (
                <p className="text-sm text-red-400">{errors.maxRetries.message}</p>
              )}
            </div>

            {/* Timeout */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useTimeout"
                  checked={useTimeout}
                  onCheckedChange={(checked) => {
                    setUseTimeout(!!checked);
                    if (!checked) {
                      setValue('timeoutMs', null, { shouldValidate: true });
                    } else {
                      setValue('timeoutMs', 60000, { shouldValidate: true });
                    }
                  }}
                  className="border-gray-300 dark:border-slate-600 data-[state=checked]:bg-purple-500 dark:data-[state=checked]:bg-cyan-500 data-[state=checked]:border-purple-500 dark:data-[state=checked]:border-cyan-500"
                />
                <Label htmlFor="useTimeout" className="text-gray-900 dark:text-gray-100 font-medium cursor-pointer">
                  Set timeout
                </Label>
              </div>
              {useTimeout && timeoutMs !== null && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="timeoutSeconds" className="text-sm text-gray-600 dark:text-gray-300">
                    Timeout (seconds)
                  </Label>
                  <Input
                    id="timeoutSeconds"
                    type="number"
                    value={Math.round(timeoutMs / 1000)}
                    onChange={(e) => {
                      const seconds = parseInt(e.target.value, 10);
                      if (!isNaN(seconds) && seconds >= 1) {
                        setValue('timeoutMs', seconds * 1000, { shouldValidate: true });
                      }
                    }}
                    min={1}
                    placeholder="60"
                    className="bg-gray-100 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Maximum execution time in seconds (minimum 1s)
                  </p>
                </div>
              )}
              {!useTimeout && (
                <p className="text-xs text-gray-500 dark:text-gray-500 pl-6">No timeout (infinite)</p>
              )}
              {errors.timeoutMs && (
                <p className="text-sm text-red-400">{errors.timeoutMs.message}</p>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-gray-200 dark:border-slate-700 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="admin-btn-primary">
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
