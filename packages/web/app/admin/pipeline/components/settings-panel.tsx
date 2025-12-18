/**
 * SettingsPanel Component (T050)
 *
 * Display and edit global pipeline settings.
 *
 * Features:
 * - RAG token budget input (1000-100000)
 * - Save button with loading state
 * - Toast notifications for success/error
 *
 * @module app/admin/pipeline/components/settings-panel
 */

'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Settings, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getGlobalSettings, updateGlobalSettings } from '@/app/actions/pipeline-admin';
import type { GlobalSettings } from '@megacampus/shared-types';
import { globalSettingsSchema } from '@megacampus/shared-types';

/**
 * Settings Panel - Edit global pipeline settings
 */
export function SettingsPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<GlobalSettings>({
    resolver: zodResolver(globalSettingsSchema),
    defaultValues: {
      ragTokenBudget: 20000,
    },
  });

  // Load settings on mount
  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getGlobalSettings();
        const data = result.result?.data || result.result;
        form.reset(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [form]);

  const onSubmit = async (data: GlobalSettings) => {
    try {
      setIsSaving(true);
      await updateGlobalSettings(data);
      toast.success('Settings updated successfully');
      // Reset form dirty state after successful save
      form.reset(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-destructive" />
          <div>
            <h3 className="font-semibold text-destructive">Failed to load settings</h3>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-64 max-w-2xl" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold" style={{ color: 'rgb(var(--admin-text-primary))' }}>
          Global Settings
        </h2>
        <p className="text-sm mt-1" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
          Configure global pipeline settings
        </p>
      </div>

      {/* Main settings card */}
      <div>
        {/* RAG Token Budget Card */}
        <Card className="admin-glass-card max-w-2xl">
          <CardHeader>
            <CardTitle style={{ color: 'rgb(var(--admin-text-primary))' }}>
              RAG Token Budget
            </CardTitle>
            <CardDescription style={{ color: 'rgb(var(--admin-text-secondary))' }}>
              Configure the maximum token budget for RAG operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="ragTokenBudget" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
                Token Budget
              </Label>
              <Input
                id="ragTokenBudget"
                type="number"
                min={1000}
                max={100000}
                step={1000}
                {...form.register('ragTokenBudget', { valueAsNumber: true })}
                className="bg-transparent border-cyan-500/20 focus:border-cyan-500/50 text-white"
              />
              <p className="text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
                Range: 1,000 - 100,000 tokens (default: 20,000)
              </p>
              {form.formState.errors.ragTokenBudget && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.ragTokenBudget.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isSaving || !form.formState.isDirty}
          className="admin-btn-primary px-6 py-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
        {form.formState.isDirty && (
          <p className="text-sm text-amber-400 font-medium">You have unsaved changes</p>
        )}
      </div>
    </form>
  );
}
