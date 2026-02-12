'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { trpc } from '@/lib/trpc/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'

interface ActivationSwitchProps {
  userId: string
  isActive: boolean
  disabled?: boolean
  onToggled?: () => void
}

export function ActivationSwitch({ userId, isActive, disabled, onToggled }: ActivationSwitchProps) {
  const t = useTranslations('admin.users')
  const [active, setActive] = useState(isActive)

  const utils = trpc.useUtils()
  const toggleMutation = trpc.admin.toggleUserActivation.useMutation({
    onSuccess: (_data, variables) => {
      setActive(variables.isActive)
      toast.success(variables.isActive ? t('success.userActivated') : t('success.userDeactivated'))
      void utils.admin.listUsers.invalidate()
      onToggled?.()
    },
    onError: (error) => {
      console.error('Failed to toggle activation:', error)
      toast.error(error.message || t('errors.activationFailed'))
      setActive(isActive) // Revert on error
    },
  })

  const handleToggle = (checked: boolean) => {
    setActive(checked) // Optimistic update
    toggleMutation.mutate({
      userId,
      isActive: checked,
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`activation-${userId}`}
        checked={active}
        onCheckedChange={handleToggle}
        disabled={disabled || toggleMutation.isPending}
        aria-label={t('actions.toggleActivation')}
      />
      <Label
        htmlFor={`activation-${userId}`}
        className="text-muted-foreground cursor-pointer text-xs"
      >
        {disabled ? t('status.you') : ''}
      </Label>
    </div>
  )
}
