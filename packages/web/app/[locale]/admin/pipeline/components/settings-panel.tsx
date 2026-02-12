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

'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Settings, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc/react'
import type { GlobalSettings } from '@megacampus/shared-types'
import { globalSettingsSchema } from '@megacampus/shared-types'

/**
 * Settings Panel - Edit global pipeline settings
 */
export function SettingsPanel() {
  const { data: settings, isLoading, error } = trpc.pipelineAdmin.getGlobalSettings.useQuery()

  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<GlobalSettings>({
    resolver: zodResolver(globalSettingsSchema),
    defaultValues: {
      ragTokenBudget: 20000,
    },
  })

  // Reset form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset(settings)
    }
  }, [settings, form])

  const updateMutation = trpc.pipelineAdmin.updateGlobalSettings.useMutation({
    onSuccess: (data) => {
      toast.success('Settings updated successfully')
      form.reset(data)
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update settings')
    },
    onSettled: () => {
      setIsSaving(false)
    },
  })

  const onSubmit = (data: GlobalSettings) => {
    setIsSaving(true)
    updateMutation.mutate(data)
  }

  // Error state
  if (error) {
    return (
      <div className="border-destructive bg-destructive/10 rounded-lg border p-6">
        <div className="flex items-center gap-3">
          <Settings className="text-destructive h-5 w-5" />
          <div>
            <h3 className="text-destructive font-semibold">Failed to load settings</h3>
            <p className="text-destructive/80 mt-1 text-sm">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="mb-2 h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-64 max-w-2xl" />
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold" style={{ color: 'rgb(var(--admin-text-primary))' }}>
          Global Settings
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
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
                className="border-cyan-500/20 bg-transparent text-white focus:border-cyan-500/50"
              />
              <p className="text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
                Range: 1,000 - 100,000 tokens (default: 20,000)
              </p>
              {form.formState.errors.ragTokenBudget && (
                <p className="text-destructive text-xs">
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
        {form.formState.isDirty && (
          <p className="text-sm font-medium text-amber-400">You have unsaved changes</p>
        )}
      </div>
    </form>
  )
}
