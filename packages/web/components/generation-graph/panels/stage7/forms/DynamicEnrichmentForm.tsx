'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getFormConfig,
  getDefaultSettings,
  type CreateableEnrichmentType,
  type FormFieldConfig,
} from './enrichment-form-config'

export interface DynamicEnrichmentFormProps {
  type: CreateableEnrichmentType
  onSubmit: (settings: Record<string, unknown>) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  isSubmitting: boolean
}

/**
 * Generic form component that renders fields from the enrichment form config registry.
 * Supports select, slider, and checkbox field widgets.
 * For types with no settings (e.g. document), shows a description and Create button only.
 */
export function DynamicEnrichmentForm({
  type,
  onSubmit,
  onCancel,
  onDirtyChange,
  isSubmitting,
}: DynamicEnrichmentFormProps) {
  const t = useTranslations('enrichments')
  const formConfig = getFormConfig(type)
  const [values, setValues] = useState<Record<string, unknown>>(() => getDefaultSettings(type))

  const updateField = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    onDirtyChange(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  const renderField = (field: FormFieldConfig) => {
    const labelText = t(`forms.${formConfig!.formKey}.${field.labelKey}` as Parameters<typeof t>[0])
    const currentValue = values[field.name]

    if (field.widget === 'select' && field.options) {
      return (
        <div key={field.name}>
          <Label>{labelText}</Label>
          <Select
            value={String((currentValue ?? field.defaultValue) as string | number)}
            onValueChange={(v) => updateField(field.name, v)}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(`forms.${formConfig!.formKey}.${option.labelKey}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    if (field.widget === 'slider') {
      const numValue =
        typeof currentValue === 'number' ? currentValue : (field.defaultValue as number)
      const displayValue = field.formatValue ? field.formatValue(numValue) : String(numValue)

      return (
        <div key={field.name}>
          <Label>{labelText}</Label>
          <Slider
            value={[numValue]}
            onValueChange={([v]) => updateField(field.name, v)}
            min={field.min}
            max={field.max}
            step={field.step}
            className="mt-2"
          />
          <span className="text-muted-foreground mt-1 block text-sm">{displayValue}</span>
        </div>
      )
    }

    if (field.widget === 'checkbox') {
      const checked =
        typeof currentValue === 'boolean' ? currentValue : (field.defaultValue as boolean)

      return (
        <div key={field.name} className="flex items-center space-x-2">
          <Checkbox
            id={field.name}
            checked={checked}
            onCheckedChange={(v) => updateField(field.name, Boolean(v))}
          />
          <Label htmlFor={field.name} className="cursor-pointer">
            {labelText}
          </Label>
        </div>
      )
    }

    return null
  }

  // Types with no form config show a description + direct create button
  if (!formConfig) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="text-muted-foreground text-sm">
          {t(`typeDescriptions.${type}` as Parameters<typeof t>[0])}
        </p>
        <div className="flex gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            {t('forms.common.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('forms.common.create')}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">{formConfig.fields.map(renderField)}</div>
      <div className="flex gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          {t('forms.common.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('forms.common.create')}
        </Button>
      </div>
    </form>
  )
}
