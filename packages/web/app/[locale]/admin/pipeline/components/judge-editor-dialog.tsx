/**
 * JudgeEditorDialog Component
 *
 * Dialog for editing CLEV judge configuration settings.
 *
 * Features:
 * - ModelSelector for primary model
 * - Weight slider (0-1, step 0.01)
 * - Temperature slider (0-2, step 0.1)
 * - Max tokens input
 * - Active status switch
 * - Display-only language and judgeRole badges
 * - Form validation with react-hook-form + zod
 * - Toast notifications for success/error
 *
 * @module app/admin/pipeline/components/judge-editor-dialog
 */

'use client';

import { useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ModelSelector } from './model-selector';
import { updateJudgeConfig } from '@/app/actions/pipeline-admin';
import type { JudgeConfig } from '@megacampus/shared-types';

// Form validation schema
const formSchema = z.object({
  modelId: z.string().min(1, 'Model is required'),
  weight: z.number().min(0).max(1),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(128000),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface JudgeEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  judge: JudgeConfig | null;
  onSaved?: () => void;
}

/**
 * Get role badge color based on judgeRole
 */
function getRoleBadgeColor(role: 'primary' | 'secondary' | 'tiebreaker') {
  switch (role) {
    case 'primary':
      return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30';
    case 'secondary':
      return 'text-blue-400 border-blue-500/30 bg-blue-950/30';
    case 'tiebreaker':
      return 'text-purple-400 border-purple-500/30 bg-purple-950/30';
  }
}

/**
 * Edit judge configuration dialog
 */
export function JudgeEditorDialog({
  open,
  onOpenChange,
  judge,
  onSaved,
}: JudgeEditorDialogProps) {
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
      weight: 0.75,
      temperature: 0.3,
      maxTokens: 4096,
      isActive: true,
    },
  });

  // Watch form values for controlled components
  const modelId = watch('modelId');
  const weight = watch('weight');
  const temperature = watch('temperature');
  const isActive = watch('isActive');

  // Reset form when judge changes
  useEffect(() => {
    if (judge && open) {
      reset({
        modelId: judge.modelId,
        weight: judge.weight,
        temperature: judge.temperature,
        maxTokens: judge.maxTokens,
        isActive: judge.isActive,
      });
    }
  }, [judge, open, reset]);

  // Handle form submission
  const onSubmit = async (data: FormValues) => {
    if (!judge) return;

    try {
      await updateJudgeConfig({
        id: judge.id,
        modelId: data.modelId !== judge.modelId ? data.modelId : undefined,
        weight: data.weight !== judge.weight ? data.weight : undefined,
        temperature: data.temperature !== judge.temperature ? data.temperature : undefined,
        maxTokens: data.maxTokens !== judge.maxTokens ? data.maxTokens : undefined,
        isActive: data.isActive !== judge.isActive ? data.isActive : undefined,
      });

      toast.success('Judge configuration updated successfully');
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update judge configuration');
    }
  };

  if (!judge) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950 border-gray-200 dark:border-slate-700 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100 text-xl font-semibold">
            Edit Judge Configuration
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-300">
            Update CLEV judge settings for{' '}
            <span className="inline-flex items-center rounded-md border border-purple-500/30 dark:border-cyan-500/30 bg-gray-100 dark:bg-slate-900 px-2 py-0.5 text-xs font-semibold text-purple-500 dark:text-cyan-400">
              {judge.displayName}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Display-only fields: language and judgeRole */}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-900 p-3">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-gray-100">Language:</span>
                <Badge
                  variant="outline"
                  className="border-cyan-500/30 bg-cyan-950/30 text-cyan-400"
                >
                  {judge.language}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-gray-100">Role:</span>
                <Badge
                  variant="outline"
                  className={getRoleBadgeColor(judge.judgeRole)}
                >
                  {judge.judgeRole}
                </Badge>
              </div>
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

          {/* Weight slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Weight</Label>
              <span className="text-sm text-purple-500 dark:text-cyan-400 font-semibold bg-gray-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-purple-500/30 dark:border-cyan-500/30">
                {weight.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[weight]}
              onValueChange={(values) =>
                setValue('weight', values[0], { shouldValidate: true })
              }
              min={0}
              max={1}
              step={0.01}
              className="w-full [&_[role=slider]]:bg-purple-500 dark:[&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-purple-500 dark:[&_[role=slider]]:border-cyan-400"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500">
              <span>0 (Low influence)</span>
              <span>0.5 (Medium)</span>
              <span>1 (High influence)</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Voting weight in the CLEV consensus system
            </p>
            {errors.weight && (
              <p className="text-sm text-red-400">{errors.weight.message}</p>
            )}
          </div>

          {/* Temperature slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Temperature</Label>
              <span className="text-sm text-purple-500 dark:text-cyan-400 font-semibold bg-gray-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-purple-500/30 dark:border-cyan-500/30">
                {temperature.toFixed(1)}
              </span>
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
            <Label htmlFor="maxTokens" className="text-gray-900 dark:text-gray-100 font-medium">
              Maximum Output Tokens
            </Label>
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

          {/* Active status switch */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-900 p-4">
            <div className="space-y-0.5">
              <Label htmlFor="isActive" className="text-gray-900 dark:text-gray-100 font-medium cursor-pointer">
                Active Status
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Enable or disable this judge in the voting system
              </p>
            </div>
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) =>
                setValue('isActive', checked, { shouldValidate: true })
              }
            />
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
