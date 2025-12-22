/**
 * Context Reserve Settings Component
 *
 * Manage language-specific context reserve percentages for dynamic model selection.
 *
 * Features:
 * - Three sliders for EN, RU, ANY reserve percentages (0-100%)
 * - Real-time threshold calculation examples
 * - Save button with loading state
 * - Toast notifications for success/error
 *
 * @module app/admin/pipeline/components/context-reserve-settings
 */

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Percent, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  listContextReserveSettings,
  updateContextReserveSetting,
} from '@/app/actions/pipeline-admin';

interface ReserveSettings {
  en: number;
  ru: number;
  any: number;
}

/**
 * Format percentage for display (0.15 → "15%")
 */
function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Calculate threshold example for display
 * Example: 128K model with 15% reserve → "109K threshold"
 */
function calculateThresholdExample(modelSize: number, reservePercent: number): string {
  const threshold = Math.floor(modelSize * (1 - reservePercent));
  return `${(threshold / 1000).toFixed(0)}K`;
}

/**
 * Context Reserve Settings Panel
 */
export function ContextReserveSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<ReserveSettings>({
    en: 0.15,
    ru: 0.25,
    any: 0.20,
  });
  const [originalSettings, setOriginalSettings] = useState<ReserveSettings>({
    en: 0.15,
    ru: 0.25,
    any: 0.20,
  });

  // Load settings on mount
  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await listContextReserveSettings();
        const data = result.result?.data || result.result || result;

        const newSettings: ReserveSettings = {
          en: data.find((s: { language: string }) => s.language === 'en')?.reservePercent ?? 0.15,
          ru: data.find((s: { language: string }) => s.language === 'ru')?.reservePercent ?? 0.25,
          any: data.find((s: { language: string }) => s.language === 'any')?.reservePercent ?? 0.20,
        };

        setSettings(newSettings);
        setOriginalSettings(newSettings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load context reserve settings');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const languages = ['en', 'ru', 'any'] as const;

      const results = await Promise.allSettled([
        updateContextReserveSetting({ language: 'en', reservePercent: settings.en }),
        updateContextReserveSetting({ language: 'ru', reservePercent: settings.ru }),
        updateContextReserveSetting({ language: 'any', reservePercent: settings.any }),
      ]);

      const failures = results
        .map((result, idx) => ({ result, lang: languages[idx] }))
        .filter((item): item is { result: PromiseRejectedResult; lang: typeof languages[number] } =>
          item.result.status === 'rejected'
        );

      if (failures.length > 0) {
        const failedLangs = failures.map(f => f.lang.toUpperCase()).join(', ');
        // Extract error messages for debugging
        const errorDetails = failures
          .map(f => {
            const reason = f.result.reason;
            return `${f.lang.toUpperCase()}: ${reason?.message || 'Unknown error'}`;
          })
          .join('; ');

        toast.warning(`Partially saved: Failed to update ${failedLangs}. ${errorDetails}`, {
          duration: 8000,
        });
      } else {
        // Check if any update reported cache clear failure
        const successResults = results.filter(
          (r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled'
        );

        const anyCacheFailure = successResults.some(r => {
          const data = (r.value as { result?: { data?: { cacheCleared?: boolean } } })?.result?.data;
          return data?.cacheCleared === false;
        });

        if (anyCacheFailure) {
          toast.success('Settings saved. Note: Cache refresh may take up to 5 minutes.', {
            duration: 5000,
          });
        } else {
          toast.success('All context reserve settings saved successfully');
        }
      }

      setOriginalSettings(settings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty =
    settings.en !== originalSettings.en ||
    settings.ru !== originalSettings.ru ||
    settings.any !== originalSettings.any;

  // Error state
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Failed to load context reserve settings
          </CardTitle>
          <CardDescription className="text-destructive/80">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Context Reserve Settings
          </CardTitle>
          <CardDescription>
            Configure language-specific context reserves for dynamic model selection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {['en', 'ru', 'any'].map((lang) => (
            <div key={lang} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-64" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5" />
          Context Reserve Settings
        </CardTitle>
        <CardDescription>
          Configure language-specific context reserves for dynamic model selection. Reserve
          percentage determines how much context is kept free for system prompts and safety margin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* English Reserve */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="en-reserve" className="text-base font-medium">
              English (EN) Reserve
            </Label>
            <span className="text-sm font-mono text-muted-foreground">
              {formatPercent(settings.en)}
            </span>
          </div>
          <Slider
            id="en-reserve"
            min={0}
            max={0.5}
            step={0.01}
            value={[settings.en]}
            onValueChange={([value]) => setSettings({ ...settings, en: value })}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              128K model → <strong>{calculateThresholdExample(128000, settings.en)}</strong>{' '}
              threshold
            </p>
            <p>
              200K model → <strong>{calculateThresholdExample(200000, settings.en)}</strong>{' '}
              threshold
            </p>
          </div>
        </div>

        <Separator />

        {/* Russian Reserve */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ru-reserve" className="text-base font-medium">
              Russian (RU) Reserve
            </Label>
            <span className="text-sm font-mono text-muted-foreground">
              {formatPercent(settings.ru)}
            </span>
          </div>
          <Slider
            id="ru-reserve"
            min={0}
            max={0.5}
            step={0.01}
            value={[settings.ru]}
            onValueChange={([value]) => setSettings({ ...settings, ru: value })}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              128K model → <strong>{calculateThresholdExample(128000, settings.ru)}</strong>{' '}
              threshold
            </p>
            <p>
              200K model → <strong>{calculateThresholdExample(200000, settings.ru)}</strong>{' '}
              threshold
            </p>
          </div>
        </div>

        <Separator />

        {/* Fallback (ANY) Reserve */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="any-reserve" className="text-base font-medium">
              Fallback (ANY) Reserve
            </Label>
            <span className="text-sm font-mono text-muted-foreground">
              {formatPercent(settings.any)}
            </span>
          </div>
          <Slider
            id="any-reserve"
            min={0}
            max={0.5}
            step={0.01}
            value={[settings.any]}
            onValueChange={([value]) => setSettings({ ...settings, any: value })}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              128K model → <strong>{calculateThresholdExample(128000, settings.any)}</strong>{' '}
              threshold
            </p>
            <p>
              200K model → <strong>{calculateThresholdExample(200000, settings.any)}</strong>{' '}
              threshold
            </p>
            <p className="text-yellow-600 dark:text-yellow-500">
              Used as fallback when specific language not configured
            </p>
          </div>
        </div>

        <Separator />

        {/* Save Button */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
